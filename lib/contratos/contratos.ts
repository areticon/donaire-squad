import { put } from "@vercel/blob";
import { prisma } from "@/lib/db/prisma";
import { provedorDeAssinatura, FalhaDoProvedor } from "@/lib/contratos/assinatura";
import { montarTexto } from "@/lib/contratos/modelo";
import { centavosEmReais, fimDaVigencia, situacaoDoContrato } from "@/lib/contratos/situacao";
import { midiaPrivada } from "@/lib/media/storage";
import { PLANOS_PUBLICOS } from "@/lib/planos";
import {
  APROVADOR_PADRAO,
  MOTIVOS_DE_DESCONTO,
  TETO_COM_APROVACAO,
  TETO_SEM_APROVACAO,
  calcularDesconto,
  ehMotivoDeDesconto,
  faixaDoDesconto,
  porcentagem,
  precoDeTabela,
  type FaixaDoDesconto,
  type TipoDeDesconto,
} from "@/lib/contratos/preco";

/**
 * O GESTOR DE CONTRATOS, do lado do servidor (02/10/2026).
 *
 * Um contrato é anual, ligado à conta do cliente, e passa por rascunho,
 * envio para assinar, assinado aguardando pagamento, pago (e, pelas datas,
 * vigente, a vencer e vencido), ou cancelado. O pagamento e a ativação da
 * conta moram em lib/contratos/pagamento.ts (04/10). TODA mudança grava um evento em contratos_eventos com quem
 * fez e o detalhe: é a trilha de auditoria que responde "quem mandou, quando
 * assinou, qual texto".
 *
 * Só servidor.
 */

export class RecusaDoContrato extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

export type Autor = { id: string; email: string } | "sistema" | "provedor" | "stripe";
const nomeDoAutor = (a: Autor) => (typeof a === "string" ? a : a.email);

export async function registrar(contratoId: string, autor: Autor, tipo: string, detalhe?: unknown) {
  await prisma.eventoDoContrato.create({ data: { contratoId, tipo, autor: nomeDoAutor(autor), detalhe: (detalhe ?? undefined) as never } });
}

export function nomeDoPlano(plano: string): string {
  return PLANOS_PUBLICOS.find((p) => p.id === plano)?.nome ?? plano;
}

/** O e-mail de quem aprova desconto acima do teto livre (o dono). */
export function aprovadorDoDesconto(): string {
  return (process.env.CONTRATOS_APROVADOR_EMAIL ?? APROVADOR_PADRAO).trim().toLowerCase();
}

export function ehAprovador(autor: Autor): boolean {
  return typeof autor !== "string" && autor.email.trim().toLowerCase() === aprovadorDoDesconto();
}

/** O desconto como veio do formulário. `valor`: porcentagem (8 ou 7,5) ou reais. */
export type DescontoPedido = {
  tipo: TipoDeDesconto;
  valor: number;
  motivo: string;
  observacao?: string | null;
};

export type PrecoCalculado = {
  precoTabelaCentavos: number;
  descontoTipo: string | null;
  /** Porcentagem em centésimos (800 = 8%) ou centavos. */
  descontoValor: number | null;
  descontoCentavos: number;
  descontoMotivo: string | null;
  descontoObservacao: string | null;
  valorCentavos: number;
  percentual: number;
  faixa: FaixaDoDesconto;
};

/**
 * O PREÇO DO CONTRATO a partir do plano, dos acessos extras e do desconto
 * pedido. Recusa o que passa do teto com aprovação, desconto sem motivo e
 * plano fora da tabela. Ver lib/contratos/preco.ts.
 */
export function calcularPreco(plano: string, acessosExtras: number, desconto: DescontoPedido | null | undefined): PrecoCalculado {
  const tabela = precoDeTabela(plano, acessosExtras);
  if (!tabela) throw new RecusaDoContrato("Plano fora da tabela de preços.");
  const pedido = desconto && Number.isFinite(desconto.valor) && desconto.valor > 0 ? desconto : null;
  if (pedido && pedido.tipo !== "percentual" && pedido.tipo !== "valor") throw new RecusaDoContrato("Desconto: escolha porcentagem ou reais.");
  if (pedido && !ehMotivoDeDesconto(pedido.motivo)) {
    throw new RecusaDoContrato(`Escolha o motivo do desconto: ${Object.values(MOTIVOS_DE_DESCONTO).join(", ").toLowerCase()}.`);
  }
  // Porcentagem vai como digitada (8 = 8%); reais viram centavos.
  const bruto = pedido ? (pedido.tipo === "percentual" ? pedido.valor : Math.round(pedido.valor * 100)) : null;
  const d = calcularDesconto(tabela.totalCentavos, pedido?.tipo ?? null, bruto);
  const faixa = faixaDoDesconto(d.percentual);
  if (faixa === "bloqueado") {
    throw new RecusaDoContrato(`Desconto de ${porcentagem(d.percentual)} passa do teto de ${TETO_COM_APROVACAO}%. Acima disso, o contrato não sai.`);
  }
  return {
    precoTabelaCentavos: tabela.totalCentavos,
    descontoTipo: pedido ? pedido.tipo : null,
    descontoValor: pedido ? Math.round(pedido.valor * 100) : null,
    descontoCentavos: d.descontoCentavos,
    descontoMotivo: pedido ? pedido.motivo : null,
    descontoObservacao: pedido?.observacao?.trim().slice(0, 300) || null,
    valorCentavos: d.finalCentavos,
    percentual: d.percentual,
    faixa,
  };
}

/** O resumo do desconto que vai na trilha. */
export function resumoDoPreco(p: Pick<PrecoCalculado, "precoTabelaCentavos" | "descontoCentavos" | "percentual" | "descontoMotivo" | "valorCentavos" | "faixa">) {
  return {
    tabela: centavosEmReais(p.precoTabelaCentavos),
    desconto: centavosEmReais(p.descontoCentavos),
    percentual: porcentagem(p.percentual),
    motivo: p.descontoMotivo,
    final: centavosEmReais(p.valorCentavos),
    faixa: p.faixa,
  };
}

/**
 * Concedido o desconto (no contrato novo, numa versão nova ou num aditivo),
 * registra na trilha e decide a aprovação: até o teto livre, ninguém aprova;
 * acima, o dono aprova (e, se foi ele quem concedeu, a aprovação já vem junto).
 * Devolve quem aprovou, quando a aprovação veio junto.
 */
export async function registrarDesconto(contratoId: string, autor: Autor, p: PrecoCalculado, onde = "contrato"): Promise<string | null> {
  if (p.descontoCentavos <= 0) return null;
  await registrar(contratoId, autor, "desconto_concedido", { ...resumoDoPreco(p), onde });
  if (p.faixa !== "aprovacao") return null;
  if (ehAprovador(autor)) {
    await registrar(contratoId, autor, "desconto_aprovado", { ...resumoDoPreco(p), onde, comoConcedeu: "o próprio dono concedeu" });
    return nomeDoAutor(autor);
  }
  await registrar(contratoId, autor, "desconto_pede_aprovacao", { ...resumoDoPreco(p), onde, aprovador: aprovadorDoDesconto() });
  void avisarAprovador(contratoId, autor, p, onde).catch((e) => console.error("[contratos] aviso de aprovação não saiu:", e));
  return null;
}

/** O e-mail ao dono: há desconto esperando a aprovação dele. */
async function avisarAprovador(contratoId: string, autor: Autor, p: PrecoCalculado, onde: string) {
  const c = await prisma.contrato.findUnique({ where: { id: contratoId }, select: { numero: true, userId: true, empresa: true, plano: true } });
  if (!c) return;
  const { enviarEmail } = await import("@/lib/email");
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://demandou.com").replace(/\/$/, "");
  const n = String(c.numero).padStart(4, "0");
  const motivo = ehMotivoDeDesconto(p.descontoMotivo) ? MOTIVOS_DE_DESCONTO[p.descontoMotivo].toLowerCase() : (p.descontoMotivo ?? "");
  const linha = `${nomeDoAutor(autor)} deu ${porcentagem(p.percentual)} de desconto (${motivo}) no ${onde} do contrato nº ${n}${c.empresa ? `, ${c.empresa}` : ""}: tabela ${centavosEmReais(p.precoTabelaCentavos)}, valor final ${centavosEmReais(p.valorCentavos)}.`;
  await enviarEmail({
    para: aprovadorDoDesconto(),
    assunto: `Desconto de ${porcentagem(p.percentual)} esperando a sua aprovação (contrato nº ${n})`,
    texto: [linha, "", `Acima de ${TETO_SEM_APROVACAO}%, o documento só vai para assinatura depois da sua aprovação.`, "", `${base}/admin/contratos/${c.userId}`].join("\n"),
  });
}

/** O desconto espera a aprovação do dono? */
export function esperaAprovacao(c: { descontoCentavos: number; precoTabelaCentavos: number | null; descontoAprovadoEm: Date | string | null }): boolean {
  if (!c.precoTabelaCentavos || c.descontoCentavos <= 0) return false;
  return faixaDoDesconto((c.descontoCentavos / c.precoTabelaCentavos) * 100) === "aprovacao" && !c.descontoAprovadoEm;
}

export type NovoContrato = {
  /** A conta de quem já é cliente. Sem ela, vale o `prospect`. */
  userId?: string | null;
  /**
   * O PROSPECT (04/10): quem ainda não tem conta. A conta nasce aqui, sem
   * senha e sem plano, e nada é enviado a ela: até pagar, a pessoa não entra
   * (o portão manda para /aguardando-pagamento). Se o e-mail já tem conta, o
   * contrato vai para ela.
   */
  prospect?: { email: string; nome: string | null } | null;
  acessosExtras?: number | null;
  plano: string;
  /**
   * O valor digitado. Desde 04/10 o valor NASCE da tabela menos o desconto, e
   * este campo só vale na renovação (que repete o valor do contrato anterior).
   */
  valorCentavos?: number | null;
  desconto?: DescontoPedido | null;
  /** Condição de Fundador (cláusula 5.6). */
  fundador?: boolean;
  /** Na renovação: o desconto já foi aprovado no contrato anterior. */
  herdaAprovacaoDe?: { por: string | null; em: Date | null } | null;
  inicioVigencia: Date | null;
  formaDePagamento?: string | null;
  empresa?: string | null;
  endereco?: string | null;
  signatarioNome?: string | null;
  signatarioEmail?: string | null;
  signatarioDocumento?: string | null;
  renovacaoAutomatica?: boolean;
  observacao?: string | null;
  renovadoDeId?: string | null;
};

/** A conta do prospect: a que já existe com o e-mail, ou uma nova, sem senha e sem plano. */
async function contaDoProspect(p: { email: string; nome: string | null }): Promise<{ id: string; email: string; name: string | null; acessosExtras: number; criada: boolean }> {
  const email = p.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new RecusaDoContrato("E-mail do cliente inválido.");
  const ja = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, name: true, acessosExtras: true } });
  if (ja) return { ...ja, criada: false };
  // E-mail confirmado porque quem confirma é o admin que digitou (o mesmo
  // desenho do convite do CRM); sem senha, porque senha escolhida por outra
  // pessoa não é senha. O link de escolher a senha só sai no pagamento.
  const u = await prisma.user.create({
    data: { email, name: p.nome?.trim() || null, emailVerified: true, role: "user", plan: "free" },
    select: { id: true, email: true, name: true, acessosExtras: true },
  });
  return { ...u, criada: true };
}

export async function criarContrato(admin: Autor, n: NovoContrato) {
  if (!n.plano) throw new RecusaDoContrato("Informe o plano.");
  const extras = n.acessosExtras ?? null;
  if (extras !== null && (!Number.isInteger(extras) || extras < 0 || extras > 200)) throw new RecusaDoContrato("Acessos extras: um número inteiro de 0 a 200.");
  // O PREÇO NASCE DA TABELA (04/10). A renovação repete o valor do contrato
  // anterior; aí a tabela é a de hoje e o desconto é a diferença.
  const renovacao = Boolean(n.renovadoDeId && n.valorCentavos && n.valorCentavos > 0);
  const preco = calcularPreco(n.plano, extras ?? 0, renovacao ? null : n.desconto);
  if (renovacao && n.valorCentavos) {
    const desc = Math.max(0, preco.precoTabelaCentavos - n.valorCentavos);
    Object.assign(preco, {
      valorCentavos: n.valorCentavos,
      descontoCentavos: desc,
      descontoTipo: desc > 0 ? "valor" : null,
      descontoValor: desc > 0 ? desc : null,
      descontoMotivo: desc > 0 ? (n.desconto?.motivo ?? "negociacao") : null,
      descontoObservacao: desc > 0 ? "repete o valor do contrato anterior" : null,
      percentual: (desc / preco.precoTabelaCentavos) * 100,
    });
  }
  let u: { id: string; email: string; name: string | null; acessosExtras: number; criada?: boolean } | null = null;
  if (n.userId) {
    u = await prisma.user.findUnique({ where: { id: n.userId }, select: { id: true, email: true, name: true, acessosExtras: true } });
  } else if (n.prospect?.email) {
    u = await contaDoProspect(n.prospect);
  } else {
    throw new RecusaDoContrato("Escolha a conta do cliente ou preencha o e-mail do novo cliente.");
  }
  if (!u) throw new RecusaDoContrato("Conta não encontrada.", 404);
  const c = await prisma.contrato.create({
    data: {
      userId: u.id,
      plano: n.plano,
      valorCentavos: preco.valorCentavos,
      precoTabelaCentavos: preco.precoTabelaCentavos,
      descontoTipo: preco.descontoTipo,
      descontoValor: preco.descontoValor,
      descontoCentavos: preco.descontoCentavos,
      descontoMotivo: preco.descontoMotivo,
      descontoObservacao: preco.descontoObservacao,
      descontoConcedidoPor: preco.descontoCentavos > 0 ? nomeDoAutor(admin) : null,
      descontoConcedidoEm: preco.descontoCentavos > 0 ? new Date() : null,
      descontoAprovadoPor: renovacao ? (n.herdaAprovacaoDe?.por ?? null) : null,
      descontoAprovadoEm: renovacao ? (n.herdaAprovacaoDe?.em ?? null) : null,
      fundador: Boolean(n.fundador || preco.descontoMotivo === "fundador"),
      formaDePagamento: n.formaDePagamento ?? null,
      inicioVigencia: n.inicioVigencia,
      fimVigencia: n.inicioVigencia ? fimDaVigencia(n.inicioVigencia) : null,
      empresa: n.empresa ?? null,
      endereco: n.endereco ?? null,
      signatarioNome: n.signatarioNome ?? u.name ?? null,
      signatarioEmail: n.signatarioEmail ?? u.email,
      acessosExtras: extras ?? u.acessosExtras,
      signatarioDocumento: n.signatarioDocumento ?? null,
      renovacaoAutomatica: n.renovacaoAutomatica ?? true,
      observacao: n.observacao ?? null,
      renovadoDeId: n.renovadoDeId ?? null,
    },
  });
  await registrar(c.id, admin, n.renovadoDeId ? "renovacao_criada" : "criado", {
    plano: c.plano,
    valorCentavos: c.valorCentavos,
    inicio: c.inicioVigencia,
    fim: c.fimVigencia,
    renovadoDe: n.renovadoDeId ?? undefined,
    acessosExtras: c.acessosExtras,
    tabela: centavosEmReais(preco.precoTabelaCentavos),
    desconto: centavosEmReais(preco.descontoCentavos),
    fundador: c.fundador,
    ...(u.criada ? { contaCriada: u.email } : {}),
  });
  if (!renovacao) {
    const aprovou = await registrarDesconto(c.id, admin, preco);
    if (aprovou) await prisma.contrato.update({ where: { id: c.id }, data: { descontoAprovadoPor: aprovou, descontoAprovadoEm: new Date() } });
  }
  return c;
}

export function textoDoContrato(c: {
  numero: number;
  empresa: string | null;
  endereco?: string | null;
  signatarioDocumento: string | null;
  signatarioNome: string | null;
  signatarioEmail: string | null;
  plano: string;
  valorCentavos: number;
  inicioVigencia: Date | null;
  acessosExtras?: number;
  precoTabelaCentavos?: number | null;
  descontoCentavos?: number;
  descontoMotivo?: string | null;
  fundador?: boolean;
}) {
  const tabela = c.precoTabelaCentavos ? precoDeTabela(c.plano, c.acessosExtras ?? 0) : null;
  return montarTexto({
    numero: c.numero,
    empresa: c.empresa,
    documento: c.signatarioDocumento,
    endereco: c.endereco ?? null,
    representante: c.signatarioNome,
    email: c.signatarioEmail,
    plano: nomeDoPlano(c.plano),
    valorCentavos: c.valorCentavos,
    inicioVigencia: c.inicioVigencia,
    acessosExtras: c.acessosExtras ?? 0,
    // A Proposta Comercial (04/10): só nos contratos com o preço de tabela
    // gravado. O total gravado manda (a tabela de hoje pode ter mudado).
    proposta:
      c.precoTabelaCentavos && tabela
        ? {
            planoCentavos: c.precoTabelaCentavos - tabela.extrasCentavos,
            extrasCentavos: tabela.extrasCentavos,
            tabelaCentavos: c.precoTabelaCentavos,
            descontoCentavos: c.descontoCentavos ?? 0,
            descontoMotivo: c.descontoMotivo ?? null,
            fundador: Boolean(c.fundador),
          }
        : null,
  });
}

/**
 * ENVIAR PARA ASSINAR. Sem provedor ligado, o contrato fica "aguardando
 * provedor" (e nada quebra); com provedor, vai o texto montado, o hash dele
 * fica gravado e o signatário recebe o e-mail do provedor.
 */
export async function enviarParaAssinar(admin: Autor, id: string) {
  const c = await prisma.contrato.findUnique({ where: { id }, include: { user: { select: { email: true, name: true } } } });
  if (!c) throw new RecusaDoContrato("Contrato não encontrado.", 404);
  if (c.status !== "rascunho" && c.status !== "enviado") throw new RecusaDoContrato("Só rascunho ou contrato enviado podem ser (re)enviados.");
  if (!c.signatarioEmail || !c.signatarioNome) throw new RecusaDoContrato("Preencha o nome e o e-mail de quem assina.");
  // O TETO DO DESCONTO (04/10): acima do teto livre, só sai com a aprovação do dono na trilha.
  if (esperaAprovacao(c)) {
    const pct = porcentagem((c.descontoCentavos / (c.precoTabelaCentavos ?? 1)) * 100);
    await registrar(id, admin, "envio_barrado_desconto", { percentual: pct, aprovador: aprovadorDoDesconto() });
    throw new RecusaDoContrato(`O desconto de ${pct} passa de ${TETO_SEM_APROVACAO}% e espera a aprovação do dono (${aprovadorDoDesconto()}) antes de ir para assinatura.`, 409);
  }
  // Sem data combinada, o texto diz que a vigência começa na confirmação do
  // pagamento (cláusula 5.1), e é isso que a ativação grava (04/10).

  const t = textoDoContrato(c);
  const provedor = provedorDeAssinatura();
  if (!provedor) {
    await prisma.contrato.update({ where: { id }, data: { provedorSituacao: "aguardando_provedor", modeloVersao: t.versao, textoHash: t.hash } });
    await registrar(id, admin, "aguardando_provedor", { versao: t.versao, hash: t.hash, motivo: "sem chave de provedor de assinatura (ZAPSIGN_API_TOKEN)" });
    return { situacao: "aguardando_provedor" as const };
  }
  // A TRAVA DA MINUTA: texto marcado como minuta só vai para o ambiente de teste.
  if (t.minuta && provedor.ambiente === "producao") {
    await registrar(id, admin, "envio_barrado_minuta", { versao: t.versao });
    throw new RecusaDoContrato("O modelo ainda é a minuta para revisão jurídica. Troque o texto revisado antes de enviar para assinatura de verdade.");
  }
  try {
    const r = await provedor.enviar({
      titulo: `Contrato Demandou nº ${String(c.numero).padStart(4, "0")}, ${c.empresa ?? c.user.name ?? c.user.email}`,
      markdown: t.texto,
      externoId: c.id,
      signatarios: [{ nome: c.signatarioNome, email: c.signatarioEmail }],
    });
    await prisma.contrato.update({
      where: { id },
      data: {
        status: "enviado",
        provedor: provedor.nome,
        provedorDocumentoId: r.documentoId,
        provedorSituacao: "enviado",
        linkDeAssinatura: r.linkDeAssinatura,
        modeloVersao: t.versao,
        textoHash: t.hash,
      },
    });
    await registrar(id, admin, "enviado", { provedor: provedor.nome, ambiente: provedor.ambiente, documento: r.documentoId, versao: t.versao, hash: t.hash, para: c.signatarioEmail });
    return { situacao: "enviado" as const, link: r.linkDeAssinatura };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.contrato.update({ where: { id }, data: { provedorSituacao: "erro" } });
    await registrar(id, admin, "erro_no_envio", { erro: msg.slice(0, 500) });
    throw new RecusaDoContrato(e instanceof FalhaDoProvedor ? "O provedor de assinatura recusou o envio. O detalhe está na trilha do contrato." : "Não consegui falar com o provedor de assinatura.", 502);
  }
}

/** Guarda o PDF assinado no store PRIVADO (a URL do provedor expira). */
async function guardarPdf(contratoId: string, conteudo: Blob | Buffer): Promise<string> {
  const destino = midiaPrivada();
  const blob = await put(`contratos/${contratoId}/assinado.pdf`, conteudo, {
    access: destino.access,
    token: destino.token,
    addRandomSuffix: true,
    contentType: "application/pdf",
  });
  return blob.url;
}

/**
 * Marca como ASSINADO. A vigência começa na data combinada (ou na assinatura,
 * se nada foi combinado) e dura um ano. `pdf` é o arquivo assinado, quando há.
 */
export async function marcarAssinado(autor: Autor, id: string, args: { assinadoEm?: Date; pdf?: Blob | Buffer | null; origem: string }) {
  const c = await prisma.contrato.findUnique({ where: { id } });
  if (!c) throw new RecusaDoContrato("Contrato não encontrado.", 404);
  if (c.status === "cancelado") throw new RecusaDoContrato("Contrato cancelado não pode ser assinado.");
  const assinadoEm = args.assinadoEm ?? new Date();
  const pdfUrl = args.pdf ? await guardarPdf(id, args.pdf) : c.pdfAssinadoUrl;
  // Sem data combinada, a vigência só ganha datas no pagamento (cláusula 5.1).
  const inicio = c.inicioVigencia ?? c.pagoEm ?? null;
  const base = { status: "assinado", inicioVigencia: inicio, fimVigencia: inicio ? fimDaVigencia(inicio) : null, pagoEm: c.pagoEm };
  const status = situacaoDoContrato(base);
  await prisma.contrato.update({
    where: { id },
    // Assinado por fora enquanto esperava o provedor: o "aguardando" perde o sentido.
    data: { status, inicioVigencia: base.inicioVigencia, fimVigencia: base.fimVigencia, assinadoEm, pdfAssinadoUrl: pdfUrl, provedorSituacao: c.provedor ? "assinado" : null },
  });
  await registrar(id, autor, "assinado", { origem: args.origem, assinadoEm, inicio, fim: base.fimVigencia, comPdf: Boolean(pdfUrl), aguardaPagamento: !c.pagoEm });
  // Pago antes de assinar (o link do Stripe chegou primeiro): ativa agora.
  if (c.pagoEm) {
    const { ativarSePronto } = await import("@/lib/contratos/pagamento");
    await ativarSePronto(autor, id);
  }
  return { status };
}

/** Reconsulta o provedor (pelo botão do admin ou pelo webhook) e aplica o que mudou. */
export async function sincronizarComProvedor(autor: Autor, id: string) {
  const c = await prisma.contrato.findUnique({ where: { id } });
  if (!c?.provedorDocumentoId) throw new RecusaDoContrato("Este contrato ainda não foi para o provedor.");
  const provedor = provedorDeAssinatura();
  if (!provedor) throw new RecusaDoContrato("Nenhum provedor de assinatura ligado.");
  const s = await provedor.consultar(c.provedorDocumentoId);
  if (s.situacao === "assinado" && c.status === "enviado") {
    let pdf: Buffer | null = null;
    if (s.pdfAssinadoUrl) {
      const r = await fetch(s.pdfAssinadoUrl, { signal: AbortSignal.timeout(30_000) }).catch(() => null);
      if (r?.ok) pdf = Buffer.from(await r.arrayBuffer());
    }
    return marcarAssinado(autor, id, { assinadoEm: s.assinadoEm ?? undefined, pdf, origem: provedor.nome });
  }
  if (s.situacao === "recusado" && c.provedorSituacao !== "recusado") {
    await prisma.contrato.update({ where: { id }, data: { provedorSituacao: "recusado" } });
    await registrar(id, autor, "recusado_pelo_signatario", {});
  }
  return { status: c.status, provedor: s.situacao };
}

export async function cancelarContrato(admin: Autor, id: string, motivo: string) {
  if (motivo.trim().length < 3) throw new RecusaDoContrato("Escreva o motivo do cancelamento.");
  const c = await prisma.contrato.findUnique({ where: { id }, select: { status: true } });
  if (!c) throw new RecusaDoContrato("Contrato não encontrado.", 404);
  if (c.status === "cancelado") return { status: "cancelado" };
  await prisma.contrato.update({ where: { id }, data: { status: "cancelado", canceladoEm: new Date(), motivoCancelamento: motivo.trim() } });
  await registrar(id, admin, "cancelado", { de: c.status, motivo: motivo.trim() });
  return { status: "cancelado" };
}

/** A renovação: um contrato novo, em rascunho, começando no fim do atual. */
export async function renovarContrato(admin: Autor, id: string, valorCentavos?: number | null) {
  const c = await prisma.contrato.findUnique({ where: { id } });
  if (!c) throw new RecusaDoContrato("Contrato não encontrado.", 404);
  if (!c.fimVigencia) throw new RecusaDoContrato("Contrato sem vigência não renova.");
  const ja = await prisma.contrato.findFirst({ where: { renovadoDeId: id, status: { not: "cancelado" } }, select: { numero: true } });
  if (ja) throw new RecusaDoContrato(`Este contrato já tem renovação (nº ${String(ja.numero).padStart(4, "0")}).`);
  // As condições que valem HOJE (04/10): as do último aditivo aplicado, ou as
  // do contrato. O crédito dos aditivos que baixaram o valor é abatido aqui.
  const vale = await condicoesVigentes(id);
  const credito = vale.creditoCentavos;
  const base = valorCentavos && valorCentavos > 0 ? valorCentavos : vale.valorAnualCentavos;
  const novo = await criarContrato(admin, {
    userId: c.userId,
    plano: vale.plano,
    valorCentavos: Math.max(1, base - credito),
    fundador: vale.fundador,
    desconto: vale.descontoMotivo ? { tipo: "valor", valor: 0, motivo: vale.descontoMotivo } : null,
    herdaAprovacaoDe: { por: c.descontoAprovadoPor, em: c.descontoAprovadoEm },
    observacao: credito > 0 ? `Crédito de ${centavosEmReais(credito)} dos aditivos abatido do valor da renovação.` : null,
    inicioVigencia: c.fimVigencia,
    formaDePagamento: c.formaDePagamento,
    empresa: c.empresa,
    endereco: c.endereco,
    signatarioNome: c.signatarioNome,
    signatarioEmail: c.signatarioEmail,
    signatarioDocumento: c.signatarioDocumento,
    renovacaoAutomatica: c.renovacaoAutomatica,
    acessosExtras: vale.acessosExtras,
    renovadoDeId: c.id,
  });
  await registrar(id, admin, "renovado", { novo: novo.id, numero: novo.numero });
  return { id: novo.id, numero: novo.numero };
}

/** Guarda o PDF assinado que chegou por fora do provedor (upload do admin). */
export async function anexarPdf(admin: Autor, id: string, pdf: Blob) {
  const url = await guardarPdf(id, pdf);
  await prisma.contrato.update({ where: { id }, data: { pdfAssinadoUrl: url } });
  await registrar(id, admin, "pdf_anexado", { tamanho: pdf.size });
  return { ok: true };
}

/**
 * AS CONDIÇÕES QUE VALEM HOJE (04/10): as do último aditivo aplicado ou, sem
 * aditivo, as do contrato assinado. É o "antes" do próximo aditivo e a base da
 * renovação. `creditoCentavos` soma os créditos dos aditivos que baixaram o
 * valor (abatidos na renovação).
 */
export async function condicoesVigentes(contratoId: string) {
  const c = await prisma.contrato.findUnique({ where: { id: contratoId } });
  if (!c) throw new RecusaDoContrato("Contrato não encontrado.", 404);
  const aplicados = await prisma.aditivoDoContrato.findMany({ where: { contratoId, status: "aplicado" }, orderBy: { ordem: "asc" } });
  const ultimo = aplicados.at(-1);
  const creditoCentavos = aplicados.filter((a) => a.diferencaCentavos < 0).reduce((t, a) => t - a.diferencaCentavos, 0);
  if (ultimo) {
    return {
      origem: `aditivo nº ${ultimo.ordem}`,
      plano: ultimo.plano,
      acessosExtras: ultimo.acessosExtras,
      tabelaCentavos: ultimo.precoTabelaCentavos as number | null,
      descontoCentavos: ultimo.descontoCentavos,
      descontoMotivo: ultimo.descontoMotivo,
      valorAnualCentavos: ultimo.valorAnualCentavos,
      fundador: ultimo.fundador,
      creditoCentavos,
    };
  }
  return {
    origem: "contrato",
    plano: c.plano,
    acessosExtras: c.acessosExtras,
    tabelaCentavos: c.precoTabelaCentavos,
    descontoCentavos: c.descontoCentavos,
    descontoMotivo: c.descontoMotivo,
    valorAnualCentavos: c.valorCentavos,
    fundador: c.fundador,
    creditoCentavos,
  };
}

/** O que dá para mudar num contrato antes de assinar. */
export type MudancaDoContrato = {
  plano?: string;
  acessosExtras?: number | null;
  /** null tira o desconto; undefined mantém o que está. */
  desconto?: DescontoPedido | null;
  fundador?: boolean;
  inicioVigencia?: Date | null;
  formaDePagamento?: string | null;
  empresa?: string | null;
  endereco?: string | null;
  signatarioNome?: string | null;
  signatarioEmail?: string | null;
  signatarioDocumento?: string | null;
  renovacaoAutomatica?: boolean;
  observacao?: string | null;
};

const CAMPOS_DA_VERSAO = [
  "plano",
  "acessosExtras",
  "valorCentavos",
  "precoTabelaCentavos",
  "descontoTipo",
  "descontoValor",
  "descontoCentavos",
  "descontoMotivo",
  "descontoObservacao",
  "descontoConcedidoPor",
  "descontoAprovadoPor",
  "fundador",
  "inicioVigencia",
  "formaDePagamento",
  "empresa",
  "endereco",
  "signatarioNome",
  "signatarioEmail",
  "signatarioDocumento",
  "renovacaoAutomatica",
  "observacao",
  "textoHash",
  "provedorDocumentoId",
] as const;

/**
 * EDITAR ANTES DE ASSINAR (04/10): o contrato ganha uma VERSÃO nova, e a
 * anterior fica inteira na trilha (evento "nova_versao"). Se a versão
 * anterior já estava no provedor, o envio é cancelado lá (o link antigo deixa
 * de valer) e a versão nova é reenviada; se o desconto novo pedir aprovação,
 * o reenvio espera por ela. Contrato assinado não se edita: é aditivo.
 */
export async function editarContrato(admin: Autor, id: string, m: MudancaDoContrato) {
  const c = await prisma.contrato.findUnique({ where: { id } });
  if (!c) throw new RecusaDoContrato("Contrato não encontrado.", 404);
  if (c.assinadoEm || (c.status !== "rascunho" && c.status !== "enviado")) {
    throw new RecusaDoContrato("Contrato assinado não é editado. Para mudar plano, acessos, valor ou desconto, crie um aditivo.");
  }
  const plano = m.plano ?? c.plano;
  const extras = m.acessosExtras ?? c.acessosExtras;
  if (!Number.isInteger(extras) || extras < 0 || extras > 200) throw new RecusaDoContrato("Acessos extras: um número inteiro de 0 a 200.");
  const descontoAtual: DescontoPedido | null =
    c.descontoTipo && c.descontoValor && c.descontoMotivo
      ? { tipo: c.descontoTipo as TipoDeDesconto, valor: c.descontoValor / 100, motivo: c.descontoMotivo, observacao: c.descontoObservacao }
      : null;
  const preco = calcularPreco(plano, extras, m.desconto === undefined ? descontoAtual : m.desconto);
  const precoMudou = preco.precoTabelaCentavos !== c.precoTabelaCentavos || preco.descontoCentavos !== c.descontoCentavos || preco.descontoMotivo !== c.descontoMotivo;

  const anterior = Object.fromEntries(CAMPOS_DA_VERSAO.map((k) => [k, c[k] instanceof Date ? (c[k] as Date).toISOString() : c[k]]));
  const novo = {
    plano,
    acessosExtras: extras,
    valorCentavos: preco.valorCentavos,
    precoTabelaCentavos: preco.precoTabelaCentavos,
    descontoTipo: preco.descontoTipo,
    descontoValor: preco.descontoValor,
    descontoCentavos: preco.descontoCentavos,
    descontoMotivo: preco.descontoMotivo,
    descontoObservacao: preco.descontoObservacao,
    ...(precoMudou
      ? {
          descontoConcedidoPor: preco.descontoCentavos > 0 ? nomeDoAutor(admin) : null,
          descontoConcedidoEm: preco.descontoCentavos > 0 ? new Date() : null,
          // Preço novo, aprovação nova: a do preço antigo não vale para este.
          descontoAprovadoPor: null,
          descontoAprovadoEm: null,
        }
      : {}),
    fundador: m.fundador ?? (c.fundador || preco.descontoMotivo === "fundador"),
    inicioVigencia: m.inicioVigencia === undefined ? c.inicioVigencia : m.inicioVigencia,
    fimVigencia: (m.inicioVigencia === undefined ? c.inicioVigencia : m.inicioVigencia) ? fimDaVigencia((m.inicioVigencia === undefined ? c.inicioVigencia : m.inicioVigencia) as Date) : null,
    formaDePagamento: m.formaDePagamento === undefined ? c.formaDePagamento : m.formaDePagamento,
    empresa: m.empresa === undefined ? c.empresa : m.empresa,
    endereco: m.endereco === undefined ? c.endereco : m.endereco,
    signatarioNome: m.signatarioNome === undefined ? c.signatarioNome : m.signatarioNome,
    signatarioEmail: m.signatarioEmail === undefined ? c.signatarioEmail : m.signatarioEmail,
    signatarioDocumento: m.signatarioDocumento === undefined ? c.signatarioDocumento : m.signatarioDocumento,
    renovacaoAutomatica: m.renovacaoAutomatica ?? c.renovacaoAutomatica,
    observacao: m.observacao === undefined ? c.observacao : m.observacao,
  };
  const mudou = (Object.keys(novo) as Array<keyof typeof novo>).filter((k) => {
    const a = c[k as keyof typeof c];
    const b = novo[k];
    return (a instanceof Date ? a.getTime() : a) !== (b instanceof Date ? b.getTime() : b);
  });
  if (!mudou.length) throw new RecusaDoContrato("Nada mudou nesta versão.");

  // Já estava no provedor: cancela o envio antes de qualquer coisa. Se o
  // provedor recusar o cancelamento, nada muda aqui (o link velho não pode
  // ficar assinável com um contrato diferente do que vale).
  const estavaEnviado = c.status === "enviado" && Boolean(c.provedorDocumentoId);
  if (estavaEnviado && c.provedorDocumentoId) {
    const provedor = provedorDeAssinatura();
    if (!provedor) throw new RecusaDoContrato("O contrato está no provedor de assinatura, e o provedor não está ligado para cancelar o envio.");
    try {
      await provedor.cancelar(c.provedorDocumentoId);
    } catch (e) {
      await registrar(id, admin, "erro_no_cancelamento_do_envio", { documento: c.provedorDocumentoId, erro: (e instanceof Error ? e.message : String(e)).slice(0, 500) });
      throw new RecusaDoContrato("O provedor de assinatura não cancelou o envio anterior. Nada foi mudado.", 502);
    }
    await registrar(id, admin, "envio_cancelado", { provedor: provedor.nome, documento: c.provedorDocumentoId, motivo: `versão ${c.versao + 1} do contrato` });
  }

  await prisma.contrato.update({
    where: { id },
    data: {
      ...novo,
      versao: c.versao + 1,
      status: "rascunho",
      ...(estavaEnviado || c.provedorSituacao ? { provedorDocumentoId: null, provedorSituacao: null, linkDeAssinatura: null, provedor: null, textoHash: null, modeloVersao: null } : {}),
    },
  });
  await registrar(id, admin, "nova_versao", { de: c.versao, para: c.versao + 1, mudou, anterior, ...(precoMudou ? resumoDoPreco(preco) : {}) });
  if (precoMudou) {
    const aprovou = await registrarDesconto(id, admin, preco);
    if (aprovou) await prisma.contrato.update({ where: { id }, data: { descontoAprovadoPor: aprovou, descontoAprovadoEm: new Date() } });
  }

  if (!estavaEnviado) return { versao: c.versao + 1, reenviado: false as const };
  try {
    const r = await enviarParaAssinar(admin, id);
    return { versao: c.versao + 1, reenviado: true as const, situacao: r.situacao };
  } catch (e) {
    if (e instanceof RecusaDoContrato) return { versao: c.versao + 1, reenviado: false as const, motivo: e.message };
    throw e;
  }
}

/** O DONO APROVA o desconto acima do teto livre; a aprovação fica na trilha. */
export async function aprovarDesconto(admin: Autor, id: string) {
  if (!ehAprovador(admin)) throw new RecusaDoContrato(`Só o dono (${aprovadorDoDesconto()}) aprova desconto acima de ${TETO_SEM_APROVACAO}%.`, 403);
  const c = await prisma.contrato.findUnique({ where: { id } });
  if (!c) throw new RecusaDoContrato("Contrato não encontrado.", 404);
  if (!esperaAprovacao(c)) throw new RecusaDoContrato("Este contrato não tem desconto esperando aprovação.");
  const pct = (c.descontoCentavos / (c.precoTabelaCentavos ?? 1)) * 100;
  await prisma.contrato.update({ where: { id }, data: { descontoAprovadoPor: nomeDoAutor(admin), descontoAprovadoEm: new Date() } });
  await registrar(id, admin, "desconto_aprovado", {
    tabela: centavosEmReais(c.precoTabelaCentavos ?? 0),
    desconto: centavosEmReais(c.descontoCentavos),
    percentual: porcentagem(pct),
    motivo: c.descontoMotivo,
    final: centavosEmReais(c.valorCentavos),
    concedidoPor: c.descontoConcedidoPor,
    versao: c.versao,
  });
  return { aprovado: true };
}

/** O DONO RECUSA o desconto: o contrato fica em rascunho até uma versão nova. */
export async function recusarDesconto(admin: Autor, id: string, motivo: string) {
  if (!ehAprovador(admin)) throw new RecusaDoContrato(`Só o dono (${aprovadorDoDesconto()}) decide desconto acima de ${TETO_SEM_APROVACAO}%.`, 403);
  if (motivo.trim().length < 3) throw new RecusaDoContrato("Escreva o motivo da recusa.");
  const c = await prisma.contrato.findUnique({ where: { id } });
  if (!c) throw new RecusaDoContrato("Contrato não encontrado.", 404);
  if (!esperaAprovacao(c)) throw new RecusaDoContrato("Este contrato não tem desconto esperando aprovação.");
  await registrar(id, admin, "desconto_recusado", { motivo: motivo.trim(), percentual: porcentagem((c.descontoCentavos / (c.precoTabelaCentavos ?? 1)) * 100), versao: c.versao });
  return { recusado: true };
}
