import { centavosEmReais } from "@/lib/contratos/situacao";

/**
 * A CONDIÇÃO DE PAGAMENTO DO CONTRATO (05/10/2026).
 *
 * Pedido do dono, ferramenta de negociação dos vendedores (o checkout do site
 * continua como está): além do anual à vista, o contrato pode sair com a 1ª
 * PARCELA (A ENTRADA) NO PIX, feito por fora e registrado com o comprovante,
 * e as DEMAIS N PARCELAS MENSAIS NO CARTÃO EM CRÉDITO RECORRENTE. A diferença
 * para o parcelado do cartão é o limite: no parcelado o banco reserva o total
 * no limite do cliente no dia da compra; no recorrente, cada mês cobra só a
 * parcela daquele mês (é uma assinatura do Stripe que termina sozinha depois
 * da N-ésima cobrança).
 *
 * Módulo PURO, sem banco: o formulário do gestor (componente de cliente), o
 * servidor e o texto do contrato fazem a MESMA conta (a lição de preco.ts).
 */

export const CONDICAO_PARCELADA = "entrada_pix_parcelas_cartao" as const;

export const CONDICOES_DE_PAGAMENTO = {
  a_vista: "À vista (anual)",
  [CONDICAO_PARCELADA]: "1ª parcela no Pix, demais no cartão de crédito recorrente",
} as const;

export type CondicaoDePagamento = keyof typeof CONDICOES_DE_PAGAMENTO;

export const PARCELAS_MINIMAS = 1;
export const PARCELAS_MAXIMAS = 12;
/** O Stripe não cobra menos que R$ 0,50; abaixo de R$ 1 a parcela não faz sentido. */
export const PARCELA_MINIMA_CENTAVOS = 100;

export function ehParcelado(c: { condicaoDePagamento?: string | null } | null | undefined): boolean {
  return c?.condicaoDePagamento === CONDICAO_PARCELADA;
}

export type Parcelamento = {
  entradaCentavos: number;
  parcelas: number;
  parcelaCentavos: number;
  /** Centavos da divisão que não fecharam: vão para a entrada, e as parcelas ficam iguais. */
  ajusteNaEntradaCentavos: number;
};

/**
 * A CONTA: (total menos entrada) dividido por N. Os centavos que sobram da
 * divisão vão para a ENTRADA, porque a assinatura cobra sempre o mesmo valor
 * por mês. Devolve o motivo da recusa, em vez de lançar, para o formulário
 * mostrar sem chamar o servidor.
 */
export function calcularParcelamento(totalCentavos: number, entradaCentavos: number, parcelas: number): Parcelamento | { erro: string } {
  const entrada = Math.round(entradaCentavos);
  const n = Math.floor(parcelas);
  if (!Number.isFinite(totalCentavos) || totalCentavos <= 0) return { erro: "O contrato precisa ter valor para parcelar." };
  if (!Number.isFinite(entrada) || entrada <= 0) return { erro: "Informe o valor da 1ª parcela (a entrada no Pix)." };
  if (entrada >= totalCentavos) return { erro: "A 1ª parcela (no Pix) precisa ser menor que o valor do contrato." };
  if (!Number.isInteger(n) || n < PARCELAS_MINIMAS || n > PARCELAS_MAXIMAS) return { erro: `Parcelas no cartão: de ${PARCELAS_MINIMAS} a ${PARCELAS_MAXIMAS}.` };
  const resto = totalCentavos - entrada;
  const parcela = Math.floor(resto / n);
  if (parcela < PARCELA_MINIMA_CENTAVOS) return { erro: `A parcela ficaria abaixo de ${centavosEmReais(PARCELA_MINIMA_CENTAVOS)}.` };
  const ajuste = resto - parcela * n;
  return { entradaCentavos: entrada + ajuste, parcelas: n, parcelaCentavos: parcela, ajusteNaEntradaCentavos: ajuste };
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

/**
 * A 1ª parcela sugerida no formulário: a parcela igual a todas, ou seja o
 * total dividido por N + 1 (o vendedor pode trocar o valor na negociação).
 */
export function entradaSugerida(totalCentavos: number, parcelasNoCartao: number): number {
  const n = Math.max(1, Math.floor(parcelasNoCartao || 1));
  return Math.floor(totalCentavos / (n + 1));
}

/** Dias até a primeira cobrança (para o texto do checkout). */
export function diasAte(d: Date, agora = new Date()): number {
  return Math.max(0, Math.ceil((d.getTime() - agora.getTime()) / DIA));
}

const dataBR = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });

/**
 * A CONDIÇÃO POR EXTENSO, como vai no contrato, na tela e no e-mail:
 * "1ª parcela (entrada) de R$ X via Pix, mais N parcelas mensais de R$ Y no
 * cartão de crédito em cobrança recorrente, sem comprometer o limite total".
 */
export function condicaoPorExtenso(p: { entradaCentavos: number; parcelas: number; parcelaCentavos: number; primeiraParcelaEm?: Date | string | null }): string {
  const primeira = p.primeiraParcelaEm ? `, a primeira delas em ${dataBR(new Date(p.primeiraParcelaEm))}` : ", a primeira delas um mês depois da 1ª parcela";
  const plural = p.parcelas === 1 ? "parcela mensal" : "parcelas mensais";
  return (
    `1ª parcela (entrada) de ${centavosEmReais(p.entradaCentavos)} via Pix, mais ${p.parcelas} ${plural} de ${centavosEmReais(p.parcelaCentavos)} ` +
    `no cartão de crédito em cobrança recorrente${primeira}, sem comprometer o limite total do cartão`
  );
}
