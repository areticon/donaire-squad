export const dynamic = "force-dynamic";

import { membroAtivo } from "@/lib/equipe/conta";
import { auth, currentUser } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { pacoteDeVideo, PACOTES_DE_VIDEO } from "@/lib/credits/pacotes-de-video";

/**
 * A COMPRA DE CRÉDITO DE VÍDEO.
 *
 * Pagamento avulso, e não assinatura: crédito de vídeo é consumo, não acesso. O
 * saldo não expira com o ciclo do plano porque ele não veio do plano.
 *
 * O PREÇO É MONTADO AQUI, com `price_data`, e não num price cadastrado no
 * painel do Stripe. É decisão, e a razão tem data: em agosto a landing prometia
 * o cupom `50LANCAMENTO` que nunca chegou a existir no Stripe, e a promessa só
 * apareceu quando alguém tentou usar. Preço que mora em dois lugares
 * eventualmente discorda; aqui ele mora num só, em
 * `lib/credits/pacotes-de-video.ts`.
 *
 * O crédito NÃO é lançado nesta rota. Quem lança é o webhook, quando o Stripe
 * confirma o pagamento: creditar no retorno da tela é creditar em quem abriu o
 * checkout e não pagou.
 */
export async function GET() {
  return NextResponse.json({ pacotes: PACOTES_DE_VIDEO });
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Membro da equipe não vê nem mexe em cobrança (01/10): quem paga é o dono.
    if (await membroAtivo(userId)) return NextResponse.json({ error: "Quem cuida da cobrança é quem administra a conta da sua equipe." }, { status: 403 });

    const { pacoteId } = await req.json();
    const pacote = pacoteDeVideo(String(pacoteId ?? ""));
    if (!pacote) return NextResponse.json({ error: "Pacote inválido" }, { status: 400 });

    const user = await currentUser();
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://demandou.com";

    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: user?.email ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "brl",
            unit_amount: pacote.centavos,
            product_data: {
              name: `Créditos de vídeo: ${pacote.nome}`,
              description: `${pacote.creditos} créditos de vídeo (${pacote.equivale}).`,
            },
          },
        },
      ],
      // O webhook lê estes três campos para saber quanto creditar e em quem. O
      // valor pago NÃO é a fonte da verdade do crédito: se um dia houver cupom,
      // o cliente continua recebendo o que o pacote promete.
      metadata: {
        userId,
        tipo: "creditos_de_video",
        pacoteId: pacote.id,
        creditos: String(pacote.creditos),
      },
      success_url: `${base}/dashboard?video_creditos=ok`,
      cancel_url: `${base}/dashboard?video_creditos=cancelado`,
    });

    if (!session.url) return NextResponse.json({ error: "Stripe não devolveu a URL" }, { status: 502 });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[creditos-de-video] falhou:", err);
    return NextResponse.json({ error: "Não consegui abrir o checkout agora." }, { status: 500 });
  }
}
