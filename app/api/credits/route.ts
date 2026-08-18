export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { PLANS } from "@/lib/stripe";

/**
 * Saldo e extrato de créditos.
 *
 * O extrato vem junto do saldo de propósito: saldo sozinho gera a pergunta
 * "onde foi parar", e responder isso por suporte custa mais caro que mostrar.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [user, extrato] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { creditsBalance: true, creditsResetAt: true, plan: true },
    }),
    prisma.creditTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        amount: true,
        operation: true,
        note: true,
        balance: true,
        createdAt: true,
      },
    }),
  ]);

  const doPlano = PLANS[user?.plan as keyof typeof PLANS]?.credits ?? 0;

  return NextResponse.json({
    saldo: user?.creditsBalance ?? 0,
    doPlano,
    resetadoEm: user?.creditsResetAt,
    plano: user?.plan ?? "free",
    extrato: extrato.map((t) => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
    })),
  });
}
