import type Stripe from "stripe";
import { prisma } from "@/lib/db/prisma";
import { creditar, type BancoDoSaldo } from "@/lib/credits";
import { equipeDe } from "@/lib/equipe/conta";
import { situacaoDoContrato } from "@/lib/contratos/situacao";
import { decidirElegibilidade, pacoteDeCredito, type Elegibilidade, type PacoteDeCredito } from "@/lib/credits/pacotes-de-credito";

/**
 * O LADO DO SERVIDOR DOS PACOTES DE CRÉDITO (06/10/2026): quem pode comprar,
 * qual price do Stripe cobra cada pacote, o checkout e o crédito depois do
 * pagamento. A tabela e a regra pura moram em lib/credits/pacotes-de-credito.ts.
 */

export const OPERACAO_DA_COMPRA = "compra_creditos";
export const TIPO_DO_CHECKOUT = "pacote_de_creditos";

/** Junta os dados da conta e decide. Lê o banco e, para quem tem cliente no Stripe, a assinatura. */
export async function elegibilidadeDoPacote(userId: string): Promise<Elegibilidade> {
  const equipe = await equipeDe(userId);
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, plan: true, trialEndsAt: true, stripeCustomerId: true },
  });
  if (!u) return decidirElegibilidade({ membroDe: null, admin: false, plano: null, statusDaAssinatura: null, emTeste: false, contratoPago: false });

  const base = {
    membroDe: equipe?.dono ?? null,
    admin: u.role === "admin",
    plano: u.plan,
    emTeste: Boolean(u.trialEndsAt && u.trialEndsAt > new Date()),
  };
  // Sem pergunta ao Stripe quando a resposta já é não (membro, admin, sem plano).
  if (base.membroDe || base.admin || !u.plan || u.plan === "free") {
    return decidirElegibilidade({ ...base, statusDaAssinatura: null, contratoPago: false });
  }

  let statusDaAssinatura: string | null = null;
  if (u.stripeCustomerId) {
    const { getStripe } = await import("@/lib/stripe");
    const lista = await getStripe().subscriptions.list({ customer: u.stripeCustomerId, status: "all", limit: 20 });
    // A assinatura das parcelas de contrato não é plano (05/10): fica de fora.
    const planos = lista.data.filter((s) => s.metadata?.tipo !== "contrato_parcelas");
    const viva =
      planos.find((s) => s.status === "active") ??
      planos.find((s) => ["trialing", "past_due", "unpaid", "incomplete"].includes(s.status)) ??
      null;
    statusDaAssinatura = viva?.status ?? null;
  }

  let contratoPago = false;
  if (!statusDaAssinatura) {
    const contratos = await prisma.contrato.findMany({
      where: { userId, pagoEm: { not: null } },
      select: { status: true, pagoEm: true, inicioVigencia: true, fimVigencia: true },
    });
    contratoPago = contratos.some((c) => {
      const s = situacaoDoContrato(c);
      return s === "vigente" || s === "a_vencer" || s === "assinado";
    });
  }
  return decidirElegibilidade({ ...base, statusDaAssinatura, contratoPago });
}

/**
 * O price do Stripe deste pacote: a variável de ambiente, se houver, senão a
 * `lookupKey`. Confere que o valor do price é o da tabela: price que cobra um
 * valor e tela que promete outro é a confusão que não pode chegar ao cliente.
 */
export async function priceDoPacote(p: PacoteDeCredito): Promise<string> {
  const { getStripe } = await import("@/lib/stripe");
  const stripe = getStripe();
  const doAmbiente = process.env[p.variavel]?.trim();
  const price = doAmbiente
    ? await stripe.prices.retrieve(doAmbiente)
    : (await stripe.prices.list({ lookup_keys: [p.lookupKey], active: true, limit: 1 })).data[0];
  if (!price) throw new PacoteSemPreco(`Price do pacote ${p.id} não existe no Stripe (lookup_key ${p.lookupKey}). Rode scripts/stripe/criar-pacotes-de-credito.mts.`);
  if (price.unit_amount !== p.reais * 100 || price.currency !== "brl" || price.recurring) {
    throw new PacoteSemPreco(`Price ${price.id} do pacote ${p.id} não bate com a tabela (esperado R$ ${p.reais} avulso).`);
  }
  return price.id;
}

/** Erro interno de configuração: o cliente vê um código, o detalhe fica no log. */
export class PacoteSemPreco extends Error {}

export async function abrirCheckoutDoPacote(args: { userId: string; email: string | null; pacote: PacoteDeCredito; base: string }): Promise<string> {
  const { userId, email, pacote, base } = args;
  const priceId = await priceDoPacote(pacote);
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { stripeCustomerId: true, email: true } });
  const { getStripe } = await import("@/lib/stripe");
  const descricao = `Demandou: pacote de ${pacote.creditos.toLocaleString("pt-BR")} créditos (R$ ${pacote.reais})`;
  // O webhook lê estes campos para saber quanto creditar e em quem. O valor
  // pago NÃO é a fonte da verdade do crédito: o que vale é o que a tela
  // prometeu na hora da compra.
  const metadata = { userId, tipo: TIPO_DO_CHECKOUT, pacoteId: pacote.id, creditos: String(pacote.creditos) };
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    // O cliente do Stripe da assinatura: a cobrança cai na mesma ficha, e a
    // receita real do painel (lib/admin/receita-real.ts) reconhece a conta.
    ...(u?.stripeCustomerId ? { customer: u.stripeCustomerId } : { customer_email: email ?? u?.email ?? undefined }),
    line_items: [{ price: priceId, quantity: 1 }],
    metadata,
    payment_intent_data: {
      description: descricao,
      metadata,
      // O recibo do Stripe por e-mail, que é o comprovante da compra avulsa.
      ...(email ?? u?.email ? { receipt_email: (email ?? u?.email) as string } : {}),
    },
    custom_text: { submit: { message: `${pacote.creditos.toLocaleString("pt-BR")} créditos entram no saldo assim que o pagamento for aprovado. Pagamento único, sem renovação.` } },
    success_url: `${base}/settings?creditos=ok`,
    cancel_url: `${base}/settings?creditos=cancelado`,
  });
  if (!session.url) throw new Error("O Stripe não devolveu a URL do checkout.");
  return session.url;
}

/**
 * CREDITA O PACOTE PAGO, do webhook. Idempotente pela sessão: o Stripe reenvia
 * evento, e `creditar({ unico })` com o id da sessão no `refId` credita uma vez
 * só, mesmo com duas entregas ao mesmo tempo.
 */
export async function creditarPacoteDaSessao(
  session: Pick<Stripe.Checkout.Session, "id" | "metadata" | "payment_status" | "amount_total">,
  db: BancoDoSaldo = prisma
): Promise<{ creditado: boolean; motivo: string }> {
  if (session.metadata?.tipo !== TIPO_DO_CHECKOUT) return { creditado: false, motivo: "não é pacote" };
  if (session.payment_status !== "paid") return { creditado: false, motivo: "pagamento ainda não aprovado" };
  const userId = session.metadata?.userId;
  const creditos = Number(session.metadata?.creditos ?? 0);
  if (!userId || !Number.isInteger(creditos) || creditos <= 0 || creditos > 100_000) {
    console.error("[pacote de créditos] sessão sem dados válidos", session.id, session.metadata);
    return { creditado: false, motivo: "metadados inválidos" };
  }
  const pacote = pacoteDeCredito(String(session.metadata?.pacoteId ?? ""));
  const pago = ((session.amount_total ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const r = await creditar(
    {
      userId,
      quantidade: creditos,
      operation: OPERACAO_DA_COMPRA,
      refId: session.id,
      note: `Pacote ${pacote ? `de R$ ${pacote.reais}` : String(session.metadata?.pacoteId ?? "")}: ${creditos.toLocaleString("pt-BR")} créditos, pagos ${pago} no Stripe`,
      unico: true,
    },
    db
  );
  return { creditado: !r.duplicado, motivo: r.duplicado ? "já creditado" : "creditado" };
}
