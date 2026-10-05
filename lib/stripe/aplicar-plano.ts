import type Stripe from "stripe";
import { prisma } from "@/lib/db/prisma";
import { concederCiclo } from "@/lib/credits/ciclo";
import { PLANS, FUNDADOR_PRICE_ID } from "@/lib/stripe";
import { creditosDoCiclo } from "@/lib/equipe/regras";

/**
 * O PREÇO DO ACESSO EXTRA DA EQUIPE no Stripe (01/10), mensal e anual.
 *
 * AINDA NÃO EXISTE: a decisão de 01/10 foi não criar produto nem preço com a
 * chave de produção sem o Bruno. Enquanto as variáveis não existirem, o acesso
 * extra é ativado à mão pelo admin (/admin/clientes) e este módulo NÃO mexe em
 * `acessosExtras`. Quando existirem, a quantidade do item na assinatura passa a
 * mandar, a cada evento da assinatura. Os contratos são anuais: o preço anual
 * do acesso extra é 12 x R$ 197 = R$ 2.364 por acesso por ano.
 */
const PRECOS_DO_ACESSO_EXTRA = [
  process.env.STRIPE_ACESSO_EXTRA_PRICE_ID,
  process.env.STRIPE_ACESSO_EXTRA_ANNUAL_PRICE_ID,
].filter((x): x is string => Boolean(x));

/** Quantos acessos extras a assinatura compra, ou null se o preço não existe no ambiente. */
export function acessosExtrasDaAssinatura(sub: Stripe.Subscription): number | null {
  if (PRECOS_DO_ACESSO_EXTRA.length === 0) return null;
  return sub.items.data
    .filter((i) => i.price?.id && PRECOS_DO_ACESSO_EXTRA.includes(i.price.id))
    .reduce((soma, i) => soma + (i.quantity ?? 0), 0);
}

/**
 * QUAL PLANO UM PREÇO COMPRA, decidido num lugar só.
 *
 * ## O defeito que este módulo fecha, achado em 23/09
 *
 * O webhook decidia o plano comparando o `priceId` com uma lista de variáveis
 * de ambiente escrita à mão dentro da rota: Starter, Pro, Pro anual, Business,
 * Studio e Agency. Faltavam TRÊS preços que o checkout vende:
 *
 *   • Autoridade anual (`STRIPE_BUSINESS_ANNUAL_PRICE_ID`);
 *   • Estúdio anual (`STRIPE_STUDIO_ANNUAL_PRICE_ID`);
 *   • o FUNDADOR (`STRIPE_FUNDADOR_ANNUAL_PRICE_ID`), que é a oferta de
 *     lançamento das dez primeiras contas.
 *
 * Quem comprasse qualquer um dos três pagava, o webhook concluía
 * `plan = "free"`, não repunha crédito nenhum, e o portão de entrada mandava
 * a pessoa escolher um plano de novo. **Os dez fundadores teriam sido os dez
 * primeiros clientes trancados do lado de fora depois de pagar.**
 *
 * A causa é a mesma de outras vezes na casa: duas listas para a mesma
 * pergunta. `PLANS` sabia os preços, o webhook tinha a sua cópia, e a cópia
 * ficou para trás quando o anual e o fundador entraram. Agora o plano sai de
 * `PLANS` e do preço de fundador, e a lista à mão deixou de existir.
 */

/** Preços de planos que não se vendem mais, mas que ainda têm assinatura viva. */
const PRECOS_ANTIGOS: Record<string, string> = {
  // Starter saiu em 18/08/2026 e vira o plano de entrada atual.
  ...(process.env.STRIPE_STARTER_PRICE_ID ? { [process.env.STRIPE_STARTER_PRICE_ID]: "pro" } : {}),
  // Agency é anterior à tabela de 02/09 e vira o Estúdio.
  ...(process.env.STRIPE_AGENCY_PRICE_ID ? { [process.env.STRIPE_AGENCY_PRICE_ID]: "studio" } : {}),
};

/**
 * O plano que um preço compra. Devolve `null` para preço desconhecido, e NÃO
 * "free": preço desconhecido depois de um pagamento é dinheiro recebido sem
 * plano entregue, e quem chama precisa saber que é isso, e não confundir com
 * uma assinatura cancelada.
 */
export function planoDoPreco(priceId: string | null | undefined): "pro" | "business" | "studio" | null {
  if (!priceId) return null;
  for (const [id, plano] of Object.entries(PLANS)) {
    const p = plano as { priceId?: string; annualPriceId?: string };
    if (priceId === p.priceId || priceId === p.annualPriceId) {
      if (id === "pro" || id === "business" || id === "studio") return id;
    }
  }
  // O fundador é o Autoridade com o preço travado: mesmo plano, outro preço.
  if (FUNDADOR_PRICE_ID && priceId === FUNDADOR_PRICE_ID) return "business";
  const antigo = PRECOS_ANTIGOS[priceId];
  if (antigo === "pro" || antigo === "business" || antigo === "studio") return antigo;
  return null;
}

/**
 * Aplica plano e créditos a partir de uma assinatura do Stripe.
 *
 * Chamada pelo webhook (os eventos de assinatura e o `checkout.session.
 * completed`) E pela volta do checkout (`/billing/confirmar`). Os dois
 * caminhos existem porque a ordem de chegada não é garantida: o navegador
 * pode voltar do Stripe antes do webhook chegar, e nesse segundo quem acabou
 * de pagar cairia no portão e veria "escolha um plano" de novo.
 *
 * Idempotente: repõe o saldo para o teto do plano com guarda de início de
 * ciclo, então os dois caminhos podem rodar em qualquer ordem, quantas vezes
 * vierem.
 */
export async function aplicarPlanoDaAssinatura(sub: Stripe.Subscription): Promise<string | null> {
  const customerId = sub.customer as string;
  // O ITEM DO PLANO, e não o primeiro item (01/10): com o acesso extra da
  // equipe como segundo item da assinatura, a ordem dos itens deixa de dizer
  // qual é o plano, e ler o item errado tiraria o plano de quem pagou.
  const itemDoPlano = sub.items.data.find((i) => planoDoPreco(i.price?.id)) ?? sub.items.data[0];
  const priceId = itemDoPlano?.price?.id;
  const status = sub.status;

  if (status !== "active" && status !== "trialing") {
    await prisma.user.updateMany({
      where: { stripeCustomerId: customerId },
      data: { plan: "free", trialEndsAt: null },
    });
    return "free";
  }

  const plan = planoDoPreco(priceId);
  if (!plan) {
    // Não rebaixa ninguém por um preço que o código não conhece: a assinatura
    // está VIVA, e tirar o plano de quem pagou seria transformar um defeito
    // nosso em prejuízo do cliente. O grito vai para o log, onde o painel de
    // erros e quem opera enxergam.
    console.error(
      `[stripe] PRECO DESCONHECIDO numa assinatura viva: price=${priceId} customer=${customerId} status=${status}. ` +
        `O cliente pagou e o plano NAO foi aplicado. Conferir PLANS e as variaveis de preco.`
    );
    return null;
  }

  /**
   * O FIM DO TESTE FICA GRAVADO, e some quando o teste acaba.
   *
   * O teste tem limites próprios (uma campanha, sete dias, um vídeo de até
   * 30 s), e quem os aplica precisa saber que a conta está em teste sem
   * perguntar ao Stripe a cada clique. `trialing` escreve a data, `active` a
   * apaga: o campo é o estado, e não um histórico.
   */
  const extrasNoStripe = acessosExtrasDaAssinatura(sub);
  await prisma.user.updateMany({
    where: { stripeCustomerId: customerId },
    data: {
      plan,
      trialEndsAt: status === "trialing" && sub.trial_end ? new Date(sub.trial_end * 1000) : null,
      // Só quando o preço do acesso extra existe; senão o admin manda (01/10).
      ...(extrasNoStripe !== null ? { acessosExtras: extrasNoStripe } : {}),
    },
  });

  /**
   * Repõe o saldo do ciclo. Repõe em vez de somar de propósito: crédito de
   * plano não acumula, senão quem usa pouco vira um passivo crescente e a
   * projeção de custo deixa de valer.
   *
   * O guarda de data existe porque o Stripe dispara `customer.subscription.
   * updated` por vários motivos que não são renovação (troca de cartão,
   * mudança de metadados). Sem ele, cada um desses eventos daria um mês de
   * créditos de graça.
   */
  const creditos = PLANS[plan]?.credits;
  if (creditos) {
    const usuarios = await prisma.user.findMany({
      where: { stripeCustomerId: customerId },
      select: { id: true, acessosExtras: true },
    });
    const inicioDoCiclo = itemDoPlano?.current_period_start;
    const cotaDeVideo = (PLANS[plan] as { videoCredits?: number }).videoCredits ?? 0;
    for (const u of usuarios) {
      // A chave e o guarda vivem DENTRO da trava de concederCiclo (05/10): a
      // volta do checkout e os dois eventos do Stripe chegam juntos, e o guarda
      // lido aqui fora deixava os três passarem. Ver lib/credits/ciclo.ts.
      // Os acessos extras da equipe somam 2.000 créditos cada ao ciclo (01/10).
      await concederCiclo({
        userId: u.id,
        creditos: creditosDoCiclo(creditos, u.acessosExtras),
        cotaDeVideo,
        chave: `stripe:${sub.id}:${inicioDoCiclo ?? "sem-periodo"}`,
        desde: inicioDoCiclo ? new Date(inicioDoCiclo * 1000) : null,
        note: u.acessosExtras > 0 ? `Plano ${plan} + ${u.acessosExtras} acesso(s) extra(s)` : `Plano ${plan}`,
        noteVideo: `Vídeo incluído no plano ${plan}`,
      });
    }
  }
  return plan;
}
