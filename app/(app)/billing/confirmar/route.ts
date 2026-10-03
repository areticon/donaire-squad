export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { getStripe } from "@/lib/stripe";
import { aplicarPlanoDaAssinatura } from "@/lib/stripe/aplicar-plano";

/**
 * A VOLTA DO CHECKOUT, que aplica o plano antes de abrir o produto.
 *
 * ## Por que isto existe
 *
 * Até 23/09 o Stripe devolvia a pessoa direto para /dashboard e o plano
 * chegava só pelo webhook. A ordem de chegada não é garantida: o navegador
 * volta em um segundo, o webhook pode levar três. Nesse intervalo o portão
 * lia `plan = "free"` e mandava quem ACABOU de pôr o cartão escolher um plano
 * de novo. Para quem está pagando, é o pior momento possível para parecer
 * quebrado.
 *
 * Agora a volta pergunta ao Stripe, com o id da sessão, e aplica o plano ela
 * mesma, com a MESMA função do webhook. Os dois caminhos são idempotentes, e
 * quem chegar primeiro resolve.
 *
 * ## O que a rota confia, e o que não confia
 *
 * O `session_id` vem na URL, então qualquer um pode colar um. Por isso a
 * sessão só vale se o `userId` do metadata dela for o da pessoa logada, e se
 * ela estiver completa. Uma sessão alheia ou aberta cai no dashboard sem
 * mudar nada, e o webhook continua sendo quem decide nesses casos.
 *
 * Route handler, e não página: não renderiza nada, e assim o layout do app
 * (com o portão) só roda DEPOIS do plano gravado.
 */
export async function GET(req: NextRequest) {
  // A origem da PROPRIA requisicao, e nao NEXT_PUBLIC_APP_URL: num preview ou
  // no dev local, mandar para o dominio de producao perderia a sessao, que mora
  // no cookie do host onde a pessoa esta.
  const base = req.nextUrl.origin;
  const destino = new URL("/dashboard", base);
  const sessionId = req.nextUrl.searchParams.get("session_id");

  const { userId } = await auth();
  if (!userId) {
    // Sessão de login perdida no caminho do Stripe: o login devolve para cá
    // com o id intacto, e a confirmação roda na volta.
    const login = new URL("/sign-in", base);
    login.searchParams.set("redirect", `/billing/confirmar${req.nextUrl.search}`);
    return NextResponse.redirect(login);
  }
  if (!sessionId) return NextResponse.redirect(destino);

  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    const daPessoa = session.metadata?.userId === userId;
    const concluida = session.status === "complete";
    if (daPessoa && concluida && session.customer && session.subscription) {
      // O customerId precisa estar gravado ANTES de aplicar: a aplicação acha
      // o usuário por ele. É a mesma ordem do webhook, pelo mesmo motivo.
      await prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId: session.customer as string },
      });
      const sub = await getStripe().subscriptions.retrieve(session.subscription as string);
      await aplicarPlanoDaAssinatura(sub);
      destino.searchParams.set("bem_vindo", "1");
    }
  } catch (err) {
    // Falhar aqui não pode travar quem pagou: o webhook aplica o plano do
    // mesmo jeito, e o pior caso volta a ser o de antes, alguns segundos.
    console.error("[billing/confirmar]", err);
  }
  return NextResponse.redirect(destino);
}
