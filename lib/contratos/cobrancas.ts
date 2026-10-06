import { prisma } from "@/lib/db/prisma";
import { enviarEmail } from "@/lib/email";
import { emailDeFup } from "@/lib/email/cobrancas";
import { RecusaDoContrato, nomeDoPlano, registrar, type Autor } from "@/lib/contratos/contratos";
import { linksDoContrato } from "@/lib/contratos/links-de-pagamento";
import { ehParcelado, formasDoContrato } from "@/lib/contratos/condicao";
import { numeroDoWhatsapp, numeroNaTela } from "@/lib/whatsapp/numero";
import {
  CADENCIA_PADRAO,
  NOME_DO_CANAL,
  RESULTADOS_DO_FUP,
  TETO_DO_AUTOMATICO_EM_DIAS,
  contaDoFup,
  ehCanalDoFup,
  ehResultadoDoFup,
  horarioComercial,
  linkDeLigacao,
  linkDoWhatsapp,
  passoAutomaticoDevido,
  textoDoWhatsapp,
  type CanalDoFup,
  type MotivoDaCobranca,
  type ResultadoDoFup,
} from "@/lib/contratos/fup";

/**
 * AS COBRANÇAS E O ACOMPANHAMENTO (FUP, follow-up) DOS CONTRATOS (05/10/2026).
 *
 * Cai em cobrança o contrato ENVIADO E SEM ASSINATURA, o ASSINADO E SEM
 * PAGAMENTO e o que tem PARCELA EM ATRASO. A lista sai ordenada pelo
 * acompanhamento mais vencido e, entre iguais, pelo tempo sem resposta.
 *
 * O ESTADO MORA NA TRILHA (contratos_eventos), sem coluna nova: cada
 * acompanhamento feito é um evento "fup" (canal, resultado, quem, quando); o
 * automático é "fup_automatico"; o telefone do cliente e o vendedor
 * responsável (closer) são o último evento "contato_de_cobranca"; a pausa do
 * automático é "fup_pausado" e "fup_retomado". A base da cadência é o último
 * evento "enviado" (assinatura), a data da assinatura (entrada) ou o início do
 * atraso (parcela). Foi assim de propósito: o banco é compartilhado entre o
 * dev e a produção, e a trilha já é a memória do contrato.
 *
 * O E-MAIL AUTOMÁTICO sai na cadência (lib/contratos/fup.ts), em horário
 * comercial, UMA vez por passo: o passo é reservado em contratos_alertas com
 * a chave (contrato, "fup_<motivo>_<passo>", base) por INSERT ... ON CONFLICT
 * DO NOTHING antes de enviar, o mesmo desenho dos avisos de vencimento. Se o
 * vendedor já falou com o cliente naquela janela, o passo é pulado.
 * COBRANCAS_FUP_AUTOMATICO=0 desliga o automático inteiro.
 *
 * Só servidor.
 */

const TIPOS_DA_COBRANCA = ["enviado", "fup", "fup_automatico", "contato_de_cobranca", "fup_pausado", "fup_retomado", "criado"] as const;

type ContratoLido = {
  id: string;
  numero: number;
  userId: string;
  status: string;
  plano: string;
  valorCentavos: number;
  empresa: string | null;
  signatarioNome: string | null;
  signatarioEmail: string | null;
  linkDeAssinatura: string | null;
  linkDePagamento: string | null;
  provedorSituacao: string | null;
  assinadoEm: Date | null;
  pagoEm: Date | null;
  parcelaEmAtraso: string | null;
  parcelaEmAtrasoDesde: Date | null;
  descontoConcedidoPor: string | null;
  updatedAt: Date;
  condicaoDePagamento: string | null;
  entradaCentavos: number | null;
  formaDaEntrada: string | null;
  formaDoRestante: string | null;
  user: { email: string; name: string | null };
  eventos: Array<{ id: string; tipo: string; autor: string | null; detalhe: unknown; createdAt: Date }>;
};

const INCLUIR = {
  user: { select: { email: true, name: true } },
  eventos: { where: { tipo: { in: [...TIPOS_DA_COBRANCA] } }, orderBy: { createdAt: "desc" as const }, take: 200 },
};

export type FupNaTela = {
  id: string;
  em: string;
  canal: CanalDoFup | "email";
  origem: "manual" | "automatico";
  autor: string | null;
  resultado: string | null;
  observacao: string | null;
};

/** Uma cobrança como a tela a recebe: tudo pronto, datas em ISO. */
export type CobrancaNaTela = {
  contratoId: string;
  numero: number;
  userId: string;
  cliente: string;
  empresa: string | null;
  signatarioNome: string | null;
  email: string;
  plano: string;
  valorCentavos: number;
  motivo: MotivoDaCobranca;
  provedorSituacao: string | null;
  /** A base da cadência (o envio, a assinatura ou o início do atraso). */
  baseEm: string;
  diasSemResposta: number;
  ultimoFupEm: string | null;
  proximoFupEm: string;
  passo: number | null;
  vencido: boolean;
  diasVencido: number;
  pausado: boolean;
  /** O telefone do cliente (só dígitos, com 55) e de onde veio. */
  telefone: string | null;
  telefoneNaTela: string;
  telefoneOrigem: "contrato" | "lead" | "demonstracao" | null;
  linkDeLigacao: string | null;
  linkDoWhatsapp: string | null;
  /** O vendedor que fechou (closer). */
  closerEmail: string | null;
  closerNome: string | null;
  closerWhatsapp: string | null;
  /** O link que o cliente precisa (assinatura ou pagamento). */
  link: string | null;
  fups: FupNaTela[];
  totalDeFups: number;
};

function motivoDoContrato(c: ContratoLido): { motivo: MotivoDaCobranca; base: Date } | null {
  if (c.status === "cancelado") return null;
  if (c.status === "enviado") {
    const envio = c.eventos.find((e) => e.tipo === "enviado");
    return { motivo: "assinatura", base: envio?.createdAt ?? c.updatedAt };
  }
  if (c.status !== "rascunho" && c.assinadoEm && !c.pagoEm) return { motivo: "entrada", base: c.assinadoEm };
  if (c.parcelaEmAtraso) return { motivo: "parcela", base: c.parcelaEmAtrasoDesde ?? c.updatedAt };
  return null;
}

function detalhe(e: { detalhe: unknown }): Record<string, unknown> {
  return (e.detalhe ?? {}) as Record<string, unknown>;
}

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** O link que o cliente precisa, pelo motivo. */
function linkDaCobranca(c: ContratoLido, motivo: MotivoDaCobranca): string | null {
  if (motivo === "assinatura") return c.linkDeAssinatura;
  if (motivo === "entrada") {
    if (ehParcelado(c)) {
      const links = linksDoContrato({ id: c.id, ...formasDoContrato(c) });
      return links.entrada ?? links.restante;
    }
    return c.linkDePagamento;
  }
  return null;
}

type Pessoa = { nome: string; emailUsuario: string | null; emailAgenda: string | null; whatsapp: string | null };

/** As pessoas do time e os admins, para achar o nome e o WhatsApp do closer. */
async function pessoasDoTime(): Promise<{ pessoas: Pessoa[]; admins: Array<{ email: string; name: string | null }> }> {
  const [pessoas, admins] = await Promise.all([
    prisma.pessoaDoTime.findMany({ where: { ativo: true }, orderBy: { ordem: "asc" }, select: { nome: true, emailUsuario: true, emailAgenda: true, whatsapp: true } }),
    prisma.user.findMany({ where: { role: "admin" }, select: { email: true, name: true } }),
  ]);
  return { pessoas, admins };
}

function closerPorEmail(email: string | null, time: Awaited<ReturnType<typeof pessoasDoTime>>): { email: string | null; nome: string | null; whatsapp: string | null } {
  const e = email?.trim().toLowerCase() ?? null;
  if (!e) return { email: null, nome: null, whatsapp: null };
  const p = time.pessoas.find((x) => x.emailUsuario?.toLowerCase() === e || x.emailAgenda?.toLowerCase() === e);
  if (p) return { email: e, nome: p.nome, whatsapp: p.whatsapp };
  const a = time.admins.find((x) => x.email.toLowerCase() === e);
  return { email: e, nome: a?.name ?? e, whatsapp: null };
}

/** As opções de closer para o formulário: pessoas do time e admins, sem repetir. */
export async function opcoesDeCloser(): Promise<Array<{ email: string; nome: string }>> {
  const t = await pessoasDoTime();
  const vistos = new Set<string>();
  const lista: Array<{ email: string; nome: string }> = [];
  for (const p of t.pessoas) {
    const email = (p.emailUsuario ?? p.emailAgenda)?.toLowerCase();
    if (!email || vistos.has(email)) continue;
    vistos.add(email);
    lista.push({ email, nome: p.nome });
  }
  for (const a of t.admins) {
    const email = a.email.toLowerCase();
    if (vistos.has(email)) continue;
    vistos.add(email);
    lista.push({ email, nome: a.name ?? email });
  }
  return lista;
}

/** O telefone do cliente: o informado no contrato, senão o do lead, senão o da demonstração. */
async function telefoneDoCliente(c: ContratoLido, contato: Record<string, unknown> | null): Promise<{ telefone: string | null; origem: CobrancaNaTela["telefoneOrigem"] }> {
  const informado = numeroDoWhatsapp(texto(contato?.telefone));
  if (informado) return { telefone: informado, origem: "contrato" };
  const emails = [c.signatarioEmail, c.user.email].filter((e): e is string => Boolean(e)).map((e) => e.toLowerCase());
  if (!emails.length) return { telefone: null, origem: null };
  const lead = await prisma.lead.findFirst({ where: { email: { in: emails }, telefone: { not: null } }, select: { telefone: true } });
  const doLead = numeroDoWhatsapp(lead?.telefone);
  if (doLead) return { telefone: doLead, origem: "lead" };
  const demo = await prisma.demoRun.findFirst({ where: { email: { in: emails }, telefone: { not: null } }, orderBy: { createdAt: "desc" }, select: { telefone: true } });
  const daDemo = numeroDoWhatsapp(demo?.telefone);
  if (daDemo) return { telefone: daDemo, origem: "demonstracao" };
  return { telefone: null, origem: null };
}

async function montar(c: ContratoLido, time: Awaited<ReturnType<typeof pessoasDoTime>>, agora: Date): Promise<CobrancaNaTela | null> {
  const m = motivoDoContrato(c);
  if (!m) return null;
  const contato = c.eventos.find((e) => e.tipo === "contato_de_cobranca");
  const dContato = contato ? detalhe(contato) : null;
  // A pausa vale pelo último evento de pausa ou retomada.
  const pausa = c.eventos.find((e) => e.tipo === "fup_pausado" || e.tipo === "fup_retomado");
  const pausado = pausa?.tipo === "fup_pausado";
  // Os acompanhamentos desta cobrança: só os feitos depois da base (um envio
  // novo zera a régua).
  const fups = c.eventos
    .filter((e) => (e.tipo === "fup" || e.tipo === "fup_automatico") && e.createdAt.getTime() >= m.base.getTime())
    .map((e) => {
      const d = detalhe(e);
      return {
        id: e.id,
        em: e.createdAt.toISOString(),
        canal: (ehCanalDoFup(d.canal) ? d.canal : "email") as FupNaTela["canal"],
        origem: (e.tipo === "fup_automatico" ? "automatico" : "manual") as FupNaTela["origem"],
        autor: e.autor,
        resultado: texto(d.resultado),
        observacao: texto(d.observacao),
      };
    });
  const ultimo = fups[0] ? new Date(fups[0].em) : null;
  const conta = contaDoFup(m.base, ultimo, agora, CADENCIA_PADRAO);
  const closerEmail = texto(dContato?.closerEmail) ?? c.descontoConcedidoPor ?? c.eventos.find((e) => e.tipo === "criado")?.autor ?? null;
  const closer = closerPorEmail(closerEmail, time);
  const tel = await telefoneDoCliente(c, dContato);
  const link = linkDaCobranca(c, m.motivo);
  return {
    contratoId: c.id,
    numero: c.numero,
    userId: c.userId,
    cliente: c.empresa ?? c.signatarioNome ?? c.user.name ?? c.user.email,
    empresa: c.empresa,
    signatarioNome: c.signatarioNome ?? c.user.name,
    email: c.signatarioEmail ?? c.user.email,
    plano: nomeDoPlano(c.plano),
    valorCentavos: c.valorCentavos,
    motivo: m.motivo,
    provedorSituacao: c.provedorSituacao,
    baseEm: m.base.toISOString(),
    diasSemResposta: conta.diasSemResposta,
    ultimoFupEm: ultimo?.toISOString() ?? null,
    proximoFupEm: conta.proximoEm.toISOString(),
    passo: conta.passo,
    vencido: conta.vencido,
    diasVencido: conta.diasVencido,
    pausado,
    telefone: tel.telefone,
    telefoneNaTela: numeroNaTela(tel.telefone),
    telefoneOrigem: tel.origem,
    linkDeLigacao: linkDeLigacao(tel.telefone),
    linkDoWhatsapp: linkDoWhatsapp(
      tel.telefone,
      textoDoWhatsapp({ motivo: m.motivo, nome: c.signatarioNome ?? c.user.name, numero: c.numero, plano: nomeDoPlano(c.plano), valorCentavos: c.valorCentavos, link, closerNome: closer.nome })
    ),
    closerEmail: closer.email,
    closerNome: closer.nome,
    closerWhatsapp: closer.whatsapp,
    link,
    fups: fups.slice(0, 20),
    totalDeFups: fups.length,
  };
}

function ordenar(a: CobrancaNaTela, b: CobrancaNaTela): number {
  if (a.vencido !== b.vencido) return a.vencido ? -1 : 1;
  if (a.diasVencido !== b.diasVencido) return b.diasVencido - a.diasVencido;
  return b.diasSemResposta - a.diasSemResposta;
}

/** A LISTA DE COBRANÇAS, ordenada pelo acompanhamento mais vencido e pelo tempo sem resposta. */
export async function listaDeCobrancas(agora = new Date()): Promise<CobrancaNaTela[]> {
  const contratos = await prisma.contrato.findMany({
    where: { OR: [{ status: "enviado" }, { status: { notIn: ["rascunho", "enviado", "cancelado"] }, pagoEm: null }, { status: { not: "cancelado" }, parcelaEmAtraso: { not: null } }] },
    include: INCLUIR,
    take: 300,
  });
  const time = await pessoasDoTime();
  const lista = (await Promise.all(contratos.map((c) => montar(c, time, agora)))).filter((x): x is CobrancaNaTela => Boolean(x));
  return lista.sort(ordenar);
}

/** As cobranças de uma conta, por contrato (para a ficha do cliente). */
export async function cobrancasDaConta(userId: string, agora = new Date()): Promise<Map<string, CobrancaNaTela>> {
  const contratos = await prisma.contrato.findMany({ where: { userId, status: { not: "cancelado" } }, include: INCLUIR });
  const time = await pessoasDoTime();
  const mapa = new Map<string, CobrancaNaTela>();
  for (const c of contratos) {
    const x = await montar(c, time, agora);
    if (x) mapa.set(c.id, x);
  }
  return mapa;
}

/** Uma cobrança pelo contrato; null quando o contrato não está em cobrança. */
export async function cobrancaDoContrato(contratoId: string, agora = new Date()): Promise<CobrancaNaTela | null> {
  const c = await prisma.contrato.findUnique({ where: { id: contratoId }, include: INCLUIR });
  if (!c) throw new RecusaDoContrato("Contrato não encontrado.", 404);
  return montar(c, await pessoasDoTime(), agora);
}

/** O resumo para o painel: quantas em cobrança e quantas com o acompanhamento vencido. */
export function resumoDasCobrancas(lista: CobrancaNaTela[]) {
  return {
    total: lista.length,
    vencidas: lista.filter((c) => c.vencido && !c.pausado).length,
    semTelefone: lista.filter((c) => !c.telefone).length,
    valorCentavos: lista.reduce((t, c) => t + c.valorCentavos, 0),
  };
}

/**
 * REGISTRAR UM ACOMPANHAMENTO feito pelo vendedor: o canal (ligação, WhatsApp
 * ou e-mail), o resultado e a observação. Vai para a trilha como "fup".
 */
export async function registrarFup(admin: Autor, contratoId: string, args: { canal: unknown; resultado: unknown; observacao?: unknown }) {
  if (!ehCanalDoFup(args.canal)) throw new RecusaDoContrato(`Canal: ${Object.values(NOME_DO_CANAL).join(", ")}.`);
  if (!ehResultadoDoFup(args.resultado)) throw new RecusaDoContrato(`Resultado: ${Object.values(RESULTADOS_DO_FUP).join("; ")}.`);
  const c = await cobrancaDoContrato(contratoId);
  if (!c) throw new RecusaDoContrato("Este contrato não está em cobrança.");
  await registrar(contratoId, admin, "fup", {
    canal: args.canal,
    resultado: args.resultado,
    observacao: texto(args.observacao)?.slice(0, 500) ?? null,
    motivo: c.motivo,
    origem: "manual",
    telefone: c.telefone,
  });
  return { ok: true, resultado: RESULTADOS_DO_FUP[args.resultado as ResultadoDoFup] };
}

/**
 * O CONTATO DA COBRANÇA: o telefone do cliente e o closer responsável. Fica na
 * trilha ("contato_de_cobranca"); o último vale. Telefone vazio mantém o que
 * está; closer vazio mantém o que está.
 */
export async function definirContato(admin: Autor, contratoId: string, args: { telefone?: unknown; closerEmail?: unknown }) {
  const c = await prisma.contrato.findUnique({ where: { id: contratoId }, include: INCLUIR });
  if (!c) throw new RecusaDoContrato("Contrato não encontrado.", 404);
  const atual = c.eventos.find((e) => e.tipo === "contato_de_cobranca");
  const dAtual = atual ? detalhe(atual) : {};
  const telefoneTexto = texto(args.telefone);
  let telefone = texto(dAtual.telefone);
  if (telefoneTexto) {
    telefone = numeroDoWhatsapp(telefoneTexto);
    if (!telefone) throw new RecusaDoContrato("Telefone inválido: use DDD e número, por exemplo (11) 98765-4321.");
  }
  const closerTexto = texto(args.closerEmail)?.toLowerCase() ?? null;
  const closerEmail = closerTexto ?? texto(dAtual.closerEmail);
  if (closerTexto) {
    const opcoes = await opcoesDeCloser();
    if (!opcoes.some((o) => o.email === closerTexto)) throw new RecusaDoContrato("Escolha um closer do time (pessoa da agenda ou admin).");
  }
  const time = await pessoasDoTime();
  const closer = closerPorEmail(closerEmail, time);
  await registrar(contratoId, admin, "contato_de_cobranca", { telefone, closerEmail: closer.email, closerNome: closer.nome });
  return { ok: true, telefone, telefoneNaTela: numeroNaTela(telefone), closerEmail: closer.email, closerNome: closer.nome };
}

/** Pausa ou retoma o acompanhamento automático deste contrato (o manual segue). */
export async function pausarAutomatico(admin: Autor, contratoId: string, pausar: boolean, motivo?: unknown) {
  const c = await prisma.contrato.findUnique({ where: { id: contratoId }, select: { id: true } });
  if (!c) throw new RecusaDoContrato("Contrato não encontrado.", 404);
  await registrar(contratoId, admin, pausar ? "fup_pausado" : "fup_retomado", { motivo: texto(motivo)?.slice(0, 300) ?? null });
  return { ok: true, pausado: pausar };
}

/** O e-mail de acompanhamento deste contrato, pronto para sair. */
function emailDaCobranca(c: CobrancaNaTela, passo: number) {
  return {
    ...emailDeFup({
      motivo: c.motivo,
      nome: c.signatarioNome,
      numero: c.numero,
      plano: c.plano,
      valorCentavos: c.valorCentavos,
      link: c.link,
      passo,
      closerNome: c.closerNome,
      closerTelefone: c.closerWhatsapp ? numeroNaTela(c.closerWhatsapp) : null,
    }),
    para: c.email,
  };
}

/**
 * MANDAR O E-MAIL DE ACOMPANHAMENTO AGORA, pelo botão do vendedor. Sai de
 * verdade (pelo Resend) e fica na trilha como "fup" manual pelo canal e-mail.
 */
export async function enviarEmailDeFup(admin: Autor, contratoId: string) {
  const c = await cobrancaDoContrato(contratoId);
  if (!c) throw new RecusaDoContrato("Este contrato não está em cobrança.");
  const enviado = await enviarEmail(emailDaCobranca(c, c.passo ?? 99));
  await registrar(contratoId, admin, "fup", { canal: "email", resultado: enviado ? "mensagem_enviada" : "sem_resposta", observacao: enviado ? `e-mail de acompanhamento enviado para ${c.email}` : "o e-mail não saiu (envio desligado ou recusado)", motivo: c.motivo, origem: "manual", enviado });
  return { ok: enviado, para: c.email };
}

/**
 * O WHATSAPP DO ACOMPANHAMENTO, pelo botão do vendedor: monta a mensagem,
 * registra o acompanhamento ("fup" pelo canal WhatsApp) e devolve o link
 * wa.me com o texto pronto para o vendedor mandar do próprio celular.
 */
export async function prepararWhatsapp(admin: Autor, contratoId: string) {
  const c = await cobrancaDoContrato(contratoId);
  if (!c) throw new RecusaDoContrato("Este contrato não está em cobrança.");
  if (!c.telefone || !c.linkDoWhatsapp) throw new RecusaDoContrato("Este contrato não tem telefone. Informe o contato antes.");
  await registrar(contratoId, admin, "fup", { canal: "whatsapp", resultado: "mensagem_enviada", observacao: "mensagem aberta no WhatsApp do vendedor", motivo: c.motivo, origem: "manual", telefone: c.telefone });
  return { ok: true, link: c.linkDoWhatsapp, telefone: c.telefoneNaTela };
}

/**
 * O GANCHO DO WHATSAPP AUTOMÁTICO (05/10): monta a mensagem e a deixa pronta,
 * SEM mandar. Devolve o que sairia.
 *
 * TODO (WhatsApp da cobrança): o envio real pela API da Meta pede um MODELO
 * APROVADO (a mensagem de cobrança fora da janela de 24 h não pode ser texto
 * livre). Quando o modelo existir em lib/whatsapp/modelos.ts, trocar o
 * `simulado` por `enviarModelo({ para, chave, valores, lado: "lead" })` de
 * lib/whatsapp/enviar.ts (que já respeita o bloqueio de quem pediu PARAR),
 * gravar o resultado no evento e ligar a chamada em `avancarCobrancas`. Até
 * lá, nada aqui chama serviço externo e o cron não usa esta função.
 */
export async function montarWhatsappAutomatico(contratoId: string): Promise<{ simulado: true; para: string | null; texto: string | null }> {
  const c = await cobrancaDoContrato(contratoId);
  if (!c) throw new RecusaDoContrato("Este contrato não está em cobrança.");
  const textoPronto = c.telefone
    ? textoDoWhatsapp({ motivo: c.motivo, nome: c.signatarioNome, numero: c.numero, plano: c.plano, valorCentavos: c.valorCentavos, link: c.link, closerNome: c.closerNome })
    : null;
  return { simulado: true, para: c.telefone, texto: textoPronto };
}

export function automaticoLigado(): boolean {
  return process.env.COBRANCAS_FUP_AUTOMATICO !== "0";
}

/**
 * A RÉGUA DAS COBRANÇAS, no cron de 1 minuto (chamada por avancarContratos):
 * para cada contrato enviado sem assinatura ou assinado sem pagamento, com o
 * automático ligado e dentro do teto, manda o e-mail do passo que venceu, uma
 * vez, em horário comercial. Parcela em atraso não recebe e-mail automático
 * (o Stripe já tenta de novo e avisa); fica na lista para o vendedor.
 */
export async function avancarCobrancas(agora = new Date()): Promise<{ olhadas: number; enviados: number; pulados: number }> {
  if (!automaticoLigado() || !horarioComercial(agora)) return { olhadas: 0, enviados: 0, pulados: 0 };
  const lista = await listaDeCobrancas(agora);
  let enviados = 0;
  let pulados = 0;
  for (const c of lista) {
    if (c.pausado || c.motivo === "parcela") continue;
    const base = new Date(c.baseEm);
    if (agora.getTime() - base.getTime() > TETO_DO_AUTOMATICO_EM_DIAS * DIA_MS) continue;
    const devido = passoAutomaticoDevido(base, agora, CADENCIA_PADRAO);
    if (!devido) continue;
    // A RESERVA: (contrato, tipo, base) é única em contratos_alertas. Quem inseriu envia.
    const tipo = `fup_${c.motivo}_${devido.passo}`;
    const reservado = await prisma.alertaDoContrato.createMany({ data: [{ contratoId: c.contratoId, tipo, fimVigencia: base }], skipDuplicates: true });
    if (reservado.count !== 1) continue;
    const chave = { contratoId_tipo_fimVigencia: { contratoId: c.contratoId, tipo, fimVigencia: base } };
    // O vendedor já falou com o cliente nesta janela: o automático seria repetição.
    const manualNaJanela = c.fups.some((f) => f.origem === "manual" && new Date(f.em).getTime() >= devido.inicioDaJanela.getTime());
    if (manualNaJanela) {
      await prisma.alertaDoContrato.update({ where: chave, data: { situacao: "pulado", detalhe: { motivo: "acompanhamento manual na janela" } } }).catch(() => {});
      pulados++;
      continue;
    }
    const enviado = await enviarEmail(emailDaCobranca(c, devido.passo));
    await prisma.alertaDoContrato.update({ where: chave, data: { situacao: enviado ? "enviado" : "falhou", detalhe: { para: c.email, passo: devido.passo } } }).catch(() => {});
    await registrar(c.contratoId, "sistema", "fup_automatico", { canal: "email", motivo: c.motivo, passo: devido.passo, para: c.email, enviado, resultado: "mensagem_enviada" });
    if (enviado) enviados++;
  }
  return { olhadas: lista.length, enviados, pulados };
}

const DIA_MS = 24 * 60 * 60 * 1000;
