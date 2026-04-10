import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      typescript: true,
    });
  }
  return _stripe;
}

// Keep named export for backwards compatibility
export const stripe = {
  get webhooks() { return getStripe().webhooks; },
  get billingPortal() { return getStripe().billingPortal; },
  get checkout() { return getStripe().checkout; },
  get subscriptions() { return getStripe().subscriptions; },
  get customers() { return getStripe().customers; },
  get prices() { return getStripe().prices; },
};

export const PLANS = {
  starter: {
    name: "Starter",
    description: "Para profissionais que postam 1-2x por semana",
    price: 4900,
    priceId: process.env.STRIPE_STARTER_PRICE_ID,
    credits: 500,
    features: [
      "500 créditos/mês",
      "LinkedIn (texto, imagem, carrossel)",
      "X — somente texto",
      "6 agentes de IA",
      "Agendamento automático",
    ],
    limits: { projects: 2, postsPerMonth: 30, credits: 500 },
  },
  pro: {
    name: "Pro",
    description: "Para profissionais que postam diariamente",
    price: 9900,
    priceId: process.env.STRIPE_PRO_PRICE_ID,
    credits: 1100,
    extraCreditPrice: 0.12,
    features: [
      "1.100 créditos/mês",
      "LinkedIn (texto, imagem, carrossel, vídeo)",
      "X — somente texto",
      "Todos os agentes de IA",
      "Créditos extras por R$0,12",
      "Dashboard de métricas",
    ],
    limits: { projects: 5, postsPerMonth: -1, credits: 1100 },
  },
  business: {
    name: "Business",
    description: "Para equipes e alto volume de conteúdo",
    price: 19900,
    priceId: process.env.STRIPE_BUSINESS_PRICE_ID,
    credits: 2500,
    extraCreditPrice: 0.10,
    features: [
      "2.500 créditos/mês",
      "LinkedIn (texto, imagem, carrossel, vídeo)",
      "X — somente texto",
      "Todos os agentes de IA",
      "Múltiplos projetos",
      "Créditos extras por R$0,10",
      "Suporte prioritário",
    ],
    limits: { projects: 15, postsPerMonth: -1, credits: 2500 },
  },
  agency: {
    name: "Agency",
    description: "Para agências e gestores de múltiplas marcas",
    price: 39900,
    priceId: process.env.STRIPE_AGENCY_PRICE_ID,
    credits: 5500,
    extraCreditPrice: 0.08,
    features: [
      "5.500 créditos/mês",
      "LinkedIn (texto, imagem, carrossel, vídeo)",
      "X — somente texto",
      "Todos os agentes de IA",
      "Projetos ilimitados",
      "Créditos extras por R$0,08",
      "Onboarding dedicado",
      "Suporte prioritário",
    ],
    limits: { projects: -1, postsPerMonth: -1, credits: 5500 },
  },
};

export async function createCheckoutSession(
  userId: string,
  email: string,
  priceId: string,
  returnUrl: string
): Promise<string> {
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card", "boleto"],
    currency: "brl",
    customer_email: email,
    metadata: { userId },
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${returnUrl}?success=true&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${returnUrl}?canceled=true`,
    subscription_data: { metadata: { userId } },
  });
  return session.url!;
}

export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string
): Promise<string> {
  const session = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return session.url;
}
