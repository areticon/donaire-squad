import Stripe from "stripe";
import { TRIAL_DAYS, planoPublico, type PlanoId } from "@/lib/planos";

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
export { TRIAL_DAYS } from "@/lib/planos";

// Tabela de 02/09/2026: Essencial R$ 397, Autoridade R$ 697, Estúdio R$ 1.997.
//
// Em 25/08 o Pro ficou em R$ 149 contra uma recomendação de R$ 397, e naquele
// dia o produto entregava posts. De lá para cá entrou a esteira de vídeo
// inteira: transcrição, limpeza de fala, cortes 9:16 com legenda e capa, vídeo
// completo com camada de design, capa com o rosto do cliente, pesquisa antes
// dos redatores. Medido no código, um cliente que grava uma vez por semana
// recebe cerca de 44 peças por mês e economiza de 26 a 36 horas; comprar isso
// de gente custa de R$ 3.050 a R$ 6.070 por mês. O preço não acompanhava o
// produto, e o preço baixo ainda vendia o produto errado para o comprador que
// compara com um social media, não com um SaaS.
//
// O que mudou junto com o preço (conversa "Demandou estratégia", 02/09):
// - O cliente compra "gravações por mês", não créditos. Crédito é métrica de
//   custo nossa e cria ansiedade de gastar, que faz usar menos, que é a causa
//   número um de churn. Os créditos continuam existindo por baixo (limits e
//   CREDIT_COSTS mandam no consumo) e saem da cara do cliente.
// - Garantia de 30 dias: se não publicar nada que aprovou, devolvemos tudo.
//   É o que sustenta preço alto sem caso na mão.
// - Oferta de fundador de verdade: os 10 primeiros no Autoridade travam
//   R$ 397 para sempre (cupom FUNDADOR, R$ 300 vitalício, aplicado sozinho
//   no checkout enquanto houver vaga; ver createCheckoutSession).
//
// As chaves "pro", "business" e "studio" ficam: são o valor gravado em
// User.plan, e renomear chave é migração para mudar um rótulo. O nome que o
// cliente vê é "name".
/** O que a tela mostra vem de lib/planos; aqui só o que o Stripe precisa. */
function daTabela(id: PlanoId) {
  const p = planoPublico(id);
  return {
    name: p.nome,
    description: p.descricao,
    price: p.mensal * 100,
    annualPrice: p.anual * 100,
    gravacoesPorMes: p.gravacoesPorMes,
    marcas: p.marcas,
    features: p.features,
  };
}

export const PLANS = {
  pro: {
    ...daTabela("pro"),
    priceId: process.env.STRIPE_PRO_PRICE_ID,
    // Anual: 10 mensalidades cobradas de uma vez, ou seja dois meses de
    // desconto. Existe por causa do CAC, não do desconto: o anual põe a
    // margem no caixa antes de a fatura do anúncio fechar. Ver a nota do CAC
    // no Notion.
    //
    // O plano no banco continua "pro": quem sabe se o cliente é anual é o
    // Stripe, e o cron /api/cron/annual-credits pergunta lá para repor os
    // créditos mensais, porque o webhook de renovação só dispara 1x por ano
    // em assinatura anual.
    annualPriceId: process.env.STRIPE_PRO_ANNUAL_PRICE_ID,
    credits: 1800,
    extraCreditPrice: 0.12,
    // "Gravações por mês" é a unidade que o cliente compra, não um limite
    // aplicado por código: o teto real continua sendo limits.credits, que
    // cabe com folga nessa conta (uma gravação de 30 min com sua semana de
    // peças consome na casa de 250 créditos). "projects" tampouco é aplicado
    // hoje; está aqui para bater com "marcas" quando for.
    limits: { projects: 1, postsPerMonth: -1, credits: 1800 },
  },
  business: {
    ...daTabela("business"),
    priceId: process.env.STRIPE_BUSINESS_PRICE_ID,
    annualPriceId: process.env.STRIPE_BUSINESS_ANNUAL_PRICE_ID,
    credits: 3500,
    extraCreditPrice: 0.10,
    limits: { projects: 1, postsPerMonth: -1, credits: 3500 },
  },
  studio: {
    ...daTabela("studio"),
    priceId: process.env.STRIPE_STUDIO_PRICE_ID,
    annualPriceId: process.env.STRIPE_STUDIO_ANNUAL_PRICE_ID,
    credits: 7000,
    extraCreditPrice: 0.08,
    limits: { projects: 5, postsPerMonth: -1, credits: 7000 },
  },
};

/**
 * O cupom de fundador ainda tem vaga? Os 10 primeiros no Autoridade pagam
 * R$ 397 para sempre. O Stripe é quem conta as vagas (times_redeemed contra
 * max_redemptions), então a landing e o checkout perguntam a ele e nunca a
 * um número copiado em código, que envelheceria na primeira venda.
 *
 * Sem o cupom configurado, ou com o Stripe fora, a resposta é "não": a tela
 * some com a oferta e o checkout segue no preço de lista, que é o caminho
 * seguro. Prometer desconto que o Stripe não aplica seria pior que não
 * prometer.
 */
export async function vagasDeFundador(): Promise<number> {
  const id = process.env.STRIPE_FUNDADOR_COUPON_ID;
  if (!id) return 0;
  try {
    const cupom = await getStripe().coupons.retrieve(id);
    if (!cupom.valid) return 0;
    return Math.max(0, (cupom.max_redemptions ?? 0) - cupom.times_redeemed);
  } catch (err) {
    console.error("[stripe] cupom de fundador", err);
    return 0;
  }
}

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
  returnUrl: string,
  opcoes: { fundador?: boolean } = {}
): Promise<string> {
  // A oferta de fundador entra sozinha: o cliente não precisa saber que
  // existe um código, a tela já prometeu "R$ 397 para sempre" e o checkout
  // tem que chegar com o desconto aplicado. O Stripe não aceita "discounts"
  // junto com "allow_promotion_codes", então com o cupom automático o campo
  // de código some, o que não faz falta, porque o desconto já está lá.
  const cupomFundador = process.env.STRIPE_FUNDADOR_COUPON_ID;
  const comFundador = Boolean(opcoes.fundador && cupomFundador);
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
    // Sem isto o campo de cupom nem aparece no checkout, e quem recebe um
    // código de campanha precisa de onde digitar. Promessa sem campo é bug.
    ...(comFundador
      ? { discounts: [{ coupon: cupomFundador }] }
      : { allow_promotion_codes: true }),
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
