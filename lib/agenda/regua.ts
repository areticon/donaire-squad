import { prisma } from "@/lib/db/prisma";
import type { Email } from "@/lib/email";
import {
  emailCancelamento, emailCincoMinutos, emailComecando, emailEsperando, emailLembrete, emailObrigado,
  emailReuniaoParaLead, emailReuniaoParaTime, emailResultado, type DadosDaReuniao,
} from "@/lib/email/agenda";
import { NOME_DA_FAIXA } from "@/lib/email/demonstracao";
import { emReais, type Resultado } from "@/lib/calculadora/custos";
import { dadosDaReuniao, destinosDoTime, enviarDaAgenda, type DadosCompletos } from "@/lib/agenda/envio";
import { tokenDaReuniao, tokenDoComecou } from "@/lib/agenda/segredos";
import { diaEHora, horaEmSP } from "@/lib/agenda/tempo";
import { buscarEvento, googleAgendaConfigurado, linkDoMeet } from "@/lib/agenda/google";
import { enviarModelo, type ResultadoDoWhatsapp } from "@/lib/whatsapp/enviar";
import { numeroDoWhatsapp, numeroNaTela } from "@/lib/whatsapp/numero";
import type { ChaveDoModelo } from "@/lib/whatsapp/modelos";

/**
 * A RÉGUA DE ALERTAS DA DEMONSTRAÇÃO (01/10), para o lead e para quem atende,
 * por e-mail e por WhatsApp:
 *
 *   marcada / remarcada / cancelada   na hora (chamado por lib/agenda/reunioes.ts)
 *   h24      24 horas antes            lead e time
 *   h1       1 hora antes              lead e time
 *   m5       5 minutos antes           lead e time, link em destaque
 *   inicio   na hora                   lead ("estamos na sala")
 *   atraso   10 minutos depois         lead, só se ninguém marcou que começou
 *                                      e o lead não abriu a sala; uma vez só
 *   depois_lead  30 min após o fim     lead, só se a reunião aconteceu
 *   depois_time  30 min após o fim     time, se ninguém marcou o resultado
 *
 * OS ALERTAS COM HORA rodam no cron de 1 minuto (app/api/cron/fila), sem cron
 * novo: é uma consulta pequena por passada, e o de 5 minutos e o de início
 * precisam de granularidade de minuto (o cron de publicação é de 5 em 5).
 *
 * NUNCA SAI DUAS VEZES: antes de enviar, o alerta é RESERVADO em
 * agenda_alertas com a chave única (reunião, tipo, sequência), por INSERT ...
 * ON CONFLICT DO NOTHING. Quem inseriu envia; a passada sobreposta não insere
 * e não envia. Se a função morrer depois de reservar, o alerta fica
 * "reservado" e não sai: preferimos perder um aviso a mandar dois. A
 * remarcação sobe a sequência da reunião, e a régua começa de novo.
 *
 * O FUSO é o de Brasília em todo texto (lib/agenda/tempo.ts); as janelas são
 * contadas em milissegundos sobre instantes UTC, então horário de verão não
 * desloca nada.
 */

export type TipoDeAlerta =
  | "marcada" | "remarcada" | "cancelada"
  | "h24" | "h1" | "m5" | "inicio" | "atraso" | "depois_lead" | "depois_time";

export type EnvioRegistrado = {
  canal: "email" | "whatsapp";
  lado: "lead" | "time";
  para: string;
  ok: boolean;
  simulado?: boolean;
  bloqueado?: boolean;
  erro?: string;
  modelo?: string;
  assunto?: string;
  texto?: string;
};

const MIN = 60_000;
const H = 60 * MIN;
/** Folga contra relógio adiantado do cron (a Vercel dispara alguns segundos depois do minuto, nunca muito antes). */
const FOLGA = 20_000;

// ---------------------------------------------------------------------------
// As regras de QUANDO, puras (a prova roda sem banco).
// ---------------------------------------------------------------------------

export type EstadoDaReuniao = {
  inicio: Date;
  fim: Date;
  createdAt: Date;
  status: string;
  comecouEm: Date | null;
  leadEntrouEm: Date | null;
  lembrete24hEm: Date | null;
  lembrete1hEm: Date | null;
  /**
   * Quando o lead recebeu a última confirmação (marcação ou remarcação). Na
   * remarcação, é ela que conta para "acabou de receber", e não a criação.
   */
  confirmadaEm?: Date | null;
};

export type AlertaDevido = { tipo: TipoDeAlerta; pular?: string };

/**
 * Quais alertas com hora estão na janela agora. `pular` diz que o alerta deve
 * ser registrado como "pulado" (não faz sentido) em vez de enviado, para não
 * voltar a cada minuto.
 */
export function alertasDevidos(r: EstadoDaReuniao, agora: Date): AlertaDevido[] {
  const t = agora.getTime();
  const falta = r.inicio.getTime() - t;
  const antecedencia = r.inicio.getTime() - (r.confirmadaEm ?? r.createdAt).getTime();
  const desdeOFim = t - r.fim.getTime();
  const out: AlertaDevido[] = [];
  const marcada = r.status === "marcada";

  // Véspera: entre 24 h e 2 h antes. Quem marcou com menos de 20 h acabou de
  // receber a confirmação e não precisa de "é amanhã".
  if (marcada && !r.lembrete24hEm && falta <= 24 * H + FOLGA && falta > 2 * H) {
    out.push({ tipo: "h24", ...(antecedencia < 20 * H ? { pular: "marcada com menos de 20 h" } : {}) });
  }
  // 1 hora: entre 60 e 10 minutos antes.
  if (marcada && !r.lembrete1hEm && falta <= H + FOLGA && falta > 10 * MIN) {
    out.push({ tipo: "h1", ...(antecedencia < 90 * MIN ? { pular: "marcada com menos de 90 min" } : {}) });
  }
  // 5 minutos: do minuto em que falta 5 até 30 s antes do início.
  if (marcada && falta <= 5 * MIN + FOLGA && falta > 30_000) {
    out.push({ tipo: "m5", ...(antecedencia < 15 * MIN ? { pular: "marcada com menos de 15 min" } : {}) });
  }
  // Início: do minuto do início até 5 min depois. Mais tarde que isso, "está
  // começando agora" seria mentira (o cron pode ter ficado parado).
  if (marcada && falta <= FOLGA && falta > -5 * MIN) out.push({ tipo: "inicio" });
  // Atraso: de 10 a 20 min depois do início, sem sinal nenhum de que começou.
  if (marcada && !r.comecouEm && !r.leadEntrouEm && falta <= -10 * MIN + FOLGA && falta > -20 * MIN) {
    out.push({ tipo: "atraso" });
  }
  // Depois: de 30 min a 24 h depois do fim.
  if (desdeOFim >= 30 * MIN - FOLGA && desdeOFim < 24 * H) {
    // Para o time, enquanto ninguém marcou o resultado.
    if (marcada) out.push({ tipo: "depois_time" });
    // Para o lead, só com prova de que aconteceu: "aconteceu" no painel ou
    // "começou" marcado pelo time. Lead que faltou não recebe "obrigado pela
    // conversa"; se o time marcar "aconteceu" mais tarde, sai na hora.
    if ((r.status === "realizada" || (marcada && r.comecouEm))) out.push({ tipo: "depois_lead" });
  }
  return out;
}

// ---------------------------------------------------------------------------
// O registro (a trava).
// ---------------------------------------------------------------------------

async function reservar(reuniaoId: string, tipo: TipoDeAlerta, sequencia: number): Promise<boolean> {
  const r = await prisma.alertaDaReuniao.createMany({ data: [{ reuniaoId, tipo, sequencia }], skipDuplicates: true });
  return r.count === 1;
}

async function concluir(reuniaoId: string, tipo: TipoDeAlerta, sequencia: number, situacao: "enviado" | "pulado", detalhe: unknown) {
  await prisma.alertaDaReuniao
    .update({ where: { reuniaoId_tipo_sequencia: { reuniaoId, tipo, sequencia } }, data: { situacao, detalhe: detalhe as never } })
    .catch((e) => console.error(`[regua] registrar ${tipo} de ${reuniaoId} falhou:`, e));
}

// ---------------------------------------------------------------------------
// Os textos do WhatsApp (as variáveis de cada modelo).
// ---------------------------------------------------------------------------

function linkOuAviso(d: DadosDaReuniao): string {
  return d.linkReuniao ?? "o link chega antes da reunião";
}

function leadCurto(d: DadosDaReuniao): string {
  return [d.lead.nome, d.lead.empresa].filter(Boolean).join(", ") || d.lead.email;
}

function leadResumo(d: DadosDaReuniao): string {
  const zap = d.lead.whatsapp ? `WhatsApp ${numeroNaTela(d.lead.whatsapp)}` : null;
  return [d.lead.nome, d.lead.cargo, d.lead.empresa, d.lead.email, zap].filter(Boolean).join(", ");
}

function faixa(d: DadosDaReuniao): string {
  return (d.lead.faturamento && NOME_DA_FAIXA[d.lead.faturamento]) || d.lead.faturamento || "não informado";
}

function calculadora(d: DadosDaReuniao): string {
  const r = d.lead.calculadora as Resultado | null | undefined;
  if (!r || !r.demandou || !Array.isArray(r.cenarios)) return "não simulou";
  const economia = r.economia?.[0];
  return `plano ${r.demandou.nome} por ${emReais(r.demandou.mensal)} por mês${economia && economia.reais > 0 ? `, ${emReais(economia.reais)} a menos que o time próprio` : ""}`;
}

// ---------------------------------------------------------------------------
// O envio de um alerta: e-mails e WhatsApp dos dois lados.
// ---------------------------------------------------------------------------

type Plano = {
  emails: Array<{ lado: "lead" | "time"; email: Email }>;
  zaps: Array<{ lado: "lead" | "time"; para: string; chave: ChaveDoModelo; valores: string[]; sufixos?: string[] }>;
};

type Extra = {
  por?: "lead" | "admin";
  /** Remarcação que trocou de pessoa: quem perdeu a reunião recebe o cancelamento. */
  anterior?: { pessoaId: string; inicio: Date } | null;
};

async function planoDoAlerta(id: string, dados: DadosCompletos, tipo: TipoDeAlerta, extra: Extra): Promise<Plano> {
  const { d } = dados;
  const time = destinosDoTime(dados.emailAgenda);
  const tokenLead = tokenDaReuniao(id);
  const zapLead = d.lead.whatsapp ?? null;
  const zapTime = d.pessoa.whatsapp ?? null;
  const p: Plano = { emails: [], zaps: [] };
  const lead = (email: Email) => p.emails.push({ lado: "lead", email });
  const doTime = (fazer: (para: string) => Email) => time.forEach((para) => p.emails.push({ lado: "time", email: fazer(para) }));
  const zLead = (chave: ChaveDoModelo, valores: string[], sufixos?: string[]) => zapLead && p.zaps.push({ lado: "lead", para: zapLead, chave, valores, sufixos });
  const zTime = (chave: ChaveDoModelo, valores: string[], sufixos?: string[]) => zapTime && p.zaps.push({ lado: "time", para: zapTime, chave, valores, sufixos });
  const hora = horaEmSP(d.inicio);

  switch (tipo) {
    case "marcada":
    case "remarcada": {
      lead(emailReuniaoParaLead(d, tipo));
      doTime((para) => emailReuniaoParaTime(d, tipo, para));
      zLead(tipo === "marcada" ? "confirmada" : "remarcada", [diaEHora(d.inicio), d.pessoa.nome, linkOuAviso(d)], [tokenLead]);
      if (tipo === "marcada") zTime("novaTime", [diaEHora(d.inicio), d.pessoa.nome, leadResumo(d), faixa(d), calculadora(d)]);
      else zTime("remarcadaTime", [diaEHora(d.inicio), d.pessoa.nome, leadCurto(d)]);
      // A pessoa de antes perdeu a reunião: recebe o cancelamento do convite dela.
      if (extra.anterior && extra.anterior.pessoaId !== dados.pessoaId) {
        const velha = await prisma.pessoaDoTime.findUnique({ where: { id: extra.anterior.pessoaId } });
        if (velha) {
          const dVelha: DadosDaReuniao = { ...d, inicio: extra.anterior.inicio, pessoa: { nome: velha.nome, email: velha.emailAgenda } };
          for (const para of destinosDoTime(velha.emailAgenda)) p.emails.push({ lado: "time", email: emailCancelamento(dVelha, para, "time", "lead") });
          const zapVelha = numeroDoWhatsapp(velha.whatsapp);
          if (zapVelha) {
            p.zaps.push({ lado: "time", para: zapVelha, chave: "canceladaTime", valores: [diaEHora(extra.anterior.inicio), leadCurto(d), `porque o lead remarcou com ${d.pessoa.nome}`] });
          }
        }
      }
      break;
    }
    case "cancelada": {
      const por = extra.por ?? "lead";
      lead(emailCancelamento(d, d.lead.email, "lead", por));
      doTime((para) => emailCancelamento(d, para, "time", por));
      zLead("cancelada", [diaEHora(d.inicio)]);
      zTime("canceladaTime", [diaEHora(d.inicio), leadCurto(d), por === "lead" ? "pelo lead" : "pelo painel"]);
      break;
    }
    case "h24":
    case "h1": {
      const q = tipo === "h24" ? "24h" : "1h";
      lead(emailLembrete(d, q, d.lead.email, "lead"));
      doTime((para) => emailLembrete(d, q, para, "time"));
      if (tipo === "h24") zLead("vespera", [diaEHora(d.inicio), d.pessoa.nome, linkOuAviso(d)], [tokenLead]);
      else zLead("umaHora", [hora, d.pessoa.nome, linkOuAviso(d)], [tokenLead]);
      zTime("lembreteTime", [tipo === "h24" ? "amanhã" : "daqui a 1 hora", hora, leadCurto(d), linkOuAviso(d)]);
      break;
    }
    case "m5": {
      lead(emailCincoMinutos(d, d.lead.email, "lead"));
      doTime((para) => emailCincoMinutos(d, para, "time"));
      zLead("cincoMinutos", [d.pessoa.nome, hora], [tokenLead]);
      zTime("cincoMinutosTime", [leadCurto(d), hora, d.linkReuniao ?? "SEM LINK, mande ao lead"], [tokenDoComecou(id)]);
      break;
    }
    case "inicio": {
      lead(emailComecando(d));
      zLead("comecando", [d.pessoa.nome], [tokenLead]);
      break;
    }
    case "atraso": {
      lead(emailEsperando(d));
      zLead("esperando", [d.pessoa.nome], [tokenLead, tokenLead]);
      break;
    }
    case "depois_lead": {
      lead(emailObrigado(d));
      zLead("obrigado", [d.pessoa.nome]);
      break;
    }
    case "depois_time": {
      doTime((para) => emailResultado(d, para));
      zTime("resultadoTime", [leadCurto(d), hora]);
      break;
    }
  }
  // O ONBOARDING (05/10) sai só por e-mail: os modelos de WhatsApp aprovados
  // na Meta falam em "demonstração", e mandar isso a um cliente que acabou de
  // assinar seria errar o nome da conversa. Os e-mails seguem o tipo.
  if (dados.tipo === "onboarding") p.zaps = [];
  return p;
}

async function executar(plano: Plano, teste: boolean): Promise<EnvioRegistrado[]> {
  const out: EnvioRegistrado[] = [];
  for (const { lado, email } of plano.emails) {
    const ok = await enviarDaAgenda(email, teste).catch(() => false);
    out.push({ canal: "email", lado, para: email.para, ok: ok || teste, ...(teste ? { simulado: true } : {}), assunto: email.assunto });
  }
  for (const z of plano.zaps) {
    const r: ResultadoDoWhatsapp = await enviarModelo({ ...z, simular: teste });
    out.push({
      canal: "whatsapp", lado: z.lado, para: z.para, ok: r.ok, modelo: r.modelo, texto: r.texto.slice(0, 600),
      ...(r.simulado ? { simulado: true } : {}), ...(r.bloqueado ? { bloqueado: true } : {}), ...(r.erro ? { erro: r.erro } : {}),
    });
  }
  return out;
}

/**
 * O link do Meet pode ter nascido pendente, ou o evento ter sido mexido no
 * Google: antes dos alertas que levam o link, relê o evento quando a reunião
 * tem evento e está sem link (ou só com a sala fixa de reserva).
 */
async function garantirLinkDoMeet(id: string, dados: DadosCompletos): Promise<void> {
  if (!dados.eventoGoogleId || !dados.contaGoogleId || !googleAgendaConfigurado()) return;
  if (dados.d.linkReuniao && dados.d.linkReuniao !== dados.linkSalaFixa) return;
  try {
    const conta = await prisma.contaGoogleDoTime.findUnique({ where: { id: dados.contaGoogleId } });
    if (!conta) return;
    const link = linkDoMeet(await buscarEvento(conta.refreshTokenCifrado, dados.eventoGoogleId));
    if (link && link !== dados.d.linkReuniao) {
      await prisma.reuniaoDeDemonstracao.update({ where: { id }, data: { linkReuniao: link } });
      dados.d.linkReuniao = link;
    }
  } catch (e) {
    console.error(`[regua] reler o Meet de ${id} falhou:`, e);
  }
}

/**
 * Dispara um alerta da reunião, uma vez só. Devolve o que saiu, ou null se o
 * alerta já tinha sido reservado por outra passada.
 */
export async function dispararAlerta(reuniaoId: string, tipo: TipoDeAlerta, extra: Extra & { pular?: string; agora?: Date } = {}): Promise<EnvioRegistrado[] | null> {
  const dados = await dadosDaReuniao(reuniaoId);
  if (!dados) return null;
  // Alerta com hora: confere de novo com a reunião relida. Entre a consulta da
  // passada e aqui o lead pode ter remarcado ou cancelado, e o "começa em 5
  // minutos" do horário velho não pode sair com a sequência nova.
  if (extra.agora) {
    const ainda = alertasDevidos(
      { inicio: dados.d.inicio, fim: dados.d.fim, createdAt: dados.createdAt, status: dados.status, comecouEm: dados.comecouEm, leadEntrouEm: dados.leadEntrouEm, lembrete24hEm: null, lembrete1hEm: null },
      extra.agora
    );
    if (!ainda.some((a) => a.tipo === tipo)) return null;
  }
  if (!(await reservar(reuniaoId, tipo, dados.sequencia))) return null;

  // O registro antigo da véspera e da hora (lembretes de antes da régua) fica
  // em dia, para quem lê a reunião pelo banco.
  if (tipo === "h24") await prisma.reuniaoDeDemonstracao.updateMany({ where: { id: reuniaoId, lembrete24hEm: null }, data: { lembrete24hEm: extra.agora ?? new Date() } });
  if (tipo === "h1") await prisma.reuniaoDeDemonstracao.updateMany({ where: { id: reuniaoId, lembrete1hEm: null }, data: { lembrete1hEm: extra.agora ?? new Date() } });

  if (extra.pular) {
    await concluir(reuniaoId, tipo, dados.sequencia, "pulado", { motivo: extra.pular });
    return [];
  }
  if (["h1", "m5", "inicio", "atraso"].includes(tipo)) await garantirLinkDoMeet(reuniaoId, dados);
  const envios = await executar(await planoDoAlerta(reuniaoId, dados, tipo, extra), dados.teste);
  await concluir(reuniaoId, tipo, dados.sequencia, "enviado", { envios });
  return envios;
}

/**
 * Uma passada da régua (cron de 1 minuto). `agora` e `somente` existem para a
 * prova com relógio falso: com `somente`, nenhuma outra reunião é tocada.
 */
export async function avancarRegua(agora = new Date(), opcoes: { somente?: string[] } = {}): Promise<{ enviados: Partial<Record<TipoDeAlerta, number>>; pulados: number }> {
  const t = agora.getTime();
  const reunioes = await prisma.reuniaoDeDemonstracao.findMany({
    where: {
      status: { in: ["marcada", "realizada"] },
      // Da véspera (início daqui a 24 h) até o agradecimento (fim há 24 h).
      inicio: { gt: new Date(t - 25 * H), lte: new Date(t + 24 * H + MIN) },
      ...(opcoes.somente ? { id: { in: opcoes.somente } } : {}),
    },
    select: { id: true, inicio: true, fim: true, createdAt: true, status: true, comecouEm: true, leadEntrouEm: true, lembrete24hEm: true, lembrete1hEm: true, sequencia: true },
    orderBy: { inicio: "asc" },
    take: 200,
  });
  if (!reunioes.length) return { enviados: {}, pulados: 0 };

  // Uma leitura só dos alertas já registrados, para não tentar reservar à toa
  // (a reserva é a trava; isto é só para não bater no banco 200 vezes).
  const feitos = await prisma.alertaDaReuniao.findMany({
    where: { reuniaoId: { in: reunioes.map((r) => r.id) } },
    select: { reuniaoId: true, tipo: true, sequencia: true, createdAt: true },
  });
  const jaFeito = new Set(feitos.map((f) => `${f.reuniaoId}:${f.tipo}:${f.sequencia}`));
  const confirmadaEm = new Map<string, Date>();
  for (const f of feitos) {
    if (f.tipo === "marcada" || f.tipo === "remarcada") {
      const atual = confirmadaEm.get(`${f.reuniaoId}:${f.sequencia}`);
      if (!atual || f.createdAt > atual) confirmadaEm.set(`${f.reuniaoId}:${f.sequencia}`, f.createdAt);
    }
  }

  const enviados: Partial<Record<TipoDeAlerta, number>> = {};
  let pulados = 0;
  for (const r of reunioes) {
    for (const a of alertasDevidos({ ...r, confirmadaEm: confirmadaEm.get(`${r.id}:${r.sequencia}`) ?? null }, agora)) {
      if (jaFeito.has(`${r.id}:${a.tipo}:${r.sequencia}`)) continue;
      try {
        const saiu = await dispararAlerta(r.id, a.tipo, { pular: a.pular, agora });
        if (saiu === null) continue;
        if (a.pular) pulados++;
        else enviados[a.tipo] = (enviados[a.tipo] ?? 0) + 1;
      } catch (e) {
        console.error(`[regua] ${a.tipo} de ${r.id} falhou:`, e);
      }
    }
  }
  return { enviados, pulados };
}
