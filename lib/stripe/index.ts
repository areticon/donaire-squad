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

// Calibração Opção B (2026-08-16), revisada em 18/08/2026.
// Créditos por operação em CREDIT_COSTS abaixo (3x o custo variável real).
//
// O plano Starter de R$49 foi removido em 18/08/2026. Motivos: entregava uma
// rede só, contradizendo a promessa de campanha completa nas 3 redes que a
// landing vende; rendia R$35 de margem contra R$98 do Pro, com o mesmo custo
// de suporte (86 clientes Starter para o mesmo resultado de 31 Pro); e atraía
// fora do ICP, que decide por resultado e não por R$100 de diferença.
// No lugar entrou o período de teste do Pro: para esse público a barreira é
// desconfiança de que a IA escreve como ele, e isso se resolve mostrando.
export const TRIAL_DAYS = 7;

export const PLANS = {
  pro: {
    name: "Pro",
    description: "A campanha completa nas 3 redes, toda semana",
    price: 14900,
    priceId: process.env.STRIPE_PRO_PRICE_ID,
    // Anual: 10 mensalidades cobradas de uma vez, ou seja dois meses de
    // desconto. Existe por causa do CAC, não do desconto: o anual sobe o
    // CAC máximo viável de R$ 298 para R$ 710 e põe a margem no caixa antes
    // de a fatura do anúncio fechar. Ver a nota do CAC no Notion.
    //
    // O plano no banco continua "pro": quem sabe se o cliente é anual é o
    // Stripe, e o cron /api/cron/annual-credits pergunta lá para repor os
    // créditos mensais, porque o webhook de renovação só dispara 1x por ano
    // em assinatura anual.
    annualPrice: 149000,
    annualPriceId: process.env.STRIPE_PRO_ANNUAL_PRICE_ID,
    credits: 1800,
    extraCreditPrice: 0.12,
    features: [
      `${TRIAL_DAYS} dias grátis para testar`,
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
    annualPrice: 249000,
    annualPriceId: process.env.STRIPE_BUSINESS_ANNUAL_PRICE_ID,
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
    annualPrice: 449000,
    annualPriceId: process.env.STRIPE_STUDIO_ANNUAL_PRICE_ID,
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
  // Vídeo gerado por IA (Veo) saiu em 18/08/2026. Motivo: o custo não era
  // determinístico. A cascata de fallback tentava veo-3.0-fast a US$ 0,10 por
  // segundo e caía para veo-3.0 standard a US$ 0,40, o que levava um vídeo de
  // 8 segundos de R$ 4,85 para R$ 18,05 contra R$ 10,00 de receita, 80% de
  // prejuízo, sem nada registrado que denunciasse. Vídeo passa a vir da
  // gravação do próprio cliente, cortada e legendada, cobrada por
  // 2 créditos por minuto de vídeo mais 4 créditos por clipe entregue.
} as const;

export async function createCheckoutSession(
  userId: string,
  email: string,
  priceId: string,
  returnUrl: string
): Promise<string> {
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    // Só cartão, e é decisão, não esquecimento.
    //
    // Duas razões. A técnica: boleto não está ativado na conta, e o Stripe
    // recusa a sessão inteira quando se pede um meio de pagamento não ativado,
    // então a linha antiga quebrava todo checkout. A de produto: o teste de 7
    // dias exige cartão justamente para filtrar quem não pretende pagar, e
    // boleto é pagamento avulso que não deixa meio de cobrança guardado para a
    // renovação, o que anula o filtro.
    //
    // Pix vale revisitar: custa 1,19% contra 4,69% do cartão com o Billing, o
    // que dá R$ 4,56 por cliente por mês no Pro. Depende do Pix automático
    // funcionar para assinatura recorrente.
    payment_method_types: ["card"],
    currency: "brl",
    // Sem isto o campo de cupom nem aparece no checkout, e a landing promete
    // 50% off com o código 50LANCAMENTO. Promessa sem campo é bug.
    allow_promotion_codes: true,
    customer_email: email,
    metadata: { userId },
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${returnUrl}?success=true&session_id={CHECKOUT_SESSION_ID}`,
    // Cancelou o checkout, volta para a escolha de plano, não para o destino
    // de sucesso: sem plano o dashboard redirecionaria de novo e a pessoa
    // ficaria num pingue-pongue.
    cancel_url: `${returnUrl.replace(/\/dashboard$/, "")}/planos?canceled=true`,
    subscription_data: {
      metadata: { userId },
      // O cartão é exigido no checkout mesmo durante o teste. Isso reduz abuso
      // e melhora a conversão: quem cadastra cartão já decidiu experimentar
      // para valer, não para passear.
      trial_period_days: TRIAL_DAYS,
    },
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
