import { prisma } from "@/lib/db/prisma";
import { planoPublico, type PlanoId } from "@/lib/planos";
import { contaEhDaEquipe, emailDoDominioDaEquipe } from "@/lib/admin/tipos-do-uso-de-ia";
import { contratosDoPainel, type ContratoNaLista } from "@/lib/contratos/painel";

/**
 * A RECEITA REAL (05/10/2026, à noite, regra do Bruno).
 *
 * O painel mostrava uma receita que não existia: a mensalidade da tabela de
 * planos somada para toda conta com `plan` diferente de "free", e as três
 * contas assim são todas da equipe (o Bruno no Gmail, o Bruno no domínio e a
 * conta de revisão). Ninguém pagou ainda; o primeiro cliente entra em
 * 06/10/2026. Receita projetada apresentada como realizada é o número que
 * faz a gestão decidir errado.
 *
 * Daqui em diante receita é SÓ dinheiro confirmado:
 *  - cobrança paga no Stripe (`charges` com `paid` e `succeeded`, líquida de
 *    devolução): é o que cobre o checkout concluído e a fatura paga
 *    (invoice.paid), porque toda fatura paga vira uma cobrança;
 *  - pagamento de contrato registrado por fora (Pix, boleto, transferência)
 *    COM comprovante aceito, em `contratos_pagamentos` com origem "manual".
 *    O pagamento de contrato que veio pelo Stripe já está nas cobranças e não
 *    entra duas vezes.
 *
 * Fica FORA, e a tela diz quanto ficou fora e por quê:
 *  - conta da equipe (admin, `contaInterna` ou e-mail @demandou.com);
 *  - pagamento por fora sem comprovante.
 *
 * Tudo o que é plano, contrato assinado e mensalidade é PROJEÇÃO, e sai
 * separado com esse rótulo (ver `projecao`).
 *
 * Este módulo lê o banco e o Stripe: só servidor. Nunca um SET.
 */

const DOLAR = Number(process.env.DOLAR_PARA_REAL ?? "") || 5.4;

/** Quantos dias para trás o Stripe é lido para saber quem já pagou alguma vez. */
const DIAS_DE_HISTORICO = 400;

export type PagamentoReal = {
  id: string;
  quando: string;
  reais: number;
  /** "stripe" (cartão, checkout, fatura) ou "por_fora" (Pix, boleto, transferência com comprovante). */
  origem: "stripe" | "por_fora";
  forma: string;
  contaId: string | null;
  conta: string;
  descricao: string;
  /** Cobrança em outra moeda, convertida pelo dólar do ambiente. */
  moeda: string;
};

export type ForaDaReceita = {
  motivo: "equipe" | "sem_comprovante" | "sem_conta";
  quando: string;
  reais: number;
  conta: string;
  descricao: string;
};

export type ReceitaReal = {
  /** O Stripe respondeu? Sem ele a receita de cartão fica desconhecida, e a tela diz isso. */
  leuStripe: boolean;
  /** Receita confirmada no período, em reais. */
  totalReais: number;
  /** Os pagamentos que entraram na soma, do mais recente ao mais antigo. */
  pagamentos: PagamentoReal[];
  /** O que não entrou, com o motivo. */
  fora: ForaDaReceita[];
  /** Receita confirmada por conta, no período (só quem entrou na soma). */
  porConta: Record<string, number>;
  /**
   * Clientes pagantes HOJE: contas fora da equipe, com plano em vigor e pelo
   * menos um pagamento confirmado (em qualquer data, dentro do histórico lido).
   */
  pagantes: number;
  pagantesLista: Array<{ id: string; email: string; nome: string | null; plano: string }>;
  /** Contratos por grupo do gestor, para "em aberto" e para a projeção. */
  contratos: {
    emAberto: number;
    emAbertoCentavos: number;
    enviados: number;
    aguardandoPagamento: number;
    rascunhos: number;
    ativos: number;
    ativosCentavos: number;
    /** Contratos de conta da equipe (teste do gestor), fora de todas as contas acima. */
    daEquipe: number;
    lista: ContratoNaLista[];
  };
  /** PROJEÇÃO, separada de propósito: nada disto é caixa. */
  projecao: {
    /** Soma dos contratos pagos e ativos dividida por 12. */
    contratosPorMes: number;
    /** Mensalidade da tabela das contas pagantes, somada. */
    mensalidadesEmVigor: number;
  };
};

type Conta = { id: string; email: string; name: string | null; plan: string; role: string; contaInterna: boolean; stripeCustomerId: string | null };

// A regra de equipe mora em tipos-do-uso-de-ia.ts, uma só para o painel inteiro.
export { contaEhDaEquipe };

async function cobrancasDoStripe(desdeHistorico: Date) {
  const { getStripe } = await import("@/lib/stripe");
  const stripe = getStripe();
  const todas: Array<{
    id: string;
    created: number;
    paid: boolean;
    status: string;
    currency: string;
    amount_captured: number;
    amount_refunded: number;
    customer: string | null;
    email: string | null;
    description: string | null;
  }> = [];
  let starting_after: string | undefined;
  // Dez páginas de cem bastam por muito tempo; se um dia não bastarem, a
  // tela diz que leu parcialmente em vez de inventar o resto.
  for (let pagina = 0; pagina < 10; pagina++) {
    const r = await stripe.charges.list({ created: { gte: Math.floor(desdeHistorico.getTime() / 1000) }, limit: 100, starting_after });
    for (const c of r.data) {
      todas.push({
        id: c.id,
        created: c.created,
        paid: c.paid,
        status: c.status,
        currency: c.currency,
        amount_captured: c.amount_captured,
        amount_refunded: c.amount_refunded,
        customer: typeof c.customer === "string" ? c.customer : (c.customer?.id ?? null),
        email: c.billing_details?.email ?? c.receipt_email ?? null,
        description: c.description ?? null,
      });
    }
    if (!r.has_more || r.data.length === 0) break;
    starting_after = r.data[r.data.length - 1].id;
  }
  return todas;
}

function mensalidadeDoPlano(plano: string): number {
  if (!plano || plano === "free") return 0;
  return planoPublico(plano as PlanoId)?.mensal ?? 0;
}

export async function lerReceitaReal(desde: Date, ate: Date, agora = new Date()): Promise<ReceitaReal> {
  const desdeHistorico = new Date(Math.min(desde.getTime(), agora.getTime() - DIAS_DE_HISTORICO * 86400000));

  const [contasCruas, manuais, contratos] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, email: true, name: true, plan: true, role: true, contaInterna: true, stripeCustomerId: true },
    }),
    prisma.pagamentoDoContrato.findMany({
      where: { origem: "manual", pagoEm: { gte: desdeHistorico, lt: ate } },
      select: {
        id: true,
        valorCentavos: true,
        pagoEm: true,
        forma: true,
        comprovanteUrl: true,
        observacao: true,
        contrato: { select: { id: true, numero: true, userId: true, status: true } },
      },
      orderBy: { pagoEm: "desc" },
    }),
    contratosDoPainel(agora).catch(() => [] as ContratoNaLista[]),
  ]);

  const contas = new Map<string, Conta>(contasCruas.map((c) => [c.id, c]));
  const porCliente = new Map<string, Conta>();
  const porEmail = new Map<string, Conta>();
  for (const c of contasCruas) {
    if (c.stripeCustomerId) porCliente.set(c.stripeCustomerId, c);
    porEmail.set(c.email.toLowerCase(), c);
  }

  let leuStripe = true;
  let cobrancas: Awaited<ReturnType<typeof cobrancasDoStripe>> = [];
  try {
    cobrancas = await cobrancasDoStripe(desdeHistorico);
  } catch (err) {
    console.error("[receita-real] não consegui ler as cobranças do Stripe", err);
    leuStripe = false;
  }

  const pagamentos: PagamentoReal[] = [];
  const fora: ForaDaReceita[] = [];
  const porConta: Record<string, number> = {};
  /** Quem já pagou alguma vez (dentro do histórico), para os pagantes. */
  const jaPagou = new Set<string>();
  const naJanela = (d: Date) => d >= desde && d < ate;

  for (const c of cobrancas) {
    if (!c.paid || c.status !== "succeeded") continue;
    const quando = new Date(c.created * 1000);
    const bruto = (c.amount_captured - c.amount_refunded) / 100;
    const moeda = c.currency.toLowerCase();
    const reais = moeda === "brl" ? bruto : moeda === "usd" ? bruto * DOLAR : bruto;
    if (reais <= 0) continue;
    const conta = (c.customer ? porCliente.get(c.customer) : undefined) ?? (c.email ? porEmail.get(c.email.toLowerCase()) : undefined) ?? null;
    const rotuloDaConta = conta?.email ?? c.email ?? c.customer ?? "cliente sem conta";
    const descricao = c.description ?? "cobrança no Stripe";
    if (conta && contaEhDaEquipe(conta)) {
      if (naJanela(quando)) fora.push({ motivo: "equipe", quando: quando.toISOString(), reais, conta: rotuloDaConta, descricao });
      continue;
    }
    if (!conta && c.email && emailDoDominioDaEquipe(c.email)) {
      if (naJanela(quando)) fora.push({ motivo: "equipe", quando: quando.toISOString(), reais, conta: rotuloDaConta, descricao });
      continue;
    }
    if (conta) jaPagou.add(conta.id);
    if (!naJanela(quando)) continue;
    pagamentos.push({
      id: c.id,
      quando: quando.toISOString(),
      reais,
      origem: "stripe",
      forma: "cartão (Stripe)",
      contaId: conta?.id ?? null,
      conta: rotuloDaConta,
      descricao,
      moeda,
    });
    if (conta) porConta[conta.id] = (porConta[conta.id] ?? 0) + reais;
  }

  for (const p of manuais) {
    const conta = contas.get(p.contrato.userId) ?? null;
    const reais = p.valorCentavos / 100;
    const rotuloDaConta = conta?.email ?? "conta apagada";
    const descricao = `contrato nº ${p.contrato.numero}${p.observacao ? `, ${p.observacao}` : ""}`;
    if (conta && contaEhDaEquipe(conta)) {
      if (naJanela(p.pagoEm)) fora.push({ motivo: "equipe", quando: p.pagoEm.toISOString(), reais, conta: rotuloDaConta, descricao });
      continue;
    }
    if (!p.comprovanteUrl) {
      if (naJanela(p.pagoEm)) fora.push({ motivo: "sem_comprovante", quando: p.pagoEm.toISOString(), reais, conta: rotuloDaConta, descricao });
      continue;
    }
    if (conta) jaPagou.add(conta.id);
    if (!naJanela(p.pagoEm)) continue;
    pagamentos.push({
      id: p.id,
      quando: p.pagoEm.toISOString(),
      reais,
      origem: "por_fora",
      forma: p.forma,
      contaId: conta?.id ?? null,
      conta: rotuloDaConta,
      descricao,
      moeda: "brl",
    });
    if (conta) porConta[conta.id] = (porConta[conta.id] ?? 0) + reais;
  }

  pagamentos.sort((a, b) => b.quando.localeCompare(a.quando));
  fora.sort((a, b) => b.quando.localeCompare(a.quando));

  // Contrato pago (porta aberta) também prova pagamento, mesmo sem comprovante
  // guardado: o `pagoEm` só nasce de pagamento registrado ou do Stripe.
  for (const c of contratos) {
    if (c.pagoEm && c.grupo !== "cancelado") {
      const conta = contas.get(c.userId);
      if (conta && !contaEhDaEquipe(conta)) jaPagou.add(conta.id);
    }
  }

  const pagantesLista = contasCruas
    .filter((c) => !contaEhDaEquipe(c) && c.plan && c.plan !== "free" && jaPagou.has(c.id))
    .map((c) => ({ id: c.id, email: c.email, nome: c.name, plano: c.plan }));

  const semEquipe = contratos.filter((c) => {
    const conta = contas.get(c.userId);
    return !(conta && contaEhDaEquipe(conta));
  });
  const emAberto = semEquipe.filter((c) => c.grupo === "rascunho" || c.grupo === "enviado" || c.grupo === "aguardando_pagamento");
  const ativos = semEquipe.filter((c) => c.grupo === "ativo");

  return {
    leuStripe,
    totalReais: pagamentos.reduce((s, p) => s + p.reais, 0),
    pagamentos,
    fora,
    porConta,
    pagantes: pagantesLista.length,
    pagantesLista,
    contratos: {
      emAberto: emAberto.length,
      emAbertoCentavos: emAberto.reduce((s, c) => s + c.valorCentavos, 0),
      enviados: emAberto.filter((c) => c.grupo === "enviado").length,
      aguardandoPagamento: emAberto.filter((c) => c.grupo === "aguardando_pagamento").length,
      rascunhos: emAberto.filter((c) => c.grupo === "rascunho").length,
      ativos: ativos.length,
      ativosCentavos: ativos.reduce((s, c) => s + c.valorCentavos, 0),
      daEquipe: contratos.length - semEquipe.length,
      lista: semEquipe,
    },
    projecao: {
      contratosPorMes: ativos.reduce((s, c) => s + c.valorCentavos, 0) / 100 / 12,
      mensalidadesEmVigor: pagantesLista.reduce((s, p) => s + mensalidadeDoPlano(p.plano), 0),
    },
  };
}
