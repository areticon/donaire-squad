import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/db/prisma";
import { PLANOS_PUBLICOS, type PlanoId } from "@/lib/planos";

/**
 * Em que plano a pessoa está, lido no STRIPE e não em `user.plan`.
 *
 * O porquê está medido, e é o card 399: em 12/09/2026 a conta bruno@areticon.com
 * tinha `plan = "pro"` no banco e uma assinatura ativa de R$ 149 no Stripe, num
 * price da tabela anterior a 02/09. A tela lia o banco, achava a chave "pro" na
 * tabela de hoje e mostrava o rótulo "Essencial, R$ 397" para quem pagava
 * R$ 149. Quando o dado de cobrança mora em dois lugares, quem manda é a
 * assinatura: o banco é cópia, e cópia atrasa.
 *
 * `user.plan` continua existindo e continua governando COTA (créditos, limites),
 * porque é ele que o webhook repõe. O que ele não pode fazer é dizer preço.
 */

export type Assinatura = {
  /** true quando é acesso interno: não tem cobrança e não deve ver oferta. */
  admin: boolean;
  /** A chave do plano no nosso lado, para casar com a tabela pública. */
  planoId: PlanoId | null;
  /** O nome que o cliente vê. Vem da nossa tabela, não do Stripe. */
  nome: string | null;
  /** Em centavos, exatamente o que o Stripe cobra desta pessoa. */
  valorEmCentavos: number | null;
  intervalo: "month" | "year" | null;
  /** ISO. Quando cai a próxima cobrança, ou quando o acesso termina se já cancelou. */
  proximaCobranca: string | null;
  status: string | null;
  /** Já pediu cancelamento e está rodando até o fim do período pago. */
  cancelaNoFim: boolean;
  /** Últimos quatro dígitos do cartão, quando houver. */
  cartaoFinal: string | null;
  /**
   * O preço que esta pessoa paga não bate com o preço de lista do plano dela.
   * É o caso do fundador e de quem entrou numa tabela antiga.
   */
  precoTravado: boolean;
  subscriptionId: string | null;
};

const VAZIA: Assinatura = {
  admin: false,
  planoId: null,
  nome: null,
  valorEmCentavos: null,
  intervalo: null,
  proximaCobranca: null,
  status: null,
  cancelaNoFim: false,
  cartaoFinal: null,
  precoTravado: false,
  subscriptionId: null,
};

/** De um price id do ambiente de volta para a chave do plano. */
function planoDoPrice(priceId: string | undefined): PlanoId | null {
  if (!priceId) return null;
  const mapa: Array<[string | undefined, PlanoId]> = [
    [process.env.STRIPE_PRO_PRICE_ID, "pro"],
    [process.env.STRIPE_PRO_ANNUAL_PRICE_ID, "pro"],
    [process.env.STRIPE_BUSINESS_PRICE_ID, "business"],
    [process.env.STRIPE_BUSINESS_ANNUAL_PRICE_ID, "business"],
    [process.env.STRIPE_STUDIO_PRICE_ID, "studio"],
    [process.env.STRIPE_STUDIO_ANNUAL_PRICE_ID, "studio"],
    // Assinaturas anteriores a 18/08 ficaram no price do Starter, que foi
    // removido do produto mas continua cobrando de quem já assinava.
    [process.env.STRIPE_STARTER_PRICE_ID, "pro"],
  ];
  for (const [env, plano] of mapa) if (env && env === priceId) return plano;
  return null;
}

export async function assinaturaDoUsuario(userId: string): Promise<Assinatura> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, role: true, stripeCustomerId: true },
  });
  if (!user) return VAZIA;

  // Acesso interno não tem cobrança, e a tela precisa saber disso ANTES de
  // perguntar ao Stripe: quem não paga não deve ver oferta nem preço.
  if (user.role === "admin") return { ...VAZIA, admin: true };

  if (!user.stripeCustomerId) return VAZIA;

  try {
    const assinaturas = await getStripe().subscriptions.list({
      customer: user.stripeCustomerId,
      status: "all",
      limit: 10,
      expand: ["data.default_payment_method"],
    });

    // A que vale é a viva. `trialing` conta: quem está no teste de 7 dias JÁ
    // tem plano, e mostrar "nenhum plano" para essa pessoa é o mesmo defeito
    // ao contrário.
    const viva = assinaturas.data.find((a) =>
      ["active", "trialing", "past_due"].includes(a.status)
    );
    if (!viva) return VAZIA;

    const item = viva.items.data[0];
    const priceId = item?.price?.id;
    const planoId = planoDoPrice(priceId);
    const publico = planoId ? PLANOS_PUBLICOS.find((p) => p.id === planoId) : undefined;

    // ARMADILHA MEDIDA EM 12/09: `current_period_end` vem VAZIO na raiz da
    // assinatura nas versões novas da API; o campo mora no ITEM. Ler a raiz
    // devolve undefined, e `new Date(undefined * 1000)` vira "Invalid Date" na
    // tela, que é pior que não mostrar data nenhuma.
    const fimDoPeriodo =
      (item as unknown as { current_period_end?: number })?.current_period_end ??
      (viva as unknown as { current_period_end?: number })?.current_period_end ??
      null;

    const valor = item?.price?.unit_amount ?? null;
    const intervalo = (item?.price?.recurring?.interval ?? null) as "month" | "year" | null;

    // O preço de lista de hoje, no mesmo ciclo, para comparar.
    const listaEmCentavos = publico
      ? (intervalo === "year" ? publico.anual : publico.mensal) * 100
      : null;

    const pm = viva.default_payment_method as unknown as
      | { card?: { last4?: string } }
      | string
      | null;
    const cartaoFinal = typeof pm === "object" && pm?.card?.last4 ? pm.card.last4 : null;

    return {
      admin: false,
      planoId,
      nome: publico?.nome ?? null,
      valorEmCentavos: valor,
      intervalo,
      proximaCobranca: fimDoPeriodo ? new Date(fimDoPeriodo * 1000).toISOString() : null,
      status: viva.status,
      cancelaNoFim: Boolean(viva.cancel_at_period_end),
      cartaoFinal,
      precoTravado: Boolean(valor && listaEmCentavos && valor !== listaEmCentavos),
      subscriptionId: viva.id,
    };
  } catch (err) {
    // Stripe fora do ar não pode derrubar a tela de configurações inteira: o
    // resto dela (nome, e-mail, projetos) não depende de cobrança.
    console.error("[stripe/assinatura]", err);
    return VAZIA;
  }
}
