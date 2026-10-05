import { centavosEmReais } from "@/lib/contratos/situacao";

/**
 * A CONDIÇÃO DE PAGAMENTO DO CONTRATO (05/10/2026).
 *
 * Pedido do dono, ferramenta de negociação dos vendedores (o checkout do site
 * continua como está): além do anual à vista, o contrato pode sair em DUAS
 * PARTES:
 *
 *  (a) a ENTRADA, com valor escolhido (sugestão: o total dividido por 12) e a
 *      FORMA dela: Pix, boleto ou transferência (os três por fora, registrados
 *      com o comprovante no gestor) ou cartão à vista pelo Stripe (um link no
 *      valor da entrada);
 *  (b) o RESTANTE (o total menos a entrada), com o NÚMERO DE PARCELAS (padrão
 *      11, de 1 a 12) e a FORMA dele: cartão com recorrência (uma assinatura
 *      mensal do Stripe que cobra uma parcela por mês e termina sozinha, sem
 *      comprometer o limite todo), cartão parcelado pelo emissor (um checkout
 *      no valor do restante, com o parcelamento do emissor ligado: o banco
 *      reserva o total no limite) ou cartão à vista (um checkout no valor do
 *      restante).
 *
 * Módulo PURO, sem banco: o formulário do gestor (componente de cliente), o
 * servidor, o texto do contrato e os testes fazem a MESMA conta (a lição de
 * preco.ts).
 */

export const CONDICAO_PARCELADA = "entrada_e_restante" as const;

export const CONDICOES_DE_PAGAMENTO = {
  a_vista: "À vista (anual)",
  [CONDICAO_PARCELADA]: "Entrada mais o restante parcelado",
} as const;

export type CondicaoDePagamento = keyof typeof CONDICOES_DE_PAGAMENTO;

/** As formas da ENTRADA. As três primeiras são por fora (comprovante no gestor). */
export const FORMAS_DA_ENTRADA = {
  pix: "Pix",
  boleto: "Boleto",
  transferencia: "Transferência bancária",
  cartao_stripe: "Cartão à vista pelo Stripe",
} as const;
export type FormaDaEntrada = keyof typeof FORMAS_DA_ENTRADA;

/** As formas do RESTANTE. Todas pelo Stripe, cada uma com o seu link. */
export const FORMAS_DO_RESTANTE = {
  cartao_recorrente: "Cartão com recorrência (uma parcela por mês, sem comprometer o limite todo)",
  cartao_parcelado_emissor: "Cartão parcelado pelo emissor (o banco reserva o total no limite)",
  cartao_a_vista: "Cartão à vista pelo Stripe",
} as const;
export type FormaDoRestante = keyof typeof FORMAS_DO_RESTANTE;

export const FORMA_DA_ENTRADA_PADRAO: FormaDaEntrada = "pix";
export const FORMA_DO_RESTANTE_PADRAO: FormaDoRestante = "cartao_recorrente";

export const PARCELAS_MINIMAS = 1;
export const PARCELAS_MAXIMAS = 12;
export const PARCELAS_PADRAO = 11;
/** O Stripe não cobra menos que R$ 0,50; abaixo de R$ 1 a parcela não faz sentido. */
export const PARCELA_MINIMA_CENTAVOS = 100;

export function ehFormaDaEntrada(v: unknown): v is FormaDaEntrada {
  return typeof v === "string" && v in FORMAS_DA_ENTRADA;
}

export function ehFormaDoRestante(v: unknown): v is FormaDoRestante {
  return typeof v === "string" && v in FORMAS_DO_RESTANTE;
}

/** A entrada é paga por fora (Pix, boleto, transferência) e registrada com o comprovante? */
export function entradaPorFora(forma: string | null | undefined): boolean {
  return forma !== "cartao_stripe";
}

export function ehParcelado(c: { condicaoDePagamento?: string | null } | null | undefined): boolean {
  return c?.condicaoDePagamento === CONDICAO_PARCELADA;
}

/** As formas gravadas num contrato, com o padrão para o que veio sem elas. */
export function formasDoContrato(c: { formaDaEntrada?: string | null; formaDoRestante?: string | null }): { formaDaEntrada: FormaDaEntrada; formaDoRestante: FormaDoRestante } {
  return {
    formaDaEntrada: ehFormaDaEntrada(c.formaDaEntrada) ? c.formaDaEntrada : FORMA_DA_ENTRADA_PADRAO,
    formaDoRestante: ehFormaDoRestante(c.formaDoRestante) ? c.formaDoRestante : FORMA_DO_RESTANTE_PADRAO,
  };
}

export type Parcelamento = {
  entradaCentavos: number;
  /** O total menos a entrada (já com o ajuste dos centavos). */
  restanteCentavos: number;
  parcelas: number;
  parcelaCentavos: number;
  /** Centavos da divisão que não fecharam: vão para a entrada, e as parcelas ficam iguais. */
  ajusteNaEntradaCentavos: number;
};

/**
 * A CONTA: o restante é (total menos entrada), dividido por N. Os centavos que
 * sobram da divisão vão para a ENTRADA, porque a assinatura cobra sempre o
 * mesmo valor por mês (e no parcelado do emissor as parcelas também saem
 * iguais). Com o restante à vista, N é sempre 1. Devolve o motivo da recusa,
 * em vez de lançar, para o formulário mostrar sem chamar o servidor.
 */
export function calcularParcelamento(totalCentavos: number, entradaCentavos: number, parcelas: number, formaDoRestante: FormaDoRestante = FORMA_DO_RESTANTE_PADRAO): Parcelamento | { erro: string } {
  const entrada = Math.round(entradaCentavos);
  const n = formaDoRestante === "cartao_a_vista" ? 1 : Math.floor(parcelas);
  if (!Number.isFinite(totalCentavos) || totalCentavos <= 0) return { erro: "O contrato precisa ter valor para parcelar." };
  if (!Number.isFinite(entrada) || entrada <= 0) return { erro: "Informe o valor da entrada." };
  if (entrada >= totalCentavos) return { erro: "A entrada precisa ser menor que o valor do contrato." };
  if (!Number.isInteger(n) || n < PARCELAS_MINIMAS || n > PARCELAS_MAXIMAS) return { erro: `Parcelas do restante: de ${PARCELAS_MINIMAS} a ${PARCELAS_MAXIMAS}.` };
  const resto = totalCentavos - entrada;
  const parcela = Math.floor(resto / n);
  if (parcela < PARCELA_MINIMA_CENTAVOS) return { erro: `A parcela ficaria abaixo de ${centavosEmReais(PARCELA_MINIMA_CENTAVOS)}.` };
  const ajuste = resto - parcela * n;
  return { entradaCentavos: entrada + ajuste, restanteCentavos: parcela * n, parcelas: n, parcelaCentavos: parcela, ajusteNaEntradaCentavos: ajuste };
}

/** O restante de um contrato gravado: o total menos a entrada. */
export function restanteDoContrato(c: { valorCentavos: number; entradaCentavos: number | null }): number {
  return Math.max(0, c.valorCentavos - (c.entradaCentavos ?? 0));
}

/**
 * A PORTA DO PARCELADO, em conta pura: a entrada confirmada E o restante
 * resolvido. O restante está resolvido quando a assinatura das parcelas existe
 * (recorrência) ou quando o pagamento do restante entrou inteiro (à vista ou
 * parcelado pelo emissor, que para a Demandou é um pagamento só).
 */
export function portaDoParcelado(c: {
  entradaCentavos: number | null;
  valorCentavos: number;
  formaDoRestante?: string | null;
  assinaturaParcelasId: string | null;
  entradaPagaCentavos: number;
  restantePagoCentavos: number;
}): { entradaOk: boolean; restanteOk: boolean; aberta: boolean } {
  const entradaOk = (c.entradaCentavos ?? 0) > 0 && c.entradaPagaCentavos >= (c.entradaCentavos ?? 0);
  const { formaDoRestante } = formasDoContrato(c);
  const restanteOk = formaDoRestante === "cartao_recorrente" ? Boolean(c.assinaturaParcelasId) : c.restantePagoCentavos >= restanteDoContrato(c);
  return { entradaOk, restanteOk, aberta: entradaOk && restanteOk };
}

const DIA = 24 * 60 * 60 * 1000;

/**
 * O DIA DA PRIMEIRA PARCELA. Sem data escolhida, um mês depois da base (a
 * entrada). O dia vai no máximo até 28: assim todo mês tem o dia da cobrança,
 * e a conta do fim da assinatura (abaixo) bate com a do Stripe.
 */
export function primeiraParcelaPadrao(base: Date): Date {
  return ajustarDiaDaCobranca(somarMeses(base, 1));
}

export function ajustarDiaDaCobranca(d: Date): Date {
  const x = new Date(d);
  if (x.getUTCDate() > 28) x.setUTCDate(28);
  return x;
}

/** Soma meses no calendário, segurando no último dia do mês (31/01 + 1 = 28/02). */
export function somarMeses(d: Date, meses: number): Date {
  const x = new Date(d);
  const dia = x.getUTCDate();
  x.setUTCDate(1);
  x.setUTCMonth(x.getUTCMonth() + meses);
  const ultimo = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(dia, ultimo));
  return x;
}

/**
 * QUANDO A ASSINATURA DAS PARCELAS TERMINA: a primeira cobrança mais N meses,
 * menos uma hora. Assim cabem exatamente N cobranças (na âncora e em cada mês
 * seguinte) e a assinatura se encerra antes de abrir a N+1-ésima. O corte de
 * uma hora, com proration "none", não gera crédito nem cobrança proporcional.
 */
export function fimDasParcelas(primeiraCobranca: Date, parcelas: number): Date {
  return new Date(somarMeses(primeiraCobranca, parcelas).getTime() - 60 * 60 * 1000);
}

/** A entrada sugerida no formulário: o total dividido por 12 (o vendedor pode trocar na negociação). */
export function entradaSugerida(totalCentavos: number): number {
  return Math.floor(totalCentavos / 12);
}

/** Dias até a primeira cobrança (para o texto do checkout). */
export function diasAte(d: Date, agora = new Date()): number {
  return Math.max(0, Math.ceil((d.getTime() - agora.getTime()) / DIA));
}

const dataBR = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });

/** A forma da entrada por extenso, no meio da frase ("via Pix"). */
export function formaDaEntradaPorExtenso(forma: FormaDaEntrada): string {
  switch (forma) {
    case "pix":
      return "via Pix";
    case "boleto":
      return "por boleto";
    case "transferencia":
      return "por transferência bancária";
    case "cartao_stripe":
      return "no cartão de crédito à vista, pelo link do Stripe";
  }
}

export type CondicaoParaTexto = {
  entradaCentavos: number;
  parcelas: number;
  parcelaCentavos: number;
  formaDaEntrada?: string | null;
  formaDoRestante?: string | null;
  /** Sem ele, sai da conta: as parcelas vezes a parcela. */
  restanteCentavos?: number | null;
  primeiraParcelaEm?: Date | string | null;
};

/**
 * A CONDIÇÃO POR EXTENSO, como vai no contrato, na tela e no e-mail. Exemplos:
 * "Entrada de R$ X via Pix, mais 11 parcelas mensais de R$ Y no cartão de
 * crédito em cobrança recorrente, a primeira delas em DD/MM/AAAA, sem
 * comprometer o limite total do cartão"; "Entrada de R$ X por boleto, mais o
 * restante de R$ R no cartão de crédito, parcelado pelo emissor em até 11
 * vezes de R$ Y"; "Entrada de R$ X via Pix, mais o restante de R$ R no cartão
 * de crédito à vista, pelo link do Stripe".
 */
export function condicaoPorExtenso(p: CondicaoParaTexto): string {
  const { formaDaEntrada, formaDoRestante } = formasDoContrato(p);
  const restante = p.restanteCentavos ?? p.parcelas * p.parcelaCentavos;
  const entrada = `Entrada de ${centavosEmReais(p.entradaCentavos)} ${formaDaEntradaPorExtenso(formaDaEntrada)}`;
  if (formaDoRestante === "cartao_recorrente") {
    const primeira = p.primeiraParcelaEm ? `, a primeira delas em ${dataBR(new Date(p.primeiraParcelaEm))}` : ", a primeira delas um mês depois da entrada";
    const plural = p.parcelas === 1 ? "parcela mensal" : "parcelas mensais";
    return `${entrada}, mais ${p.parcelas} ${plural} de ${centavosEmReais(p.parcelaCentavos)} no cartão de crédito em cobrança recorrente${primeira}, sem comprometer o limite total do cartão`;
  }
  if (formaDoRestante === "cartao_parcelado_emissor") {
    return `${entrada}, mais o restante de ${centavosEmReais(restante)} no cartão de crédito, parcelado pelo emissor em até ${p.parcelas} ${p.parcelas === 1 ? "vez" : "vezes"} de ${centavosEmReais(p.parcelaCentavos)}`;
  }
  return `${entrada}, mais o restante de ${centavosEmReais(restante)} no cartão de crédito à vista, pelo link do Stripe`;
}

/** O rótulo curto da condição, para o campo "forma de pagamento" do contrato. */
export function rotuloDaCondicao(formaDaEntrada: FormaDaEntrada, formaDoRestante: FormaDoRestante, parcelas: number): string {
  const entrada = `Entrada ${formaDaEntrada === "cartao_stripe" ? "no cartão (Stripe)" : `em ${FORMAS_DA_ENTRADA[formaDaEntrada]}`}`;
  const restante =
    formaDoRestante === "cartao_recorrente"
      ? `restante em ${parcelas}x no cartão (crédito recorrente)`
      : formaDoRestante === "cartao_parcelado_emissor"
        ? `restante no cartão parcelado pelo emissor (até ${parcelas}x)`
        : "restante no cartão à vista (Stripe)";
  return `${entrada}, ${restante}`;
}
