export const dynamic = 'force-dynamic'

import { membroAtivo } from "@/lib/equipe/conta";
import { auth, currentUser } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { FUNDADOR_PRICE_ID, createCheckoutSession, PLANS, vagasDeFundador } from "@/lib/stripe";
import { prisma } from "@/lib/db/prisma";
import { registrarPasso } from "@/lib/funil/eventos";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Membro da equipe não vê nem mexe em cobrança (01/10): quem paga é o dono.
    if (await membroAtivo(userId)) return NextResponse.json({ error: "Quem cuida da cobrança é quem administra a conta da sua equipe." }, { status: 403 });

    const { planId, ciclo } = await req.json();

    const plan = PLANS[planId as keyof typeof PLANS];
    if (!plan || !("priceId" in plan) || !plan.priceId) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    // SÓ ANUAL desde 27/09 (tabela com o Matheus Gaberlini): o `ciclo` que
    // vier do navegador é ignorado. Sem o preço anual configurado, recusar é
    // melhor que cobrar um mensal que o produto não vende mais.
    void ciclo;
    const anual = "annualPriceId" in plan ? plan.annualPriceId : undefined;
    if (!anual) {
      return NextResponse.json({ error: "Plano sem preço anual configurado" }, { status: 400 });
    }
    let priceId: string = anual;

    const user = await currentUser();
    const email = user?.email ?? "";

    // Quem acabou de pagar não quer ver tela de billing: a volta aplica o
    // plano e segue para o dashboard, que cria o primeiro projeto sozinho e
    // derruba a pessoa na etapa 1 do assistente (pedido do Bruno no teste de
    // jornada de 21/08). O cancelado volta para /planos.
    const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL}/billing/confirmar`;

    // Fundador: só no Autoridade ANUAL, e só enquanto o Stripe disser que ainda
    // há vaga. A decisão é daqui, não da tela, para ninguém montar um pedido
    // com preço de fundador depois que as dez acabaram.
    //
    // A INVERSÃO DE 14/09: era `ciclo !== "anual"`, porque a oferta era um cupom
    // mensal de R$ 300. Virou `ciclo === "anual"`, porque agora ela é um price
    // anual de R$ 4.764. Quem trocar isto de volta sem trocar o price cobra o
    // preço de lista de quem a tela chamou de fundador.
    const fundador =
      planId === "business" &&
      ciclo === "anual" &&
      Boolean(FUNDADOR_PRICE_ID) &&
      (await vagasDeFundador()) > 0;

    // O price do fundador SUBSTITUI o anual de lista, e é a última coisa a
    // decidir antes de abrir a sessão: até aqui `priceId` é o de lista, e é
    // nele que o checkout cai se a vaga acabou entre a tela e o clique.
    if (fundador) priceId = FUNDADOR_PRICE_ID!;

    const checkoutUrl = await createCheckoutSession(userId, email, priceId, returnUrl);

    // O passo do funil sai DAQUI, e nao do navegador: e o unico lugar que sabe
    // o plano, o ciclo e o valor de verdade, e nao da para inflar de fora.
    // Sem valor aqui de proposito: `createCheckoutSession` devolve so a URL, e
    // o valor de verdade (com cupom e imposto) chega no webhook, que e quem
    // grava o passo `assinatura`.
    await registrarPasso("checkout", {
      userId,
      meta: { planId, ciclo: ciclo ?? "mensal", fundador },
    });

    return NextResponse.json({ url: checkoutUrl });
  } catch (err) {
    console.error("[stripe/checkout]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
