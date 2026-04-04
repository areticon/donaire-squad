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
  free: {
    name: "Free",
    description: "Para experimentar",
    price: 0,
    features: [
      "1 projeto",
      "2 agentes de IA",
      "5 posts por mês",
      "LinkedIn e X",
    ],
    limits: { projects: 1, agents: 2, postsPerMonth: 5 },
  },
  starter: {
    name: "Starter",
    description: "Para profissionais e pequenas empresas",
    price: 9700,
    priceId: process.env.STRIPE_STARTER_PRICE_ID,
    features: [
      "3 projetos",
      "8 agentes de IA",
      "30 posts por mês",
      "LinkedIn, X e Instagram",
      "Agendamento automático",
      "Memória persistente",
    ],
    limits: { projects: 3, agents: 8, postsPerMonth: 30 },
  },
  pro: {
    name: "Pro",
    description: "Para agências e equipes",
    price: 29700,
    priceId: process.env.STRIPE_PRO_PRICE_ID,
    features: [
      "Projetos ilimitados",
      "Agentes ilimitados",
      "Posts ilimitados",
      "Todas as redes sociais",
      "Visualização em tempo real",
      "API access",
      "Suporte prioritário",
    ],
    limits: { projects: -1, agents: -1, postsPerMonth: -1 },
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
    payment_method_types: ["card"],
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
