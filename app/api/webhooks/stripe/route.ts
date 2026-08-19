export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/db/prisma";
import { reporCiclo } from "@/lib/credits";
import { PLANS } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature")!;

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("[stripe/webhook] signature error", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const customerId = session.customer as string;

        if (userId && customerId) {
          await prisma.user.update({
            where: { id: userId },
            data: { stripeCustomerId: customerId },
          });
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const priceId = sub.items.data[0]?.price?.id;

        let plan = "free";
        // Starter foi descontinuado em 18/08/2026. A linha continua aqui só
        // para não deixar órfã uma assinatura antiga: ela vira pro, que é o
        // plano de entrada atual.
        if (priceId === process.env.STRIPE_STARTER_PRICE_ID) plan = "pro";
        if (priceId === process.env.STRIPE_PRO_PRICE_ID) plan = "pro";
        // Anual e mensal são o mesmo plano; o que muda é o ciclo de cobrança.
        // A reposição mensal de créditos do anual vive em /api/cron/annual-credits,
        // porque este webhook só dispara na renovação, que no anual é 1x por ano.
        if (priceId === process.env.STRIPE_PRO_ANNUAL_PRICE_ID) plan = "pro";
        if (priceId === process.env.STRIPE_BUSINESS_PRICE_ID) plan = "business";
        if (priceId === process.env.STRIPE_STUDIO_PRICE_ID) plan = "studio";
        // Assinaturas antigas do plano Agency (pré Opção B) mapeiam para studio
        if (priceId === process.env.STRIPE_AGENCY_PRICE_ID) plan = "studio";

        const status = sub.status;
        if (status === "active" || status === "trialing") {
          await prisma.user.updateMany({
            where: { stripeCustomerId: customerId },
            data: { plan },
          });

          // Repõe o saldo do ciclo. Repõe em vez de somar de propósito:
          // crédito de plano não acumula, senão quem usa pouco vira um passivo
          // crescente e a projeção de custo deixa de valer.
          //
          // O guarda de data existe porque o Stripe dispara
          // customer.subscription.updated por vários motivos que não são
          // renovação (troca de cartão, mudança de metadados). Sem ele, cada
          // um desses eventos daria um mês de créditos de graça.
          const creditos = PLANS[plan as keyof typeof PLANS]?.credits;
          if (creditos) {
            const usuarios = await prisma.user.findMany({
              where: { stripeCustomerId: customerId },
              select: { id: true, creditsResetAt: true },
            });
            const inicioDoCiclo = sub.items.data[0]?.current_period_start;
            for (const u of usuarios) {
              const jaReposNesteCiclo =
                u.creditsResetAt &&
                inicioDoCiclo &&
                u.creditsResetAt.getTime() >= inicioDoCiclo * 1000;
              if (!jaReposNesteCiclo) {
                await reporCiclo({
                  userId: u.id,
                  creditos,
                  note: `Plano ${plan}`,
                });
              }
            }
          }
        } else {
          await prisma.user.updateMany({
            where: { stripeCustomerId: customerId },
            data: { plan: "free" },
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        await prisma.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: { plan: "free" },
        });
        break;
      }
    }
  } catch (err) {
    console.error("[stripe/webhook] handler error", err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
