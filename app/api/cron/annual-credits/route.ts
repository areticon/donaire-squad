export const dynamic = "force-dynamic";

import { creditosDoCiclo } from "@/lib/equipe/regras";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getStripe, PLANS } from "@/lib/stripe";
import { concederCiclo } from "@/lib/credits/ciclo";

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
 * Repor é idempotente de verdade desde 05/10: `concederCiclo` confere a chave
 * do dia e o guarda dos 30 dias DENTRO de uma trava por usuário, então duas
 * execuções simultâneas (ou o cron junto com um evento do Stripe) concedem uma
 * vez só, inclusive o vídeo, que completa até a cota e somaria em dobro.
 */

const TRINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Price anual -> plano, derivado da tabela canônica PLANS em vez de uma
  // lista escrita à mão. A versão anterior tinha uma linha só, a do Pro, com
  // um comentário pedindo uma linha nova quando Business e Studio ganhassem
  // anual. Eles ganharam em 21/08 e a linha não entrou, então o assinante
  // Business anual (R$ 2.490 à vista) receberia 3.500 créditos no dia 1 e
  // nada nos 11 meses seguintes, sem erro nenhum no log. Derivar de PLANS
  // elimina a classe do problema: plano novo com anual já entra sozinho.
  const priceParaPlano: Record<string, keyof typeof PLANS> = {};
  for (const [plano, cfg] of Object.entries(PLANS) as Array<
    [keyof typeof PLANS, (typeof PLANS)[keyof typeof PLANS]]
  >) {
    if (cfg.annualPriceId) priceParaPlano[cfg.annualPriceId] = plano;
  }

  if (Object.keys(priceParaPlano).length === 0) {
    return NextResponse.json(
      { error: "Nenhum price anual configurado (STRIPE_*_ANNUAL_PRICE_ID)" },
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
        select: { id: true, creditsResetAt: true, acessosExtras: true },
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

        const r = await concederCiclo({
          userId: u.id,
          // Mais 2.000 por acesso extra da equipe (01/10, lib/equipe/regras.ts).
          creditos: creditosDoCiclo(PLANS[plano].credits, u.acessosExtras),
          // O vídeo incluído no plano (tabela de 27/09) repõe junto, todo mês.
          cotaDeVideo: (PLANS[plano] as { videoCredits?: number }).videoCredits ?? 0,
          chave: `anual:${sub.id}:${new Date(agora).toISOString().slice(0, 10)}`,
          desde: new Date(agora - TRINTA_DIAS_MS),
          note: `Plano ${plano} anual, reposição mensal`,
          noteVideo: `Plano ${plano} anual, vídeo do mês`,
        });
        if (!r.concedido) continue;
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
