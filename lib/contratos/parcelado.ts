import type Stripe from "stripe";
import { prisma } from "@/lib/db/prisma";
import { nomeDoPlano, registrar } from "@/lib/contratos/contratos";
import { centavosEmReais } from "@/lib/contratos/situacao";
import { ajustarDiaDaCobranca, condicaoPorExtenso, ehParcelado, entradaPorFora, fimDasParcelas, formasDoContrato, primeiraParcelaPadrao, restanteDoContrato } from "@/lib/contratos/condicao";
import { conferirPortaDoParcelado, entradaPaga, lancarParcela, restantePago, FORMA_DA_PARCELA } from "@/lib/contratos/pagamento";
import { linkDoPagamento, parcelamentoDoEmissorDisponivel } from "@/lib/contratos/links-de-pagamento";

/**
 * ENTRADA MAIS RESTANTE, do lado do Stripe (05/10/2026).
 *
 * As cobranças de um contrato parcelado:
 *
 *  - a ENTRADA, por fora (Pix, boleto, transferência: o vendedor manda a
 *    chave, o cliente paga e o comprovante é registrado no gestor, o caminho
 *    manual que já existia) ou no CARTÃO À VISTA pelo Stripe (Checkout
 *    mode=payment, só cartão, no valor da entrada; o webhook lança o
 *    pagamento pela parte "entrada");
 *  - o RESTANTE, conforme a forma escolhida:
 *      · cartão com RECORRÊNCIA: Checkout mode=subscription, só cartão, um
 *        preço mensal de (total menos entrada) / N. A primeira cobrança é na
 *        data combinada (billing_cycle_anchor, sem proporcional: até lá nada
 *        é cobrado), e a assinatura ganha `cancel_at` logo que nasce, para
 *        terminar sozinha depois da N-ésima cobrança. Cada fatura paga vira
 *        um PagamentoDoContrato (idempotente pelo id da fatura); fatura que
 *        falha vira a pendência do painel até ser paga;
 *      · cartão PARCELADO PELO EMISSOR: Checkout mode=payment no valor do
 *        restante com o parcelamento do emissor ligado (o cliente escolhe o
 *        número de vezes na tela do Stripe; para a Demandou é um pagamento
 *        só, lançado pela parte "restante");
 *      · cartão À VISTA: Checkout mode=payment no valor do restante.
 *
 * O contrato só é considerado pago (a porta abre e a conta é ativada, uma vez
 * só) quando a entrada está confirmada E o restante está resolvido
 * (assinatura cadastrada, ou restante pago).
 *
 * A assinatura das parcelas é marcada com metadata.tipo = "contrato_parcelas"
 * e o webhook NÃO passa ela pelo aplicarPlanoDaAssinatura: o plano do
 * contrato vem do contrato, e o fim natural dela (cancelada depois da última
 * parcela) não pode rebaixar ninguém para "free". Os pagamentos únicos levam
 * metadata.tipo = "contrato" com a `parte`, e caem em pagamentoDoStripe.
 *
 * Só servidor.
 */

export const TIPO_DAS_PARCELAS = "contrato_parcelas";

export class RecusaDoLink extends Error {}

type ContratoDoLink = NonNullable<Awaited<ReturnType<typeof contratoDoLink>>>;

export async function contratoDoLink(id: string) {
  return prisma.contrato.findUnique({
    where: { id },
    select: {
      id: true,
      numero: true,
      plano: true,
      status: true,
      assinadoEm: true,
      valorCentavos: true,
      signatarioEmail: true,
      signatarioNome: true,
      empresa: true,
      linkDeAssinatura: true,
      condicaoDePagamento: true,
      formaDaEntrada: true,
      formaDoRestante: true,
      entradaCentavos: true,
      parcelas: true,
      parcelaCentavos: true,
      primeiraParcelaEm: true,
      assinaturaParcelasId: true,
    },
  });
}

const numero = (n: number) => String(n).padStart(4, "0");

function conferirContrato(c: ContratoDoLink) {
  if (!ehParcelado(c) || !c.entradaCentavos || !c.parcelas || !c.parcelaCentavos) throw new RecusaDoLink("Este contrato não tem a condição de entrada mais restante.");
  if (c.status === "cancelado") throw new RecusaDoLink("Este contrato foi cancelado e não recebe pagamento.");
  if (!c.assinadoEm) throw new RecusaDoLink("O pagamento abre depois da assinatura do contrato. Assine pelo link que chegou no seu e-mail e volte a este link.");
}

/** Quanto falta da entrada, em centavos. */
export async function faltaDaEntrada(c: { id: string; entradaCentavos: number | null }): Promise<number> {
  return Math.max(0, (c.entradaCentavos ?? 0) - (await entradaPaga(c.id)).centavos);
}

/** Quanto falta do restante pago de uma vez (à vista ou pelo emissor), em centavos. */
export async function faltaDoRestante(c: { id: string; valorCentavos: number; entradaCentavos: number | null }): Promise<number> {
  return Math.max(0, restanteDoContrato(c) - (await restantePago(c.id)));
}

/**
 * A SESSÃO DA ENTRADA no cartão à vista pelo Stripe (parte "entrada"). Só
 * quando a forma da entrada é o cartão; por fora, não há link.
 */
export async function sessaoDaEntrada(c: ContratoDoLink, base: string): Promise<string> {
  conferirContrato(c);
  if (entradaPorFora(formasDoContrato(c).formaDaEntrada)) throw new RecusaDoLink("A entrada deste contrato é paga por fora (Pix, boleto ou transferência): envie o comprovante, que a nossa equipe registra.");
  const falta = await faltaDaEntrada(c);
  if (falta <= 0) throw new RecusaDoLink("A entrada deste contrato já está paga. Nada mais a fazer aqui.");
  const { getStripe } = await import("@/lib/stripe");
  const n = numero(c.numero);
  const meta = { tipo: "contrato", contratoId: c.id, numero: n, parte: "entrada" };
  const volta = linkDoPagamento(c.id, "entrada", base);
  const s = await getStripe().checkout.sessions.create({
    mode: "payment",
    currency: "brl",
    payment_method_types: ["card"],
    customer_email: c.signatarioEmail ?? undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "brl",
          unit_amount: falta,
          product_data: { name: `Contrato Demandou nº ${n}, plano ${nomeDoPlano(c.plano)}: entrada` },
        },
      },
    ],
    metadata: meta,
    payment_intent_data: { metadata: meta },
    success_url: `${volta}&ok=1`,
    cancel_url: volta,
  });
  await registrar(c.id, "sistema", "link_da_entrada_aberto", { sessao: s.id, valor: centavosEmReais(falta) });
  return s.url!;
}

/**
 * A SESSÃO DO RESTANTE (parte "restante"), pela forma escolhida: a assinatura
 * mensal, o pagamento único parcelado pelo emissor ou o pagamento único à vista.
 */
export async function sessaoDoRestante(c: ContratoDoLink, base: string): Promise<string> {
  conferirContrato(c);
  const { formaDoRestante } = formasDoContrato(c);
  if (formaDoRestante === "cartao_recorrente") return sessaoDasParcelas(c, base);
  return sessaoDoRestanteDeUmaVez(c, base, formaDoRestante === "cartao_parcelado_emissor");
}

/**
 * O restante pago DE UMA VEZ: Checkout mode=payment no valor que falta. Com
 * `emissor`, o parcelamento do emissor do cartão fica ligado na tela do
 * Stripe (o cliente escolhe o número de vezes lá; a conta precisa ter o
 * parcelamento liberado no Dashboard).
 */
async function sessaoDoRestanteDeUmaVez(c: ContratoDoLink, base: string, emissor: boolean): Promise<string> {
  if (emissor && !parcelamentoDoEmissorDisponivel()) throw new RecusaDoLink("O parcelamento pelo emissor do cartão ainda não está liberado na nossa conta. Responda ao e-mail do contrato que a equipe resolve com você.");
  const falta = await faltaDoRestante(c);
  if (falta <= 0) throw new RecusaDoLink("O restante deste contrato já está pago. Nada mais a fazer aqui.");
  const { getStripe } = await import("@/lib/stripe");
  const n = numero(c.numero);
  const meta = { tipo: "contrato", contratoId: c.id, numero: n, parte: "restante", ...(emissor ? { parcelado: "emissor" } : {}) };
  const volta = linkDoPagamento(c.id, "restante", base);
  const s = await getStripe().checkout.sessions.create({
    mode: "payment",
    currency: "brl",
    payment_method_types: ["card"],
    customer_email: c.signatarioEmail ?? undefined,
    ...(emissor ? { payment_method_options: { card: { installments: { enabled: true } } } } : {}),
    custom_text: emissor ? { submit: { message: `Restante do contrato: escolha em quantas vezes parcelar (até ${c.parcelas}x, conforme o seu cartão).` } } : undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "brl",
          unit_amount: falta,
          product_data: { name: `Contrato Demandou nº ${n}, plano ${nomeDoPlano(c.plano)}: restante${emissor ? " (parcelado pelo emissor)" : ""}` },
        },
      },
    ],
    metadata: meta,
    payment_intent_data: { metadata: meta },
    success_url: `${volta}&ok=1`,
    cancel_url: volta,
  });
  await registrar(c.id, "sistema", "link_do_restante_aberto", { sessao: s.id, valor: centavosEmReais(falta), forma: emissor ? "cartao_parcelado_emissor" : "cartao_a_vista" });
  return s.url!;
}

/**
 * A sessão das parcelas (restante no cartão com recorrência). A primeira
 * cobrança é na data combinada; se ela já passou (o cliente demorou), a
 * primeira parcela é cobrada na hora.
 */
export async function sessaoDasParcelas(c: ContratoDoLink, base: string): Promise<string> {
  conferirContrato(c);
  if (c.assinaturaParcelasId) throw new RecusaDoLink("As parcelas deste contrato já estão cadastradas no cartão. Nada mais a fazer aqui.");
  const { getStripe } = await import("@/lib/stripe");
  const n = numero(c.numero);
  const meta = { tipo: TIPO_DAS_PARCELAS, contratoId: c.id, numero: n, parcelas: String(c.parcelas) };
  const volta = linkDoPagamento(c.id, "restante", base);
  // A data da primeira parcela: a combinada ou, sem ela, um mês depois da
  // entrada (paga ou, se ainda não, de hoje). A âncora precisa estar no
  // futuro (com folga de uma hora para o checkout); se a combinada já passou,
  // a primeira parcela é cobrada na hora.
  const primeira = c.primeiraParcelaEm ? ajustarDiaDaCobranca(c.primeiraParcelaEm) : primeiraParcelaPadrao((await entradaPaga(c.id)).ultimaEm ?? new Date());
  const ancora = primeira.getTime() > Date.now() + 60 * 60 * 1000 ? Math.floor(primeira.getTime() / 1000) : null;
  const quando = ancora ? `a primeira em ${new Date(ancora * 1000).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : "a primeira hoje";
  const s = await getStripe().checkout.sessions.create({
    mode: "subscription",
    currency: "brl",
    // Só cartão: é o cartão guardado que a assinatura cobra a cada mês.
    payment_method_types: ["card"],
    payment_method_collection: "always",
    customer_email: c.signatarioEmail ?? undefined,
    custom_text: {
      submit: {
        message:
          `${c.parcelas} parcelas mensais de ${centavosEmReais(c.parcelaCentavos!)}, ${quando}. ` +
          `Cada mês cobra só a parcela do mês, sem comprometer o limite total do cartão, e a cobrança termina sozinha depois da ${c.parcelas}ª parcela.`,
      },
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "brl",
          unit_amount: c.parcelaCentavos!,
          recurring: { interval: "month" },
          product_data: { name: `Contrato Demandou nº ${n}, plano ${nomeDoPlano(c.plano)}: parcela mensal (${c.parcelas}x)` },
        },
      },
    ],
    metadata: meta,
    subscription_data: {
      metadata: meta,
      description: `Contrato Demandou nº ${n}: ${c.parcelas} parcelas de ${centavosEmReais(c.parcelaCentavos!)}`,
      ...(ancora ? { billing_cycle_anchor: ancora, proration_behavior: "none" as const } : {}),
    },
    success_url: `${volta}&ok=1`,
    cancel_url: volta,
  });
  await registrar(c.id, "sistema", "link_das_parcelas_aberto", { sessao: s.id, parcela: centavosEmReais(c.parcelaCentavos!), parcelas: c.parcelas, primeira: ancora ? new Date(ancora * 1000) : "na hora" });
  return s.url!;
}

/** A assinatura (ou a fatura dela) é das parcelas de um contrato? */
export function contratoDaAssinatura(sub: Pick<Stripe.Subscription, "metadata">): string | null {
  return sub.metadata?.tipo === TIPO_DAS_PARCELAS && sub.metadata.contratoId ? sub.metadata.contratoId : null;
}

export function contratoDaFatura(fatura: Stripe.Invoice): { contratoId: string; assinatura: string | null } | null {
  const det = fatura.parent?.subscription_details;
  const meta = det?.metadata ?? null;
  if (meta?.tipo !== TIPO_DAS_PARCELAS || !meta.contratoId) return null;
  const sub = det?.subscription;
  return { contratoId: meta.contratoId, assinatura: typeof sub === "string" ? sub : (sub?.id ?? null) };
}

/**
 * O CHECKOUT DAS PARCELAS TERMINOU (webhook checkout.session.completed): grava
 * a assinatura no contrato, marca o fim dela (cancel_at depois da N-ésima
 * cobrança) e confere a porta. Idempotente: o mesmo evento de novo não muda
 * nada; uma SEGUNDA assinatura para o mesmo contrato (dois checkouts abertos e
 * pagos) é cancelada na hora, antes de cobrar.
 */
export async function parcelasDoCheckout(session: Stripe.Checkout.Session): Promise<boolean> {
  if (session.metadata?.tipo !== TIPO_DAS_PARCELAS || !session.metadata.contratoId) return false;
  const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (!subId) return true;
  const c = await prisma.contrato.findUnique({ where: { id: session.metadata.contratoId }, select: { id: true, parcelas: true, assinaturaParcelasId: true, status: true } });
  if (!c?.parcelas) {
    console.error(`[contratos] assinatura de parcelas para contrato inexistente ou sem parcelas: ${session.metadata.contratoId} (assinatura ${subId})`);
    return true;
  }
  const { getStripe } = await import("@/lib/stripe");
  const stripe = getStripe();
  if (c.assinaturaParcelasId && c.assinaturaParcelasId !== subId) {
    await stripe.subscriptions.cancel(subId, { prorate: false }).catch((e) => console.error("[contratos] não cancelei a assinatura de parcelas repetida:", e));
    await registrar(c.id, "stripe", "parcelas_repetidas_canceladas", { assinatura: subId, valeA: c.assinaturaParcelasId });
    return true;
  }
  const sub = await stripe.subscriptions.retrieve(subId);
  // O FIM: N cobranças contadas da âncora (a data da primeira parcela).
  const fim = fimDasParcelas(new Date(sub.billing_cycle_anchor * 1000), c.parcelas);
  if (!sub.cancel_at || Math.abs(sub.cancel_at * 1000 - fim.getTime()) > 60 * 1000) {
    await stripe.subscriptions.update(subId, { cancel_at: Math.floor(fim.getTime() / 1000), proration_behavior: "none" });
  }
  const gravou = await prisma.contrato.updateMany({ where: { id: c.id, assinaturaParcelasId: null }, data: { assinaturaParcelasId: subId } });
  if (gravou.count === 1) {
    await registrar(c.id, "stripe", "parcelas_cadastradas", {
      assinatura: subId,
      parcelas: c.parcelas,
      primeiraCobranca: new Date(sub.billing_cycle_anchor * 1000),
      terminaEm: fim,
    });
  }
  // A cancelada (contrato cancelado no meio do caminho) não abre porta.
  if (c.status !== "cancelado") await conferirPortaDoParcelado("stripe", c.id);
  return true;
}

/** Quantas parcelas já entraram (para "parcela 3 de 10"). */
async function parcelasPagas(contratoId: string): Promise<number> {
  return prisma.pagamentoDoContrato.count({ where: { contratoId, forma: FORMA_DA_PARCELA, aditivoId: null } });
}

/** UMA PARCELA PAGA (webhook invoice.paid). Fatura de R$ 0 (a do checkout antes da âncora) não conta. */
export async function parcelaPaga(fatura: Stripe.Invoice): Promise<boolean> {
  const dono = contratoDaFatura(fatura);
  if (!dono) return false;
  if ((fatura.amount_paid ?? 0) <= 0) return true;
  const c = await prisma.contrato.findUnique({ where: { id: dono.contratoId }, select: { id: true, parcelas: true, parcelaEmAtraso: true } });
  if (!c) return true;
  const ja = await prisma.pagamentoDoContrato.findUnique({ where: { referencia: fatura.id! }, select: { id: true } });
  const ordem = ja ? null : (await parcelasPagas(c.id)) + 1;
  const pagaEm = fatura.status_transitions?.paid_at ? new Date(fatura.status_transitions.paid_at * 1000) : new Date();
  await lancarParcela(c.id, {
    valorCentavos: fatura.amount_paid,
    pagoEm: pagaEm,
    fatura: fatura.id!,
    observacao: ordem ? `Parcela ${ordem} de ${c.parcelas ?? "?"} no cartão (crédito recorrente)` : "Parcela no cartão (crédito recorrente)",
  });
  // A pendência some quando a fatura que falhou é paga (a retentativa do Stripe ou o cliente trocando o cartão).
  if (c.parcelaEmAtraso === fatura.id) {
    await prisma.contrato.updateMany({ where: { id: c.id, parcelaEmAtraso: fatura.id }, data: { parcelaEmAtraso: null, parcelaEmAtrasoDesde: null } });
    await registrar(c.id, "stripe", "parcela_regularizada", { fatura: fatura.id, valor: centavosEmReais(fatura.amount_paid) });
  }
  return true;
}

/** UMA PARCELA QUE FALHOU (webhook invoice.payment_failed): vira a pendência do painel. */
export async function parcelaFalhou(fatura: Stripe.Invoice): Promise<boolean> {
  const dono = contratoDaFatura(fatura);
  if (!dono) return false;
  const c = await prisma.contrato.findUnique({ where: { id: dono.contratoId }, select: { id: true, parcelaEmAtraso: true } });
  if (!c) return true;
  if (c.parcelaEmAtraso !== fatura.id) {
    await prisma.contrato.update({ where: { id: c.id }, data: { parcelaEmAtraso: fatura.id, parcelaEmAtrasoDesde: new Date() } });
  }
  await registrar(c.id, "stripe", "parcela_falhou", {
    fatura: fatura.id,
    valor: centavosEmReais(fatura.amount_due ?? 0),
    tentativa: fatura.attempt_count,
    proximaTentativa: fatura.next_payment_attempt ? new Date(fatura.next_payment_attempt * 1000) : null,
  });
  return true;
}

/** A ASSINATURA DAS PARCELAS TERMINOU (webhook customer.subscription.deleted). */
export async function parcelasEncerradas(sub: Stripe.Subscription): Promise<boolean> {
  const contratoId = contratoDaAssinatura(sub);
  if (!contratoId) return false;
  const c = await prisma.contrato.findUnique({ where: { id: contratoId }, select: { id: true, parcelas: true, assinaturaParcelasId: true } });
  if (!c || c.assinaturaParcelasId !== sub.id) return true;
  const pagas = await parcelasPagas(c.id);
  const completas = pagas >= (c.parcelas ?? 0);
  await registrar(c.id, "stripe", completas ? "parcelas_concluidas" : "parcelas_interrompidas", {
    assinatura: sub.id,
    pagas,
    parcelas: c.parcelas,
    ...(completas ? {} : { motivo: sub.cancellation_details?.reason ?? null }),
  });
  // Interrompida antes da última: a falta fica na pendência do painel.
  if (!completas) {
    await prisma.contrato.updateMany({ where: { id: c.id, parcelaEmAtraso: null }, data: { parcelaEmAtraso: `assinatura:${sub.id}`, parcelaEmAtrasoDesde: new Date() } });
  }
  return true;
}

/** O resumo por extenso do contrato, para o e-mail e a página do cliente. */
export function resumoDaCondicao(c: {
  valorCentavos: number;
  entradaCentavos: number | null;
  parcelas: number | null;
  parcelaCentavos: number | null;
  formaDaEntrada?: string | null;
  formaDoRestante?: string | null;
  primeiraParcelaEm: Date | string | null;
}): string | null {
  if (!c.entradaCentavos || !c.parcelas || !c.parcelaCentavos) return null;
  return condicaoPorExtenso({
    entradaCentavos: c.entradaCentavos,
    parcelas: c.parcelas,
    parcelaCentavos: c.parcelaCentavos,
    restanteCentavos: restanteDoContrato(c),
    formaDaEntrada: c.formaDaEntrada,
    formaDoRestante: c.formaDoRestante,
    primeiraParcelaEm: c.primeiraParcelaEm,
  });
}
