import Stripe from "stripe";
import { FUNDADOR, TRIAL_DAYS, planoPublico, type PlanoId } from "@/lib/planos";

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
//   R$ 397 para sempre. Em 14/09 ela virou ANUAL e deixou de ser cupom: um
//   price próprio de R$ 4.764 por ano (FUNDADOR_PRICE_ID abaixo), sem código
//   para digitar. O porquê está inteiro em lib/planos.ts, na nota de FUNDADOR.
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
    // Saldo e carteira de vídeo moram em lib/planos.ts desde 06/10, para a
    // vitrine converter em minutos e peças sem importar o Stripe. Valores iguais.
    credits: p.creditosPorMes,
    videoCredits: p.creditosDeVideoPorMes,
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
    // Tabela de 27/09 (Starter). O custo de IA de quem usar tudo fica perto de
    // R$ 740 por mês contra R$ 2.997: 4x. Ver lib/planos.ts.
    // Vídeo por IA INCLUÍDO: 2 vídeos de 30 s por mês na qualidade CHEIA
    // (4 gerações de 520 = 2.080 cada). De manhã de 28/09 eram 4 (regra do
    // Starter gerar 4 no Cheio); à noite o Bruno cortou todos pela metade: o
    // vídeo por IA custa caro, o resultado ainda não compensa, e o incentivo
    // passa a ser o cliente subir o próprio vídeo. No Rápido rende 5.
    // O custo por crédito é o mesmo nas duas qualidades (US$ 1,20 por 195 e
    // US$ 3,20 por 520), então a margem depende só deste número: R$ 125 de
    // Veo no mês se usar tudo, contra R$ 2.997.
    // A reposição completa a carteira de vídeo até este número, sem apagar
    // pacote comprado à parte. Ver `concederCiclo` (lib/credits/ciclo.ts).
    // 28/09, à noite: metade (2 vídeos no Cheio). Ver lib/planos.ts.
    extraCreditPrice: 0.12,
    // "Gravações por mês" é a unidade que o cliente compra (travada no código
    // desde 30/09). Com o preço de 01/10 uma gravação de 22 min com 3 cortes
    // e a sua semana de peças usa 3.174 créditos (era ~630): as 4 do Starter
    // somam ~12.700 dos 20.000. "projects" ainda não é aplicado; está aqui
    // para bater com "marcas" quando for.
    limits: { projects: 1, postsPerMonth: -1, credits: planoPublico("pro").creditosPorMes },
  },
  business: {
    ...daTabela("business"),
    priceId: process.env.STRIPE_BUSINESS_PRICE_ID,
    annualPriceId: process.env.STRIPE_BUSINESS_ANNUAL_PRICE_ID,
    // Pro: R$ 1.530 de custo se usar tudo, contra R$ 3.997 (2,6x).
    // 4 vídeos de 30 s no Cheio (10 no Rápido). Era 16.640 até a noite de 28/09.
    extraCreditPrice: 0.10,
    limits: { projects: 2, postsPerMonth: -1, credits: planoPublico("business").creditosPorMes },
  },
  studio: {
    ...daTabela("studio"),
    priceId: process.env.STRIPE_STUDIO_PRICE_ID,
    annualPriceId: process.env.STRIPE_STUDIO_ANNUAL_PRICE_ID,
    // Enterprise: R$ 2.580 de custo se usar tudo, contra R$ 5.667 (2,2x).
    // 10 vídeos de 30 s no Cheio (26 no Rápido). Era 41.600 (20 no Cheio) até a
    // noite de 28/09, quando o vídeo por IA de todos os planos caiu pela metade.
    extraCreditPrice: 0.08,
    limits: { projects: 5, postsPerMonth: -1, credits: planoPublico("studio").creditosPorMes },
  },
};

/**
 * O price anual de fundador. Sem ele no ambiente, a oferta simplesmente não
 * existe: as telas somem com ela e o checkout segue no preço de lista.
 */
export const FUNDADOR_PRICE_ID = process.env.STRIPE_FUNDADOR_ANNUAL_PRICE_ID;

/**
 * Ainda há vaga de fundador? Os 10 primeiros no Autoridade pagam R$ 4.764 por
 * ano, que são R$ 397 por mês travados para sempre.
 *
 * O QUE MUDOU EM 14/09, e é o preço da saída (b) do card 370: até aqui quem
 * contava era o CUPOM, por `times_redeemed` contra `max_redemptions`, e isso
 * dava um teto atômico de graça, imposto pelo próprio Stripe. Com um price
 * próprio não existe esse teto: `subscriptions.list({price})` é uma CONTAGEM,
 * e duas pessoas no checkout ao mesmo tempo com uma vaga restante podem virar
 * onze fundadores. A janela é de segundos e a fila é de dez, então o risco foi
 * aceito de olho aberto; a alternativa era manter um cupom digitável vivo, que
 * é o que sangrava. Se um dia doer, o lugar de resolver é uma reserva de vaga
 * no nosso banco antes de abrir a sessão, e não um campo a mais no Stripe.
 *
 * Cancelada devolve a vaga: a promessa é de dez fundadores, e guardar cadeira
 * para quem saiu custa uma venda. `incomplete` (pagamento em andamento) SEGURA
 * a vaga de propósito, porque soltá-la é exatamente como nasceria o décimo
 * primeiro.
 *
 * Com o Stripe fora, a resposta é "não há vaga", que é o lado seguro do erro:
 * some com a oferta em vez de prometer preço que ninguém vai honrar.
 */
export async function vagasDeFundador(): Promise<number> {
  if (!FUNDADOR_PRICE_ID) return 0;
  try {
    // limit 100 cobre com folga uma fila de 10, inclusive com rotatividade.
    const assinaturas = await getStripe().subscriptions.list({
      price: FUNDADOR_PRICE_ID,
      status: "all",
      limit: 100,
    });
    const ocupadas = assinaturas.data.filter(
      (s) => s.status !== "canceled" && s.status !== "incomplete_expired"
    ).length;
    return Math.max(0, FUNDADOR.vagas - ocupadas);
  } catch (err) {
    console.error("[stripe] vagas de fundador", err);
    return 0;
  }
}

// A tabela de credito vive em `lib/credits/tabela.ts`, sem dependencia, para
// a TELA poder importar os mesmos precos que o servidor cobra. Ver o porque la.
export { CREDIT_COSTS } from "@/lib/credits/tabela";


export async function createCheckoutSession(
  userId: string,
  email: string,
  priceId: string,
  returnUrl: string
): Promise<string> {
  // A oferta de fundador não passa mais por aqui, e isso é o desenho.
  //
  // Até 14/09 esta função recebia `{ fundador }` e aplicava um cupom por cima
  // do preço de lista. Agora o fundador é um PRICE, escolhido em
  // app/api/stripe/checkout, e daqui para baixo ele é uma assinatura como
  // qualquer outra. Desconto que mora no preço não pode cair no plano errado.
  /**
   * O PREÇO FALA EM MÊS, pedido do Bruno em 23/09.
   *
   * No anual o Stripe escreve sozinho "Depois, R$ 3.970,00 por ano", e essa
   * linha não aceita texto nosso: ela sai do intervalo do preço. O que o
   * checkout deixa escrever é a mensagem acima do botão, e é nela que o valor
   * por mês aparece primeiro, igual à página de planos, que mostra R$ 331 e
   * deixa o total anual como detalhe.
   */
  const preco = await getStripe().prices.retrieve(priceId);
  const centavos = preco.unit_amount ?? 0;
  const anual = preco.recurring?.interval === "year";
  const brl = (c: number) =>
    (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: c % 100 === 0 ? 0 : 2 });
  /**
   * O TEXTO ACIMA DO BOTÃO, na tabela de 27/09: contrato anual pago à vista,
   * sem teste grátis. O valor por mês vem primeiro, como na vitrine, e o total
   * do ano logo depois, porque é ele que sai do cartão hoje.
   */
  const mensagem = anual
    ? `Contrato anual: ${brl(Math.round(centavos / 1200) * 100)} por mês, pagos hoje de uma vez (${brl(centavos)} pelos 12 meses). ` +
      `Se desistir em até 7 dias, devolvemos tudo (Código de Defesa do Consumidor, art. 49).`
    : `${brl(centavos)} por mês.`;

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    custom_text: { submit: { message: mensagem } },
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
    // O campo de digitar código SAIU em 14/09, e o porquê é de caixa.
    //
    // Enquanto ele existia, o cupom do fundador (R$ 300 FIXOS, forever,
    // applies_to vazio) podia ser digitado em qualquer plano, porque valor
    // fixo não sabe em que preço está caindo: no Autoridade de R$ 697 ele é a
    // oferta desenhada, no Essencial de R$ 397 vira R$ 97 por mês para
    // sempre, e no anual de R$ 6.970 vira 4,3%, ou seja oferta nenhuma. Três
    // peças certas somando um vazamento, igual ao Veo de 18/08.
    //
    // Se um dia houver campanha com código digitado, o lugar de voltar é aqui,
    // e o cupom dela precisa ser PERCENTUAL ou preso a um produto. Fixo e solto
    // foi o que sangrou.
    // CÓDIGO PROMOCIONAL SÓ QUANDO LIGADO (04/10, teste da jornada completa do
    // Bruno com cupom de 100%): STRIPE_CODIGO_PROMOCIONAL=1 mostra o campo. Os
    // códigos criados são percentuais e de uso único (ver o aviso acima).
    ...(process.env.STRIPE_CODIGO_PROMOCIONAL === "1" ? { allow_promotion_codes: true } : {}),
    customer_email: email,
    metadata: { userId },
    line_items: [{ price: priceId, quantity: 1 }],
    // A volta passa por /billing/confirmar, que aplica o plano antes de abrir
    // o produto. Direto no dashboard, quem acabou de pagar podia chegar antes
    // do webhook e ver "escolha um plano" de novo. Ver a rota para o porquê.
    success_url: `${returnUrl}?session_id={CHECKOUT_SESSION_ID}`,
    // Cancelou o checkout, volta para a escolha de plano, não para o destino
    // de sucesso: sem plano o dashboard redirecionaria de novo e a pessoa
    // ficaria num pingue-pongue.
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/planos?canceled=true`,
    /**
     * O CARTÃO É EXIGIDO MESMO NO TESTE, e agora está escrito.
     *
     * Era o comportamento padrão do Stripe para assinatura com teste, ou seja
     * a regra de negócio dependia de um padrão de terceiro continuar o que é.
     * Regra que vale dinheiro não mora em padrão alheio: `always` diz em
     * código o que o produto promete na tela ("o cartão é pedido agora, e nada
     * é cobrado nos 7 primeiros dias").
     *
     * O filtro é o ponto: quem cadastra cartão decidiu experimentar para
     * valer. Sem ele o teste vira passeio, e passeio consome cota de vídeo,
     * crédito de IA e armazenamento que custam dinheiro de verdade.
     */
    payment_method_collection: "always",
    subscription_data: {
      metadata: { userId },
      // SEM TESTE GRÁTIS desde 27/09: a entrada é a demonstração com os
      // sócios, e a cobrança do ano acontece na contratação. Assinatura antiga
      // que ainda esteja em teste segue as regras dela no Stripe.
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
