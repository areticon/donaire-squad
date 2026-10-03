export const dynamic = "force-dynamic";
import { membroAtivo } from "@/lib/equipe/conta";
import { auth } from "@/lib/auth/server";
import { NextResponse } from "next/server";
import { createBillingPortalSession } from "@/lib/stripe";
import { prisma } from "@/lib/db/prisma";

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Membro da equipe não vê nem mexe em cobrança (01/10): quem paga é o dono.
    if (await membroAtivo(userId)) return NextResponse.json({ error: "Quem cuida da cobrança é quem administra a conta da sua equipe." }, { status: 403 });
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.stripeCustomerId) return NextResponse.json({ error: "No billing account" }, { status: 400 });
    const url = await createBillingPortalSession(user.stripeCustomerId, process.env.NEXT_PUBLIC_APP_URL + "/billing");
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[stripe/portal]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
