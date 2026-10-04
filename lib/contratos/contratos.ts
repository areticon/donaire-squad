import { put } from "@vercel/blob";
import { prisma } from "@/lib/db/prisma";
import { provedorDeAssinatura, FalhaDoProvedor } from "@/lib/contratos/assinatura";
import { montarTexto } from "@/lib/contratos/modelo";
import { fimDaVigencia, situacaoDoContrato } from "@/lib/contratos/situacao";
import { midiaPrivada } from "@/lib/media/storage";
import { PLANOS_PUBLICOS } from "@/lib/planos";

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
  valorCentavos: number;
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
  if (!Number.isFinite(n.valorCentavos) || n.valorCentavos <= 0) throw new RecusaDoContrato("Informe o valor anual.");
  if (!n.plano) throw new RecusaDoContrato("Informe o plano.");
  const extras = n.acessosExtras ?? null;
  if (extras !== null && (!Number.isInteger(extras) || extras < 0 || extras > 200)) throw new RecusaDoContrato("Acessos extras: um número inteiro de 0 a 200.");
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
      valorCentavos: Math.round(n.valorCentavos),
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
    ...(u.criada ? { contaCriada: u.email } : {}),
  });
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
}) {
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
  const novo = await criarContrato(admin, {
    userId: c.userId,
    plano: c.plano,
    valorCentavos: valorCentavos && valorCentavos > 0 ? valorCentavos : c.valorCentavos,
    inicioVigencia: c.fimVigencia,
    formaDePagamento: c.formaDePagamento,
    empresa: c.empresa,
    endereco: c.endereco,
    signatarioNome: c.signatarioNome,
    signatarioEmail: c.signatarioEmail,
    signatarioDocumento: c.signatarioDocumento,
    renovacaoAutomatica: c.renovacaoAutomatica,
    acessosExtras: c.acessosExtras,
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
