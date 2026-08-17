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

// Calibração Opção B (2026-08-16): ver MODELO_DE_NEGOCIO_v2.md.
// Créditos por operação em CREDIT_COSTS abaixo (3x o custo variável real).
export const PLANS = {
  starter: {
    name: "Starter",
    description: "Para construir presença no LinkedIn",
    price: 4900,
    priceId: process.env.STRIPE_STARTER_PRICE_ID,
    credits: 400,
    features: [
      "400 créditos/mês",
      "LinkedIn completo (texto, imagem, carrossel)",
      "Cerca de 5 posts de texto por semana",
      "Todos os agentes de IA",
      "Aprovação antes de publicar",
    ],
    limits: { projects: 1, postsPerMonth: 30, credits: 400 },
  },
  pro: {
    name: "Pro",
    description: "A campanha completa nas 3 redes, toda semana",
    price: 14900,
    priceId: process.env.STRIPE_PRO_PRICE_ID,
    credits: 1800,
    extraCreditPrice: 0.12,
    features: [
      "1.800 créditos/mês",
      "Campanha semanal completa: LinkedIn, X e Instagram",
      "Imagens e carrosséis com IA",
      "Comentário de fontes automático",
      "Todos os agentes de IA",
      "Créditos extras por R$0,12",
      "Dashboard de métricas",
    ],
    limits: { projects: 3, postsPerMonth: -1, credits: 1800 },
  },
  business: {
    name: "Business",
    description: "Três redes com vídeo e fôlego para crescer",
    price: 24900,
    priceId: process.env.STRIPE_BUSINESS_PRICE_ID,
    credits: 3500,
    extraCreditPrice: 0.10,
    features: [
      "3.500 créditos/mês",
      "Tudo do Pro + vídeo com IA",
      "Múltiplos projetos simultâneos",
      "Créditos extras por R$0,10",
      "Suporte prioritário",
    ],
    limits: { projects: 10, postsPerMonth: -1, credits: 3500 },
  },
  studio: {
    name: "Studio",
    description: "Para quem gerencia várias marcas ou alto volume",
    price: 44900,
    priceId: process.env.STRIPE_STUDIO_PRICE_ID,
    credits: 7000,
    extraCreditPrice: 0.08,
    features: [
      "7.000 créditos/mês",
      "Tudo do Business",
      "Projetos ilimitados",
      "Créditos extras por R$0,08",
      "Onboarding dedicado",
      "Suporte prioritário",
    ],
    limits: { projects: -1, postsPerMonth: -1, credits: 7000 },
  },
};

// Créditos cobrados por operação (1 crédito = R$ 0,10).
// Calibrados a ~3x o custo variável medido; ver MODELO_DE_NEGOCIO_v2.md seção 4.
export const CREDIT_COSTS = {
  post_text: 15, // post de texto em qualquer rede
  x_sources_comment: 20, // comentário com fontes no X (link custa $0,20 na API do X)
  post_image: 25, // post com 1 imagem gerada
  carousel_3: 40, // carrossel de 3 slides
  video_8s: 100, // vídeo Veo 8s sem narração
  video_8s_narrated: 150, // vídeo Veo 8s com narração PT-BR
} as const;

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
