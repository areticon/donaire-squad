export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/db/prisma";
import { reporCiclo } from "@/lib/credits";
import { creditarVideo, jaCreditado } from "@/lib/credits/video";
import { PLANS } from "@/lib/stripe";
import { registrarPasso } from "@/lib/funil/eventos";
// O plano que cada preco compra mora num modulo so, compartilhado com a volta
// do checkout. A copia que vivia aqui esqueceu o anual do Autoridade, o anual
// do Estudio e o FUNDADOR. Ver lib/stripe/aplicar-plano.ts.
import { aplicarPlanoDaAssinatura } from "@/lib/stripe/aplicar-plano";

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

        /**
         * PAGAMENTO DE CONTRATO (04/10): o link de pagamento gerado no gestor
         * de contratos. Sai cedo como a compra de vídeo: não é assinatura, e
         * quem libera o acesso é o próprio contrato (lib/contratos/pagamento),
         * idempotente pelo id da sessão.
         */
        if (session.metadata?.tipo === "contrato") {
          const { pagamentoDoStripe } = await import("@/lib/contratos/pagamento");
          await pagamentoDoStripe(session);
          break;
        }

        /**
         * AS PARCELAS DO CONTRATO NO CARTÃO (05/10): a assinatura que cobra a
         * parcela do mês e termina sozinha. Sai cedo: não é plano da vitrine, e
         * quem libera o acesso é o contrato (lib/contratos/parcelado).
         */
        if (session.metadata?.tipo === "contrato_parcelas") {
          const { parcelasDoCheckout } = await import("@/lib/contratos/parcelado");
          await parcelasDoCheckout(session);
          break;
        }

        /**
         * COMPRA DE CREDITO DE VIDEO, que e pagamento avulso e nao assinatura.
         *
         * Vem primeiro e sai cedo de proposito: uma compra de credito nao tem
         * `subscription`, entao tudo o que vem depois neste bloco (aplicar
         * plano, registrar o passo "assinatura" do funil) nao se aplica a ela.
         * Deixar cair no caminho de assinatura registraria uma venda de plano
         * que nao aconteceu, e o funil e o numero que decide o orcamento de
         * anuncio.
         *
         * A QUANTIDADE VEM DO METADATA, e nao do valor pago: se um dia houver
         * cupom, o cliente continua recebendo o que o pacote prometeu.
         */
        /**
         * PACOTE DE CRÉDITO AVULSO (06/10): pagamento único que enche o saldo de
         * produção. Sai cedo pelo mesmo motivo da compra de vídeo (não é
         * assinatura nem passo de funil). Idempotente pelo id da sessão, dentro
         * de lib/credits. A receita entra sozinha no painel: é uma cobrança
         * paga no Stripe, que é o que lib/admin/receita-real.ts soma.
         */
        if (session.metadata?.tipo === "pacote_de_creditos") {
          const { creditarPacoteDaSessao } = await import("@/lib/credits/pacotes-de-credito-servidor");
          await creditarPacoteDaSessao(session);
          break;
        }

        if (session.metadata?.tipo === "creditos_de_video" && userId) {
          const creditos = Number(session.metadata.creditos ?? 0);
          if (creditos > 0 && !(await jaCreditado("compra_video", session.id))) {
            await creditarVideo({
              userId,
              quantidade: creditos,
              operation: "compra_video",
              // O id da sessao e o que torna o lancamento idempotente: o Stripe
              // reenvia webhook, e creditar duas vezes e dinheiro dado.
              refId: session.id,
              note: `Pacote ${session.metadata.pacoteId ?? "?"}, R$ ${((session.amount_total ?? 0) / 100).toFixed(2)}`,
            });
          }
          if (customerId) {
            await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId } }).catch(() => {});
          }
          break;
        }

        if (userId && customerId) {
          await prisma.user.update({
            where: { id: userId },
            data: { stripeCustomerId: customerId },
          });
        }

        // Corrida real, paga pelo primeiro assinante em 21/08: o
        // customer.subscription.created chegou ANTES deste evento, procurou o
        // usuário pelo stripeCustomerId que ainda não existia, atualizou zero
        // linhas em silêncio e o plano nunca foi concedido. O dinheiro entrou
        // e o produto não. Agora que o customerId está salvo, buscamos a
        // assinatura da sessão e aplicamos o plano aqui também; a aplicação é
        // idempotente (repõe para o teto, com guarda de ciclo), então os dois
        // eventos podem rodar em qualquer ordem.
        if (session.subscription) {
          const sub = await getStripe().subscriptions.retrieve(
            session.subscription as string
          );
          await aplicarPlanoDaAssinatura(sub);
        }

        // O fim do funil. Vale o que o Stripe cobrou, e nao o que a tela
        // prometeu: cupom, imposto e proporcional entram aqui.
        if (userId) {
          await registrarPasso("assinatura", {
            userId,
            valorCents: session.amount_total ?? null,
            meta: { moeda: session.currency ?? "brl", assinatura: String(session.subscription ?? "") },
          });
        }
        break;
      }

      // O boleto do link de pagamento do contrato compensa depois (04/10).
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.tipo === "contrato") {
          const { pagamentoDoStripe } = await import("@/lib/contratos/pagamento");
          await pagamentoDoStripe(session);
        }
        // O pacote só aceita cartão hoje; se um meio assíncrono entrar, o
        // crédito sai aqui, quando o pagamento compensar (06/10).
        if (session.metadata?.tipo === "pacote_de_creditos") {
          const { creditarPacoteDaSessao } = await import("@/lib/credits/pacotes-de-credito-servidor");
          await creditarPacoteDaSessao(session);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        // A assinatura das PARCELAS de um contrato (05/10) não é plano: passar
        // ela aqui rebaixaria a conta para "free" quando ficasse incompleta,
        // atrasada ou terminasse depois da última parcela.
        if (sub.metadata?.tipo === "contrato_parcelas") break;
        await aplicarPlanoDaAssinatura(sub);
        break;
      }

      /**
       * AS PARCELAS DO CONTRATO (05/10): cada fatura paga vira um pagamento do
       * contrato (idempotente pelo id da fatura); a que falha vira pendência no
       * painel. Faturas de outras assinaturas passam reto.
       */
      case "invoice.paid": {
        const { parcelaPaga } = await import("@/lib/contratos/parcelado");
        await parcelaPaga(event.data.object as Stripe.Invoice);
        break;
      }

      case "invoice.payment_failed": {
        const { parcelaFalhou } = await import("@/lib/contratos/parcelado");
        await parcelaFalhou(event.data.object as Stripe.Invoice);
        break;
      }

      /**
       * O AVISO DE RENOVAÇÃO, que os termos prometem (item 5.3, desde 27/09):
       * contrato anual pago à vista renova sozinho, e ninguém deve descobrir
       * uma cobrança de R$ 36 mil pela fatura do cartão. O Stripe manda este
       * evento antes de cada renovação; a antecedência é configurada no painel
       * do Stripe (Faturamento, "eventos de renovação"), e precisa estar em 30
       * dias para bater com o texto dos termos.
       */
      case "invoice.upcoming": {
        const fatura = event.data.object as Stripe.Invoice;
        // Parcela de contrato (05/10) não é renovação: sem este aviso.
        if (fatura.parent?.subscription_details?.metadata?.tipo === "contrato_parcelas") break;
        const email = fatura.customer_email;
        if (email && (fatura.amount_due ?? 0) > 0) {
          const { avisoDeRenovacao } = await import("@/lib/email/renovacao");
          const { enviarEmail } = await import("@/lib/email");
          const quando = fatura.next_payment_attempt ?? fatura.period_end;
          await enviarEmail({
            ...avisoDeRenovacao({
              valorCentavos: fatura.amount_due,
              data: quando ? new Date(quando * 1000) : null,
            }),
            para: email,
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        // O fim das PARCELAS (05/10): registra no contrato e NÃO mexe no plano.
        if (sub.metadata?.tipo === "contrato_parcelas") {
          const { parcelasEncerradas } = await import("@/lib/contratos/parcelado");
          await parcelasEncerradas(sub);
          break;
        }
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
