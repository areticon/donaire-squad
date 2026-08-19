export const dynamic = 'force-dynamic'

import { auth, currentUser } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { createCheckoutSession, PLANS } from "@/lib/stripe";
import { prisma } from "@/lib/db/prisma";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { planId, ciclo } = await req.json();

    const plan = PLANS[planId as keyof typeof PLANS];
    if (!plan || !("priceId" in plan) || !plan.priceId) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    // Ciclo anual: só o Pro tem, por enquanto. Se o price não estiver
    // configurado no ambiente, recusar é melhor que cair no mensal em
    // silêncio e cobrar diferente do que a tela prometeu.
    let priceId = plan.priceId;
    if (ciclo === "anual") {
      const anual = "annualPriceId" in plan ? plan.annualPriceId : undefined;
      if (!anual) {
        return NextResponse.json(
          { error: "Esse plano não tem ciclo anual" },
          { status: 400 }
        );
      }
      priceId = anual;
    }

    const user = await currentUser();
    const email = user?.email ?? "";

    const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL}/billing`;
    const checkoutUrl = await createCheckoutSession(
      userId,
      email,
      priceId,
      returnUrl
    );

    return NextResponse.json({ url: checkoutUrl });
  } catch (err) {
    console.error("[stripe/checkout]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
