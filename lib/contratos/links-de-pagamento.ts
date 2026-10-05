import { createHmac, timingSafeEqual } from "node:crypto";
import { entradaPorFora, formasDoContrato } from "@/lib/contratos/condicao";

/**
 * OS LINKS DE PAGAMENTO DO CONTRATO, QUE NÃO VENCEM (05/10/2026).
 *
 * Na condição em duas partes (entrada mais restante), o sistema gera os links
 * do Stripe que fazem sentido: o da ENTRADA, só quando a entrada é no cartão
 * pelo Stripe (Pix, boleto e transferência são por fora, com o comprovante
 * registrado no gestor), e o do RESTANTE, sempre (assinatura mensal, cartão
 * parcelado pelo emissor ou cartão à vista, conforme a forma escolhida).
 *
 * Como a sessão de checkout do Stripe vence em 24 horas e o contrato precisa
 * SAIR com o link pronto (no texto, na tela do admin, no e-mail e na página do
 * cliente), o link é nosso: /api/contratos/pagar/<contrato>/<parte>?t=<assinatura>,
 * e cada clique abre uma sessão nova do Stripe. O `t` é um HMAC do contrato e
 * da parte: quem não recebeu o link não adivinha o de outro contrato.
 *
 * O cliente prospect ainda não tem senha (só ganha na ativação), por isso o
 * link é público e a rota mora em /api (fora do portão de login).
 *
 * Só servidor.
 */

export const PARTES_DO_PAGAMENTO = ["entrada", "restante"] as const;
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

/** O link do restante (assinatura, parcelado pelo emissor ou à vista, conforme a forma). */
export function linkDoRestante(contratoId: string, base = baseDoApp()): string {
  return linkDoPagamento(contratoId, "restante", base);
}

/** O link da entrada: só existe quando a entrada é no cartão pelo Stripe. */
export function linkDaEntrada(c: { id: string; formaDaEntrada?: string | null }, base = baseDoApp()): string | null {
  return entradaPorFora(formasDoContrato(c).formaDaEntrada) ? null : linkDoPagamento(c.id, "entrada", base);
}

/** OS LINKS QUE FAZEM SENTIDO para um contrato parcelado (o da entrada pode não existir). */
export function linksDoContrato(c: { id: string; formaDaEntrada?: string | null; formaDoRestante?: string | null }, base = baseDoApp()): { entrada: string | null; restante: string } {
  return { entrada: linkDaEntrada(c, base), restante: linkDoRestante(c.id, base) };
}

/**
 * O LINK DE AGENDAR O ONBOARDING (05/10/2026): /onboarding/agendar/<contrato>.<assinatura>.
 *
 * Vai no e-mail de boas-vindas do contrato ativado e não vence: o cliente pode
 * abrir dias depois, e a mesma página mostra a reunião já marcada (remarcar e
 * cancelar). A assinatura é um HMAC do contrato com rótulo próprio: o token de
 * pagamento não abre a agenda, e o da agenda não paga nada. Público (fora do
 * portão de login), porque o cliente pode ainda não ter escolhido a senha.
 */
export function assinaturaDoOnboarding(contratoId: string): string {
  return createHmac("sha256", segredo()).update(`contrato-onboarding:${contratoId}`).digest("hex").slice(0, 32);
}

export function tokenDoOnboarding(contratoId: string): string {
  return `${contratoId}.${assinaturaDoOnboarding(contratoId)}`;
}

/** O id do contrato de um token válido, ou null. */
export function contratoDoTokenDeOnboarding(token: string | null | undefined): string | null {
  if (!token) return null;
  const [id, sig, ...resto] = token.split(".");
  if (resto.length || !id || !sig || sig.length !== 32 || !/^[a-z0-9]{10,40}$/i.test(id)) return null;
  const certo = Buffer.from(assinaturaDoOnboarding(id));
  const veio = Buffer.from(sig);
  return certo.length === veio.length && timingSafeEqual(certo, veio) ? id : null;
}

export function linkDoOnboarding(contratoId: string, base = baseDoApp()): string {
  return `${base}/onboarding/agendar/${tokenDoOnboarding(contratoId)}`;
}

/** A chave Pix da Demandou para a entrada, quando configurada (CONTRATOS_CHAVE_PIX). */
export function chavePix(): string | null {
  return process.env.CONTRATOS_CHAVE_PIX?.trim() || null;
}

/**
 * O PARCELAMENTO PELO EMISSOR está liberado na conta Stripe? A API não expõe
 * isso em leitura (nem em accounts.retrieve nem em paymentMethodConfigurations),
 * e só o Dashboard liga: Configurações > Pagamentos > Formas de pagamento >
 * Cartões > Parcelamento. Ligado lá, o dono define CONTRATOS_PARCELAMENTO_EMISSOR=1
 * e a opção aparece no formulário; sem isso, o formulário mostra "indisponível
 * na conta" e o servidor recusa a forma.
 */
export function parcelamentoDoEmissorDisponivel(): boolean {
  const v = process.env.CONTRATOS_PARCELAMENTO_EMISSOR?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "sim";
}
