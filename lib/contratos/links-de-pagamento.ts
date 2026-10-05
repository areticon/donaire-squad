import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * O LINK DO CARTÃO DAS PARCELAS, QUE NÃO VENCE (05/10/2026).
 *
 * Na condição "1ª parcela no Pix, demais no cartão de crédito recorrente", o
 * Pix da entrada é feito POR FORA (o vendedor manda a chave, o cliente paga e
 * o comprovante é registrado no gestor, o caminho que já existia). O sistema
 * gera só o link do cartão. Como a sessão de checkout do Stripe vence em 24
 * horas e o contrato precisa SAIR com o link pronto (no texto, na tela do
 * admin, no e-mail e na página do cliente), o link é nosso:
 * /api/contratos/pagar/<contrato>/parcelas?t=<assinatura>, e cada clique abre
 * uma sessão nova do Stripe. O `t` é um HMAC do contrato e da parte: quem não
 * recebeu o link não adivinha o de outro contrato.
 *
 * O cliente prospect ainda não tem senha (só ganha na ativação), por isso o
 * link é público e a rota mora em /api (fora do portão de login).
 *
 * Só servidor.
 */

export const PARTES_DO_PAGAMENTO = ["parcelas"] as const;
export type ParteDoPagamento = (typeof PARTES_DO_PAGAMENTO)[number];

export function ehParteDoPagamento(v: unknown): v is ParteDoPagamento {
  return typeof v === "string" && (PARTES_DO_PAGAMENTO as readonly string[]).includes(v);
}

function segredo(): string {
  const s = process.env.CONTRATOS_LINK_SECRET || process.env.BETTER_AUTH_SECRET;
  if (!s) throw new Error("Sem CONTRATOS_LINK_SECRET nem BETTER_AUTH_SECRET para assinar os links de pagamento.");
  return s;
}

export function assinaturaDoLink(contratoId: string, parte: ParteDoPagamento): string {
  return createHmac("sha256", segredo()).update(`contrato-pagar:${contratoId}:${parte}`).digest("hex").slice(0, 32);
}

export function linkValido(contratoId: string, parte: ParteDoPagamento, t: string | null | undefined): boolean {
  if (!t || t.length !== 32) return false;
  const certo = Buffer.from(assinaturaDoLink(contratoId, parte));
  const veio = Buffer.from(t);
  return certo.length === veio.length && timingSafeEqual(certo, veio);
}

export function baseDoApp(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://demandou.com").replace(/\/$/, "");
}

export function linkDoPagamento(contratoId: string, parte: ParteDoPagamento, base = baseDoApp()): string {
  return `${base}/api/contratos/pagar/${contratoId}/${parte}?t=${assinaturaDoLink(contratoId, parte)}`;
}

/** O link do cartão das parcelas de um contrato parcelado. */
export function linkDoCartao(contratoId: string, base = baseDoApp()): string {
  return linkDoPagamento(contratoId, "parcelas", base);
}

/** A chave Pix da Demandou para a 1ª parcela, quando configurada (CONTRATOS_CHAVE_PIX). */
export function chavePix(): string | null {
  return process.env.CONTRATOS_CHAVE_PIX?.trim() || null;
}
