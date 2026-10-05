import { put } from "@vercel/blob";
import { prisma } from "@/lib/db/prisma";
import { provedorDeAssinatura, FalhaDoProvedor } from "@/lib/contratos/assinatura";
import {
  RecusaDoContrato,
  aprovadorDoDesconto,
  calcularPreco,
  condicoesVigentes,
  ehAprovador,
  esperaAprovacao,
  nomeDoPlano,
  registrar,
  registrarDesconto,
  type Autor,
  type DescontoPedido,
} from "@/lib/contratos/contratos";
import { montarAditivo, type CondicoesComerciais } from "@/lib/contratos/modelo";
import { TETO_SEM_APROVACAO, diferencaProporcional, porcentagem } from "@/lib/contratos/preco";
import { centavosEmReais } from "@/lib/contratos/situacao";
import { midiaPrivada } from "@/lib/media/storage";

/**
 * OS ADITIVOS DO CONTRATO (04/10/2026).
 *
 * Contrato assinado NÃO é editado. Para mudar valor, plano, acessos extras ou
 * desconto depois da assinatura, o gestor cria um ADITIVO: um documento curto
 * que referencia o contrato, diz o que muda, desde quando e a diferença de
 * valor (a proporcional dos dias que faltam: positiva, o cliente paga à vista;
 * negativa, vira crédito abatido na renovação). Ele vai para assinatura pelo
 * mesmo provedor do contrato e, assinado e (se houver diferença a pagar)
 * pago, a mudança é aplicada na conta, uma vez só.
 *
 * O desconto do aditivo segue os mesmos tetos do contrato (lib/contratos/preco).
 * A trilha é a do contrato: cada passo grava um evento "aditivo_*" com o id.
 *
 * Só servidor.
 */

/** Aditivo em andamento: só um por contrato, para as diferenças não se cruzarem. */
const EM_ANDAMENTO = ["rascunho", "enviado", "aguardando_pagamento"];

export type NovoAditivo = {
  plano: string;
  acessosExtras: number;
  desconto?: DescontoPedido | null;
  fundador?: boolean;
  /** Desde quando a mudança vale (padrão: hoje). */
  valeDesde?: Date | null;
};

const meioDia = (d: Date) => new Date(`${d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })}T12:00:00-03:00`);

export async function criarAditivo(admin: Autor, contratoId: string, n: NovoAditivo) {
  const c = await prisma.contrato.findUnique({ where: { id: contratoId } });
  if (!c) throw new RecusaDoContrato("Contrato não encontrado.", 404);
  if (c.status === "cancelado") throw new RecusaDoContrato("Contrato cancelado não recebe aditivo.");
  if (!c.assinadoEm) throw new RecusaDoContrato("Contrato ainda não assinado se edita direto (nova versão), sem aditivo.");
  if (!c.ativadoEm || !c.inicioVigencia || !c.fimVigencia) {
    throw new RecusaDoContrato("O aditivo vale para contrato assinado, pago e ativo. Enquanto o contrato aguarda pagamento, a mudança espera a ativação.");
  }
  const aberto = await prisma.aditivoDoContrato.findFirst({ where: { contratoId, status: { in: EM_ANDAMENTO } }, select: { ordem: true } });
  if (aberto) throw new RecusaDoContrato(`O aditivo nº ${aberto.ordem} deste contrato ainda está em andamento. Conclua ou cancele antes de abrir outro.`);
  if (!Number.isInteger(n.acessosExtras) || n.acessosExtras < 0 || n.acessosExtras > 200) throw new RecusaDoContrato("Acessos extras: um número inteiro de 0 a 200.");

  const antes = await condicoesVigentes(contratoId);
  const preco = calcularPreco(n.plano, n.acessosExtras, n.desconto);
  const fundador = Boolean(n.fundador || preco.descontoMotivo === "fundador");
  if (
    n.plano === antes.plano &&
    n.acessosExtras === antes.acessosExtras &&
    preco.valorCentavos === antes.valorAnualCentavos &&
    fundador === antes.fundador &&
    preco.descontoMotivo === antes.descontoMotivo
  ) {
    throw new RecusaDoContrato("Nada muda em relação às condições de hoje.");
  }
  const desde = meioDia(n.valeDesde ?? new Date());
  if (desde < c.inicioVigencia || desde >= c.fimVigencia) throw new RecusaDoContrato("A data em que a mudança vale precisa estar dentro da vigência em curso.");
  const dif = diferencaProporcional({ valorAtualCentavos: antes.valorAnualCentavos, valorNovoCentavos: preco.valorCentavos, inicioVigencia: c.inicioVigencia, fimVigencia: c.fimVigencia, desde });
  const tratamento = dif.diferencaCentavos > 0 ? "cobrar" : dif.diferencaCentavos < 0 ? "creditar" : "sem_diferenca";
  const ordem = (await prisma.aditivoDoContrato.count({ where: { contratoId } })) + 1;

  const a = await prisma.aditivoDoContrato.create({
    data: {
      contratoId,
      ordem,
      anterior: antes,
      plano: n.plano,
      acessosExtras: n.acessosExtras,
      precoTabelaCentavos: preco.precoTabelaCentavos,
      descontoTipo: preco.descontoTipo,
      descontoValor: preco.descontoValor,
      descontoCentavos: preco.descontoCentavos,
      descontoMotivo: preco.descontoMotivo,
      descontoObservacao: preco.descontoObservacao,
      descontoConcedidoPor: preco.descontoCentavos > 0 ? (typeof admin === "string" ? admin : admin.email) : null,
      fundador,
      valorAnualCentavos: preco.valorCentavos,
      valeDesde: desde,
      diferencaCentavos: dif.diferencaCentavos,
      diasRestantes: dif.diasRestantes,
      tratamento,
      autor: typeof admin === "string" ? admin : admin.email,
    },
  });
  await registrar(contratoId, admin, "aditivo_criado", {
    aditivo: a.id,
    ordem,
    de: `${nomeDoPlano(antes.plano)}, ${antes.acessosExtras} extra(s), ${centavosEmReais(antes.valorAnualCentavos)}`,
    para: `${nomeDoPlano(a.plano)}, ${a.acessosExtras} extra(s), ${centavosEmReais(a.valorAnualCentavos)}`,
    valeDesde: desde,
    diferenca: centavosEmReais(dif.diferencaCentavos),
    tratamento,
    diasRestantes: dif.diasRestantes,
  });
  const aprovou = await registrarDesconto(contratoId, admin, preco, `aditivo nº ${ordem}`);
  if (aprovou) await prisma.aditivoDoContrato.update({ where: { id: a.id }, data: { descontoAprovadoPor: aprovou, descontoAprovadoEm: new Date() } });
  return { id: a.id, ordem, diferencaCentavos: dif.diferencaCentavos, tratamento };
}

async function carregar(aditivoId: string) {
  const a = await prisma.aditivoDoContrato.findUnique({ where: { id: aditivoId }, include: { contrato: { include: { user: { select: { email: true, name: true } } } } } });
  if (!a) throw new RecusaDoContrato("Aditivo não encontrado.", 404);
  return a;
}

export function textoDoAditivo(a: Awaited<ReturnType<typeof carregar>>) {
  const c = a.contrato;
  const ant = a.anterior as unknown as { plano: string; acessosExtras: number; tabelaCentavos: number | null; descontoCentavos: number; descontoMotivo: string | null; valorAnualCentavos: number; fundador: boolean };
  const antes: CondicoesComerciais = { ...ant, plano: nomeDoPlano(ant.plano) };
  const depois: CondicoesComerciais = {
    plano: nomeDoPlano(a.plano),
    acessosExtras: a.acessosExtras,
    tabelaCentavos: a.precoTabelaCentavos,
    descontoCentavos: a.descontoCentavos,
    descontoMotivo: a.descontoMotivo,
    valorAnualCentavos: a.valorAnualCentavos,
    fundador: a.fundador,
  };
  const dias = c.inicioVigencia && c.fimVigencia ? Math.round((c.fimVigencia.getTime() - c.inicioVigencia.getTime()) / 864e5) : 365;
  return montarAditivo({
    ordem: a.ordem,
    numeroDoContrato: c.numero,
    assinadoEm: c.assinadoEm,
    fimVigencia: c.fimVigencia,
    empresa: c.empresa,
    documento: c.signatarioDocumento,
    representante: c.signatarioNome,
    email: c.signatarioEmail,
    antes,
    depois,
    valeDesde: a.valeDesde,
    diferencaCentavos: a.diferencaCentavos,
    diasRestantes: a.diasRestantes,
    diasDaVigencia: dias,
  });
}

/** O texto do aditivo, para o admin conferir antes de enviar. */
export async function textoDoAditivoPorId(aditivoId: string) {
  return textoDoAditivo(await carregar(aditivoId));
}

/** ENVIAR O ADITIVO PARA ASSINAR, pelo mesmo provedor do contrato. */
export async function enviarAditivo(admin: Autor, aditivoId: string) {
  const a = await carregar(aditivoId);
  const c = a.contrato;
  if (a.status !== "rascunho" && a.status !== "enviado") throw new RecusaDoContrato("Só aditivo em rascunho ou enviado pode ser (re)enviado.");
  if (!c.signatarioEmail || !c.signatarioNome) throw new RecusaDoContrato("O contrato não tem nome e e-mail de quem assina.");
  if (esperaAprovacao(a)) {
    const pct = porcentagem((a.descontoCentavos / a.precoTabelaCentavos) * 100);
    await registrar(c.id, admin, "envio_barrado_desconto", { aditivo: a.id, ordem: a.ordem, percentual: pct, aprovador: aprovadorDoDesconto() });
    throw new RecusaDoContrato(`O desconto de ${pct} do aditivo passa de ${TETO_SEM_APROVACAO}% e espera a aprovação do dono (${aprovadorDoDesconto()}) antes de ir para assinatura.`, 409);
  }
  const t = textoDoAditivo(a);
  const provedor = provedorDeAssinatura();
  if (!provedor) {
    await prisma.aditivoDoContrato.update({ where: { id: a.id }, data: { provedorSituacao: "aguardando_provedor", modeloVersao: t.versao, textoHash: t.hash } });
    await registrar(c.id, admin, "aguardando_provedor", { aditivo: a.id, ordem: a.ordem, motivo: "sem chave de provedor de assinatura (ZAPSIGN_API_TOKEN)" });
    return { situacao: "aguardando_provedor" as const };
  }
  // Reenvio: o documento anterior sai do provedor antes do novo entrar.
  if (a.status === "enviado" && a.provedorDocumentoId) {
    await provedor.cancelar(a.provedorDocumentoId).catch(() => undefined);
    await registrar(c.id, admin, "envio_cancelado", { aditivo: a.id, documento: a.provedorDocumentoId, motivo: "reenvio do aditivo" });
  }
  try {
    const r = await provedor.enviar({
      titulo: `Aditivo nº ${a.ordem} ao contrato Demandou nº ${String(c.numero).padStart(4, "0")}, ${c.empresa ?? c.user.name ?? c.user.email}`,
      markdown: t.texto,
      externoId: a.id,
      signatarios: [{ nome: c.signatarioNome, email: c.signatarioEmail }],
    });
    await prisma.aditivoDoContrato.update({
      where: { id: a.id },
      data: { status: "enviado", provedor: provedor.nome, provedorDocumentoId: r.documentoId, provedorSituacao: "enviado", linkDeAssinatura: r.linkDeAssinatura, modeloVersao: t.versao, textoHash: t.hash },
    });
    await registrar(c.id, admin, "aditivo_enviado", { aditivo: a.id, ordem: a.ordem, provedor: provedor.nome, ambiente: provedor.ambiente, documento: r.documentoId, hash: t.hash, para: c.signatarioEmail });
    return { situacao: "enviado" as const, link: r.linkDeAssinatura };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.aditivoDoContrato.update({ where: { id: a.id }, data: { provedorSituacao: "erro" } });
    await registrar(c.id, admin, "erro_no_envio", { aditivo: a.id, erro: msg.slice(0, 500) });
    throw new RecusaDoContrato(e instanceof FalhaDoProvedor ? "O provedor de assinatura recusou o envio do aditivo. O detalhe está na trilha do contrato." : "Não consegui falar com o provedor de assinatura.", 502);
  }
}

async function guardarPdfDoAditivo(aditivoId: string, contratoId: string, conteudo: Blob | Buffer): Promise<string> {
  const destino = midiaPrivada();
  const blob = await put(`contratos/${contratoId}/aditivos/${aditivoId}.pdf`, conteudo, { access: destino.access, token: destino.token, addRandomSuffix: true, contentType: "application/pdf" });
  return blob.url;
}

/** O ADITIVO ASSINADO: com diferença a pagar, espera o pagamento; sem ela, aplica. */
export async function marcarAditivoAssinado(autor: Autor, aditivoId: string, args: { assinadoEm?: Date; pdf?: Blob | Buffer | null; origem: string }) {
  const a = await carregar(aditivoId);
  if (a.status === "cancelado" || a.status === "aplicado") throw new RecusaDoContrato(`Aditivo ${a.status} não muda de situação.`);
  if (a.assinadoEm) return { status: a.status };
  if (esperaAprovacao(a)) throw new RecusaDoContrato("O desconto deste aditivo ainda espera a aprovação do dono.");
  const assinadoEm = args.assinadoEm ?? new Date();
  const pdfUrl = args.pdf ? await guardarPdfDoAditivo(a.id, a.contratoId, args.pdf) : a.pdfAssinadoUrl;
  const status = a.diferencaCentavos > 0 ? "aguardando_pagamento" : a.status;
  await prisma.aditivoDoContrato.update({ where: { id: a.id }, data: { assinadoEm, pdfAssinadoUrl: pdfUrl, status, provedorSituacao: a.provedor ? "assinado" : null } });
  await registrar(a.contratoId, autor, "aditivo_assinado", { aditivo: a.id, ordem: a.ordem, origem: args.origem, assinadoEm, comPdf: Boolean(pdfUrl), aguardaPagamento: a.diferencaCentavos > 0 });
  const aplicacao = await aplicarSePronto(autor, a.id);
  return { status: aplicacao ? "aplicado" : status };
}

/** Reconsulta o provedor do aditivo (botão do admin ou webhook). */
export async function sincronizarAditivo(autor: Autor, aditivoId: string) {
  const a = await carregar(aditivoId);
  if (!a.provedorDocumentoId) throw new RecusaDoContrato("Este aditivo ainda não foi para o provedor.");
  const provedor = provedorDeAssinatura();
  if (!provedor) throw new RecusaDoContrato("Nenhum provedor de assinatura ligado.");
  const s = await provedor.consultar(a.provedorDocumentoId);
  if (s.situacao === "assinado" && a.status === "enviado") {
    let pdf: Buffer | null = null;
    if (s.pdfAssinadoUrl) {
      const r = await fetch(s.pdfAssinadoUrl, { signal: AbortSignal.timeout(30_000) }).catch(() => null);
      if (r?.ok) pdf = Buffer.from(await r.arrayBuffer());
    }
    return marcarAditivoAssinado(autor, a.id, { assinadoEm: s.assinadoEm ?? undefined, pdf, origem: provedor.nome });
  }
  if (s.situacao === "recusado" && a.provedorSituacao !== "recusado") {
    await prisma.aditivoDoContrato.update({ where: { id: a.id }, data: { provedorSituacao: "recusado" } });
    await registrar(a.contratoId, autor, "recusado_pelo_signatario", { aditivo: a.id, ordem: a.ordem });
  }
  return { status: a.status, provedor: s.situacao };
}

/** Chamado por lib/contratos/pagamento depois de lançar um pagamento com aditivoId. */
export async function pagamentoDoAditivoLancado(
  autor: Autor,
  aditivoId: string,
  pagamentoId: string,
  p: { valorCentavos: number; pagoEm: Date; forma: string; origem: string; comComprovante: boolean },
) {
  const a = await prisma.aditivoDoContrato.findUniqueOrThrow({ where: { id: aditivoId }, select: { id: true, contratoId: true, ordem: true, diferencaCentavos: true } });
  const total = (await prisma.pagamentoDoContrato.aggregate({ where: { aditivoId }, _sum: { valorCentavos: true } }))._sum.valorCentavos ?? 0;
  await registrar(a.contratoId, autor, "aditivo_pagamento", {
    aditivo: a.id,
    ordem: a.ordem,
    pagamento: pagamentoId,
    valor: centavosEmReais(p.valorCentavos),
    forma: p.forma,
    origem: p.origem,
    comComprovante: p.comComprovante,
    totalPago: centavosEmReais(total),
    diferenca: centavosEmReais(a.diferencaCentavos),
  });
  if (total >= a.diferencaCentavos) await prisma.aditivoDoContrato.updateMany({ where: { id: aditivoId, pagoEm: null }, data: { pagoEm: p.pagoEm } });
  const aplicacao = await aplicarSePronto(autor, aditivoId);
  return { totalPagoCentavos: total, aplicacao };
}

/**
 * APLICA O ADITIVO NA CONTA, uma vez só: assinado e, se havia diferença a
 * pagar, pago. A conta ganha o plano e os acessos extras novos; se a cota de
 * créditos (ou de vídeo) subiu, a diferença entra agora, no ciclo em curso
 * (crédito dado não se toma de volta quando a cota desce, como no acesso
 * extra). Devolve o que fez, ou null quando ainda falta algo.
 */
export async function aplicarSePronto(autor: Autor, aditivoId: string) {
  const a = await prisma.aditivoDoContrato.findUnique({
    where: { id: aditivoId },
    include: { contrato: { include: { user: { select: { id: true, plan: true, role: true, acessosExtras: true } } } } },
  });
  if (!a || a.status === "cancelado" || a.aplicadoEm || !a.assinadoEm) return null;
  if (a.diferencaCentavos > 0 && !a.pagoEm) return null;
  const trava = await prisma.aditivoDoContrato.updateMany({ where: { id: aditivoId, aplicadoEm: null }, data: { aplicadoEm: new Date(), status: "aplicado" } });
  if (trava.count !== 1) return null;

  const u = a.contrato.user;
  const ant = a.anterior as unknown as { plano: string; acessosExtras: number };
  const { PLANS } = await import("@/lib/stripe");
  const tabela = PLANS as Record<string, { credits?: number; videoCredits?: number }>;
  const { creditosDoCiclo } = await import("@/lib/equipe/regras");
  const cotaAntes = creditosDoCiclo(tabela[ant.plano]?.credits ?? 0, ant.acessosExtras);
  const cotaDepois = creditosDoCiclo(tabela[a.plano]?.credits ?? 0, a.acessosExtras);
  const videoAntes = tabela[ant.plano]?.videoCredits ?? 0;
  const videoDepois = tabela[a.plano]?.videoCredits ?? 0;
  const nota = `Aditivo nº ${a.ordem} ao contrato nº ${String(a.contrato.numero).padStart(4, "0")}: ${nomeDoPlano(ant.plano)} para ${nomeDoPlano(a.plano)}`;
  let creditos = 0;
  let video = 0;
  // Admin é acesso interno: o plano dele não muda (como na ativação).
  if (u.role !== "admin") {
    await prisma.user.update({ where: { id: u.id }, data: { plan: a.plano, acessosExtras: a.acessosExtras } });
    if (cotaDepois > cotaAntes) {
      const { creditar } = await import("@/lib/credits");
      creditos = cotaDepois - cotaAntes;
      await creditar({ userId: u.id, quantidade: creditos, operation: "ajuste_admin", note: nota });
    }
    if (videoDepois > videoAntes) {
      const { creditarVideo } = await import("@/lib/credits/video");
      video = videoDepois - videoAntes;
      await creditarVideo({ userId: u.id, quantidade: video, operation: "plano_video", note: nota });
    }
  }
  await registrar(a.contratoId, autor, "aditivo_aplicado", {
    aditivo: a.id,
    ordem: a.ordem,
    plano: nomeDoPlano(a.plano),
    acessosExtras: a.acessosExtras,
    valorAnual: centavosEmReais(a.valorAnualCentavos),
    creditos,
    video,
    credito: a.diferencaCentavos < 0 ? centavosEmReais(-a.diferencaCentavos) : undefined,
  });
  return { plano: a.plano, acessosExtras: a.acessosExtras, creditos, video };
}

export async function cancelarAditivo(admin: Autor, aditivoId: string, motivo: string) {
  if (motivo.trim().length < 3) throw new RecusaDoContrato("Escreva o motivo do cancelamento do aditivo.");
  const a = await carregar(aditivoId);
  if (a.status === "aplicado") throw new RecusaDoContrato("Aditivo aplicado não se cancela: faça outro aditivo.");
  if (a.status === "cancelado") return { status: "cancelado" };
  if (a.status === "enviado" && a.provedorDocumentoId) {
    const provedor = provedorDeAssinatura();
    await provedor?.cancelar(a.provedorDocumentoId).catch(() => undefined);
  }
  await prisma.aditivoDoContrato.update({ where: { id: a.id }, data: { status: "cancelado", canceladoEm: new Date(), motivoCancelamento: motivo.trim() } });
  await registrar(a.contratoId, admin, "aditivo_cancelado", { aditivo: a.id, ordem: a.ordem, de: a.status, motivo: motivo.trim() });
  return { status: "cancelado" };
}

export async function aprovarDescontoDoAditivo(admin: Autor, aditivoId: string) {
  if (!ehAprovador(admin)) throw new RecusaDoContrato(`Só o dono (${aprovadorDoDesconto()}) aprova desconto acima de ${TETO_SEM_APROVACAO}%.`, 403);
  const a = await carregar(aditivoId);
  if (!esperaAprovacao(a)) throw new RecusaDoContrato("Este aditivo não tem desconto esperando aprovação.");
  await prisma.aditivoDoContrato.update({ where: { id: a.id }, data: { descontoAprovadoPor: typeof admin === "string" ? admin : admin.email, descontoAprovadoEm: new Date() } });
  await registrar(a.contratoId, admin, "desconto_aprovado", {
    onde: `aditivo nº ${a.ordem}`,
    tabela: centavosEmReais(a.precoTabelaCentavos),
    desconto: centavosEmReais(a.descontoCentavos),
    percentual: porcentagem((a.descontoCentavos / a.precoTabelaCentavos) * 100),
    motivo: a.descontoMotivo,
    final: centavosEmReais(a.valorAnualCentavos),
    concedidoPor: a.descontoConcedidoPor,
  });
  return { aprovado: true };
}

/** O webhook do provedor: o documento é de um aditivo? */
export async function aditivoDoDocumento(documentoId: string, externoId: string | null) {
  return prisma.aditivoDoContrato.findFirst({ where: { provedorDocumentoId: documentoId, ...(externoId ? { id: externoId } : {}) }, select: { id: true } });
}
