export const dynamic = "force-dynamic";

import { membroAtivo } from "@/lib/equipe/conta";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { getStripe } from "@/lib/stripe";

/**
 * Cancelamento pedido pelo próprio cliente, na tela de configurações.
 *
 * Cancela NO FIM DO PERÍODO e não na hora. Dois motivos, e o segundo é o que
 * importa: o dia já está pago, e tirar o acesso de quem pagou o mês é a forma
 * mais rápida de transformar um cancelamento em reclamação pública. O segundo
 * motivo é comercial: até o fim do período a pessoa continua vendo o produto
 * funcionar, e é a única janela em que dá para reconquistar.
 *
 * O POST desfaz: quem cancelou por engano volta atrás sem falar com ninguém.
 */
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Membro da equipe não vê nem mexe em cobrança (01/10): quem paga é o dono.
    if (await membroAtivo(userId)) return NextResponse.json({ error: "Quem cuida da cobrança é quem administra a conta da sua equipe." }, { status: 403 });

    const { desfazer } = (await req.json().catch(() => ({}))) as { desfazer?: boolean };

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true, role: true },
    });

    // Acesso interno não tem o que cancelar, e deixar o botão funcionar aqui
    // seria a tela agindo sobre uma cobrança que não existe.
    if (user?.role === "admin") {
      return NextResponse.json({ error: "Acesso interno não tem assinatura." }, { status: 400 });
    }
    if (!user?.stripeCustomerId) {
      return NextResponse.json({ error: "Sem assinatura." }, { status: 400 });
    }

    const lista = await getStripe().subscriptions.list({
      customer: user.stripeCustomerId,
      status: "all",
      limit: 10,
    });
    const viva = lista.data.find((a) => ["active", "trialing", "past_due"].includes(a.status));
    if (!viva) return NextResponse.json({ error: "Sem assinatura ativa." }, { status: 400 });

    const atualizada = await getStripe().subscriptions.update(viva.id, {
      cancel_at_period_end: !desfazer,
    });

    return NextResponse.json({
      ok: true,
      cancelaNoFim: Boolean(atualizada.cancel_at_period_end),
    });
  } catch (err) {
    console.error("[stripe/cancelar]", err);
    return NextResponse.json({ error: "Não consegui falar com o Stripe." }, { status: 500 });
  }
}
