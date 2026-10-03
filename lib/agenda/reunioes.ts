import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { tokenDaReuniao } from "@/lib/agenda/segredos";
import { dadosDaReuniao, linkGerenciar } from "@/lib/agenda/envio";
import { dispararAlerta } from "@/lib/agenda/regua";
import { DURACAO_MIN, proximosDiasUteis } from "@/lib/agenda/tempo";
import { gradeDaPessoa, livreNoHorario, ocupadoDaPessoa, pessoasAtivas, type PessoaComContas } from "@/lib/agenda/disponibilidade";
import { buscarEvento, cancelarEvento, criarEvento, googleAgendaConfigurado, linkDoMeet, moverEvento } from "@/lib/agenda/google";
import { FAIXAS_ATENDIDAS, ehLeadDeTeste } from "@/lib/agenda/lead";

/**
 * MARCAR, REMARCAR E CANCELAR A DEMONSTRAÇÃO (01/10).
 *
 * A ordem é sempre a mesma: (1) confere de novo que o horário está livre com
 * as fontes de fora, (2) grava no banco dentro de uma transação com trava por
 * pessoa, (3) só então mexe na agenda Google e manda os e-mails. O banco é a
 * verdade: se o Google ou o e-mail falharem, a reunião existe e aparece no
 * /admin, e o time resolve à mão; o contrário (evento no Google sem linha no
 * banco) seria reunião que ninguém vê.
 */

export class ErroDeAgenda extends Error {
  constructor(mensagem: string, public status = 409, public extra: Record<string, unknown> = {}) {
    super(mensagem);
  }
}

// Os links, os destinos e o envio moraram aqui até a régua de alertas (01/10);
// agora vivem em lib/agenda/envio.ts e continuam exportados daqui.
export { base, linkGerenciar, linkAdmin, destinosDoTime, enviarDaAgenda, dadosDaReuniao } from "@/lib/agenda/envio";

/**
 * O RODÍZIO: quem atendeu menos nos últimos 30 dias vem primeiro; empate vai
 * para quem recebeu a última há mais tempo, depois para a ordem do admin.
 * Conta reunião cancelada também, porque o rodízio é de quem RECEBEU o lead.
 */
async function emOrdemDeRodizio(pessoas: PessoaComContas[]): Promise<PessoaComContas[]> {
  const desde = new Date(Date.now() - 30 * 86400000);
  const linhas = await prisma.reuniaoDeDemonstracao.groupBy({
    by: ["pessoaId"],
    where: { createdAt: { gte: desde }, teste: false },
    _count: { _all: true },
    _max: { createdAt: true },
  });
  const porPessoa = new Map(linhas.map((l) => [l.pessoaId, { n: l._count._all, ultima: l._max.createdAt?.getTime() ?? 0 }]));
  return [...pessoas].sort((a, b) => {
    const x = porPessoa.get(a.id) ?? { n: 0, ultima: 0 };
    const y = porPessoa.get(b.id) ?? { n: 0, ultima: 0 };
    return x.n - y.n || x.ultima - y.ultima || a.ordem - b.ordem;
  });
}

/** O horário pedido é um início de grade da pessoa e ela está livre nele, com as fontes de fora? */
async function pessoaLivre(p: PessoaComContas, inicio: Date, agora: Date, ignorar?: string | null): Promise<boolean> {
  const naGrade = gradeDaPessoa(p, proximosDiasUteis(agora), agora).some((g) => g.getTime() === inicio.getTime());
  if (!naGrade) return false;
  const folga = (p.intervaloMin + 60) * 60_000;
  const ocupado = await ocupadoDaPessoa(p, new Date(inicio.getTime() - folga), new Date(inicio.getTime() + DURACAO_MIN * 60_000 + folga), ignorar);
  return ocupado.ok && livreNoHorario(inicio, ocupado.intervalos, p.intervaloMin);
}

/**
 * Grava a reunião para a pessoa, ou devolve null se alguém pegou o horário
 * antes. A trava por pessoa (pg_advisory_xact_lock) serializa duas marcações
 * simultâneas da mesma pessoa; o índice único parcial é a última barreira.
 */
async function gravarParaPessoa(args: {
  p: PessoaComContas; inicio: Date; fim: Date; leadId: string; escolha: string; teste: boolean; reuniaoId?: string | null;
}): Promise<{ id: string } | null> {
  const { p, inicio, fim } = args;
  const folga = p.intervaloMin * 60_000;
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(hashtext(${`agenda:${p.id}`}))) AS trava`;
      const conflito = await tx.reuniaoDeDemonstracao.findFirst({
        where: {
          pessoaId: p.id,
          status: "marcada",
          inicio: { lt: new Date(fim.getTime() + folga) },
          fim: { gt: new Date(inicio.getTime() - folga) },
          ...(args.reuniaoId ? { id: { not: args.reuniaoId } } : {}),
        },
        select: { id: true },
      });
      if (conflito) return null;
      if (args.reuniaoId) {
        return tx.reuniaoDeDemonstracao.update({
          where: { id: args.reuniaoId },
          data: {
            pessoaId: p.id, inicio, fim, escolha: args.escolha, fonte: p.fonte,
            sequencia: { increment: 1 }, lembrete24hEm: null, lembrete1hEm: null,
            // Horário novo, sinais novos: o "começou" e a presença eram do horário velho.
            comecouEm: null, leadEntrouEm: null,
          },
          select: { id: true },
        });
      }
      return tx.reuniaoDeDemonstracao.create({
        data: {
          leadId: args.leadId, pessoaId: p.id, inicio, fim, escolha: args.escolha, fonte: p.fonte,
          uid: `${randomUUID()}@demandou.com`, teste: args.teste,
          linkReuniao: p.linkSala ?? null,
        },
        select: { id: true },
      });
    });
  } catch (e) {
    // P2002: o índice único parcial pegou a corrida que a trava não viu (outra
    // instância com outra conexão). O horário é de quem chegou primeiro.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null;
    throw e;
  }
}

/** A conta Google onde o evento nasce: a principal, ou a primeira conectada. */
function contaPrincipal(p: PessoaComContas) {
  return p.contasGoogle.find((c) => c.principal) ?? p.contasGoogle[0] ?? null;
}

/**
 * O LADO GOOGLE depois de gravar: cria, move ou troca o evento de agenda.
 * Falha aqui NÃO desfaz a reunião: ela fica com a sala fixa da pessoa (ou sem
 * link) e o erro vai para o log e para a conta no /admin.
 *
 * O EVENTO NASCE SEMPRE QUE A PESSOA TEM CONTA GOOGLE CONECTADA (01/10, régua
 * de alertas), qualquer que seja a fonte. A fonte decide só de onde vem o
 * OCUPADO (manual = janelas e banco; google = janelas menos o freeBusy). Antes,
 * fonte manual com conta conectada (o caso do Bruno no dia em que conectou)
 * dava reunião sem evento, sem Meet e, sem sala fixa, sem link nenhum.
 */
async function sincronizarGoogle(reuniaoId: string, p: PessoaComContas, antes: { pessoaId: string; eventoGoogleId: string | null; contaGoogleId: string | null } | null) {
  const r = await prisma.reuniaoDeDemonstracao.findUnique({ where: { id: reuniaoId }, include: { lead: true } });
  if (!r) return;
  const usaGoogle = googleAgendaConfigurado() && !r.teste;
  const conta = usaGoogle ? contaPrincipal(p) : null;

  // O evento antigo estava em outra conta (pessoa trocou, ou deixou de ser google): sai de lá.
  if (antes?.eventoGoogleId && antes.contaGoogleId && antes.contaGoogleId !== conta?.id) {
    const velha = await prisma.contaGoogleDoTime.findUnique({ where: { id: antes.contaGoogleId } });
    if (velha) await cancelarEvento(velha.refreshTokenCifrado, antes.eventoGoogleId).catch((e) => console.error("[agenda] cancelar evento antigo falhou:", e));
    await prisma.reuniaoDeDemonstracao.update({ where: { id: r.id }, data: { eventoGoogleId: null, contaGoogleId: null } });
  }

  if (!conta) {
    // Sem Google: a sala fixa da pessoa (que pode ter mudado na remarcação).
    if (antes && antes.pessoaId !== p.id) await prisma.reuniaoDeDemonstracao.update({ where: { id: r.id }, data: { linkReuniao: p.linkSala ?? null } });
    return;
  }
  try {
    if (antes?.eventoGoogleId && antes.contaGoogleId === conta.id) {
      const ev = await moverEvento(conta.refreshTokenCifrado, antes.eventoGoogleId, r.inicio, r.fim);
      const link = linkDoMeet(ev);
      if (link && link !== r.linkReuniao) await prisma.reuniaoDeDemonstracao.update({ where: { id: r.id }, data: { linkReuniao: link } });
      return;
    }
    let ev = await criarEvento(conta.refreshTokenCifrado, {
      uid: r.uid,
      inicio: r.inicio,
      fim: r.fim,
      titulo: "Demonstração da Demandou",
      descricao: `Demonstração com ${r.lead.nome ?? r.lead.email}${r.lead.empresa ? ` (${r.lead.empresa})` : ""}.\nRemarcar ou cancelar: ${linkGerenciar(r.id)}`,
      convidados: [{ email: r.lead.email, nome: r.lead.nome ?? undefined }],
    });
    // A sala do Meet pode voltar "pendente" (criada um instante depois do
    // evento): uma releitura curta pega o link antes do e-mail de confirmação.
    // Se nem assim, a régua relê antes dos alertas de 1 hora, 5 minutos e início.
    if (!linkDoMeet(ev)) {
      await new Promise((ok) => setTimeout(ok, 1500));
      ev = await buscarEvento(conta.refreshTokenCifrado, ev.id).catch(() => ev);
    }
    // O UID passa a ser o do Google: o convite do nosso e-mail e o do Google
    // viram o mesmo evento na agenda do lead. O link é o Meet do evento; a sala
    // fixa da pessoa só entra se o Meet não veio.
    await prisma.reuniaoDeDemonstracao.update({
      where: { id: r.id },
      data: { eventoGoogleId: ev.id, contaGoogleId: conta.id, linkReuniao: linkDoMeet(ev) ?? p.linkSala ?? null, uid: ev.iCalUID || r.uid },
    });
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error(`[agenda] evento no Google de ${p.nome} falhou: ${erro}`);
    await prisma.contaGoogleDoTime.update({ where: { id: conta.id }, data: { ultimoErro: `Evento: ${erro}`.slice(0, 500), ultimoErroEm: new Date() } }).catch(() => {});
  }
}

/**
 * Marca (ou remarca, com `reuniaoId`) a demonstração do lead no horário pedido.
 * `pessoaId` nulo = "qualquer pessoa do time": o sistema escolhe pelo rodízio
 * entre quem está livre.
 */
export async function marcarReuniao(args: { leadId: string; inicioIso: string; pessoaId?: string | null; reuniaoId?: string | null }) {
  const agora = new Date();
  const inicio = new Date(args.inicioIso);
  if (Number.isNaN(inicio.getTime()) || inicio.getTime() % (30 * 60_000) !== 0) throw new ErroDeAgenda("Horário inválido.", 400);
  if (inicio.getTime() <= agora.getTime()) throw new ErroDeAgenda("Esse horário já passou. Escolha outro.", 400);
  const fim = new Date(inicio.getTime() + DURACAO_MIN * 60_000);

  const lead = await prisma.lead.findUnique({ where: { id: args.leadId } });
  if (!lead) throw new ErroDeAgenda("Não encontrei o seu cadastro. Preencha os dados de novo.", 404);
  if (!lead.faturamento || !FAIXAS_ATENDIDAS.has(lead.faturamento)) {
    throw new ErroDeAgenda("Hoje a demonstração é para empresas que faturam acima de R$ 100 mil por mês.", 403);
  }

  let antes: { pessoaId: string; eventoGoogleId: string | null; contaGoogleId: string | null; escolha: string; inicio: Date } | null = null;
  if (args.reuniaoId) {
    const r = await prisma.reuniaoDeDemonstracao.findUnique({ where: { id: args.reuniaoId } });
    if (!r || r.leadId !== lead.id) throw new ErroDeAgenda("Reunião não encontrada.", 404);
    if (r.status !== "marcada") throw new ErroDeAgenda("Esta reunião já foi cancelada. Marque uma nova.", 409);
    antes = { pessoaId: r.pessoaId, eventoGoogleId: r.eventoGoogleId, contaGoogleId: r.contaGoogleId, escolha: r.escolha, inicio: r.inicio };
  } else {
    const jaTem = await prisma.reuniaoDeDemonstracao.findFirst({
      where: { leadId: lead.id, status: "marcada", inicio: { gt: agora } },
      orderBy: { inicio: "asc" },
    });
    if (jaTem) {
      throw new ErroDeAgenda("Você já tem uma demonstração marcada. Para mudar o horário, use o link de remarcar.", 409, {
        gerenciar: `/demonstracao/reuniao/${tokenDaReuniao(jaTem.id)}`,
      });
    }
  }

  const todas = await pessoasAtivas();
  const escolha = args.pessoaId ? "pessoa" : "qualquer";
  let candidatas: PessoaComContas[];
  if (args.pessoaId) {
    candidatas = todas.filter((p) => p.id === args.pessoaId);
    if (!candidatas.length) throw new ErroDeAgenda("Essa pessoa não está atendendo agora. Escolha outra ou qualquer pessoa do time.", 400);
  } else {
    candidatas = await emOrdemDeRodizio(todas);
    // Na remarcação por "qualquer pessoa", quem já tinha a reunião vem primeiro:
    // o lead não troca de interlocutor sem motivo.
    if (antes) candidatas.sort((a, b) => Number(b.id === antes!.pessoaId) - Number(a.id === antes!.pessoaId));
  }

  const teste = ehLeadDeTeste(lead.email);
  for (const p of candidatas) {
    if (!(await pessoaLivre(p, inicio, agora, args.reuniaoId))) continue;
    const gravada = await gravarParaPessoa({ p, inicio, fim, leadId: lead.id, escolha, teste, reuniaoId: args.reuniaoId });
    if (!gravada) continue;

    await sincronizarGoogle(gravada.id, p, antes);
    // A confirmação (e-mail e WhatsApp, lead e time) é o primeiro alerta da
    // régua: registrada e uma vez só. Na remarcação que trocou de pessoa, a de
    // antes recebe o cancelamento. Falha de envio não desfaz a marcação.
    await dispararAlerta(gravada.id, antes ? "remarcada" : "marcada", {
      anterior: antes ? { pessoaId: antes.pessoaId, inicio: antes.inicio } : null,
    }).catch((e) => console.error("[agenda] alerta da marcação falhou:", e));
    const dados = await dadosDaReuniao(gravada.id);
    return {
      id: gravada.id,
      inicio: inicio.toISOString(),
      pessoa: p.nome.split(/\s+/)[0],
      linkReuniao: dados?.d.linkReuniao ?? null,
      gerenciar: `/demonstracao/reuniao/${tokenDaReuniao(gravada.id)}`,
    };
  }
  throw new ErroDeAgenda("Esse horário acabou de ser ocupado. Escolha outro.", 409, { recarregar: true });
}

/** Cancela, avisa os dois lados com o convite de CANCEL e tira o evento do Google. */
export async function cancelarReuniao(reuniaoId: string, por: "lead" | "admin"): Promise<boolean> {
  const mudou = await prisma.reuniaoDeDemonstracao.updateMany({
    where: { id: reuniaoId, status: "marcada" },
    data: { status: "cancelada", canceladaEm: new Date(), canceladaPor: por, sequencia: { increment: 1 } },
  });
  if (mudou.count === 0) return false;
  const r = await prisma.reuniaoDeDemonstracao.findUnique({ where: { id: reuniaoId } });
  if (r?.eventoGoogleId && r.contaGoogleId) {
    const conta = await prisma.contaGoogleDoTime.findUnique({ where: { id: r.contaGoogleId } });
    if (conta) await cancelarEvento(conta.refreshTokenCifrado, r.eventoGoogleId).catch((e) => console.error("[agenda] cancelar evento falhou:", e));
  }
  await dispararAlerta(reuniaoId, "cancelada", { por }).catch((e) => console.error("[agenda] alerta do cancelamento falhou:", e));
  return true;
}
