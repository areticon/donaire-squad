export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getStripe, PLANS } from "@/lib/stripe";
import { reporCiclo } from "@/lib/credits";

/**
 * Cron diário: repõe os créditos mensais de quem assina o plano anual.
 *
 * Existe porque o webhook de renovação, que repõe o crédito do mensal, só
 * dispara quando o Stripe vira o ciclo de cobrança, e no anual isso acontece
 * uma vez por ano. Sem esta rota, o assinante anual receberia 1.800 créditos
 * no dia 1 e nada até o mês 13, com o plano prometendo créditos por mês.
 *
 * Quem é anual é o Stripe que sabe, então a lista vem de lá em vez de uma
 * coluna no banco: uma fonte de verdade a menos para divergir. Rodando todo
 * dia, cada cliente repõe no aniversário dele (30 dias depois da última
 * reposição), não numa data fixa do calendário. O corte de 30 dias dá 12,1
 * reposições por ano em vez de 12; imprecisão aceita pela simplicidade.
 *
 * Repor é idempotente no efeito: `reporCiclo` zera para o teto do plano, não
 * soma. Rodar duas vezes no mesmo dia não dá crédito de graça.
 */

const TRINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Price anual -> plano da tabela canônica. Quando Business e Studio
  // ganharem anual, é uma linha cada aqui.
  const priceParaPlano: Record<string, keyof typeof PLANS> = {};
  if (process.env.STRIPE_PRO_ANNUAL_PRICE_ID) {
    priceParaPlano[process.env.STRIPE_PRO_ANNUAL_PRICE_ID] = "pro";
  }

  if (Object.keys(priceParaPlano).length === 0) {
    return NextResponse.json(
      { error: "Nenhum price anual configurado (STRIPE_PRO_ANNUAL_PRICE_ID)" },
      { status: 500 }
    );
  }

  const stripe = getStripe();
  const agora = Date.now();
  let verificados = 0;
  const repostos: Array<{ userId: string; plano: string }> = [];
  const avisos: string[] = [];

  for (const [priceId, plano] of Object.entries(priceParaPlano)) {
    // Uma chamada por price, paginada. Com a meta de 30 clientes isso é uma
    // página; o for-await segura o dia em que forem mais de cem.
    for await (const sub of stripe.subscriptions.list({
      price: priceId,
      status: "active",
      limit: 100,
    })) {
      verificados++;
      const customerId =
        typeof sub.customer === "string" ? sub.customer : sub.customer.id;

      const usuarios = await prisma.user.findMany({
        where: { stripeCustomerId: customerId },
        select: { id: true, creditsResetAt: true },
      });

      if (usuarios.length === 0) {
        // Assinatura sem usuário é dinheiro entrando sem produto entregue.
        // Não é erro do cron, mas precisa aparecer no log.
        avisos.push(`customer ${customerId} sem usuário no banco`);
        continue;
      }

      for (const u of usuarios) {
        const vencido =
          !u.creditsResetAt ||
          agora - u.creditsResetAt.getTime() >= TRINTA_DIAS_MS;
        if (!vencido) continue;

        await reporCiclo({
          userId: u.id,
          creditos: PLANS[plano].credits,
          note: `Plano ${plano} anual, reposição mensal`,
        });
        repostos.push({ userId: u.id, plano });
      }
    }
  }

  if (avisos.length) console.warn("[cron/annual-credits]", avisos);

  return NextResponse.json({
    verificados,
    repostos: repostos.length,
    avisos,
    timestamp: new Date(agora).toISOString(),
  });
}
