/**
 * A SITUAÇÃO DE UM CONTRATO, calculada das datas (02/10/2026; o pagamento
 * entrou em 04/10).
 *
 * Módulo PURO, sem banco: a tela do admin, a régua do cron e a prova usam a
 * mesma conta. O `status` guardado no banco diz em que ponto da ASSINATURA o
 * contrato está (rascunho, enviado, assinado, cancelado); "aguardando
 * pagamento" sai de assinado sem `pagoEm`, e vigente, a vencer e vencido saem
 * do relógio. O cron grava o resultado para a lista filtrar.
 *
 * A vigência é SEMPRE de um ano: começa no dia combinado e termina no mesmo
 * dia do ano seguinte.
 */

export const STATUS_DO_CONTRATO = ["rascunho", "enviado", "aguardando_pagamento", "assinado", "vigente", "a_vencer", "vencido", "cancelado"] as const;
export type StatusDoContrato = (typeof STATUS_DO_CONTRATO)[number];

export const NOME_DO_STATUS_DO_CONTRATO: Record<StatusDoContrato, string> = {
  rascunho: "Rascunho",
  enviado: "Enviado para assinatura",
  aguardando_pagamento: "Assinado, aguardando pagamento",
  assinado: "Pago, começa em breve",
  vigente: "Pago e ativo",
  a_vencer: "Ativo, a vencer",
  vencido: "Vencido",
  cancelado: "Cancelado",
};

/** A cor de cada situação, nos tokens do painel. */
export const COR_DO_STATUS_DO_CONTRATO: Record<StatusDoContrato, string> = {
  rascunho: "var(--painel-neutro)",
  enviado: "var(--painel-4)",
  aguardando_pagamento: "var(--painel-2)",
  assinado: "var(--painel-3)",
  vigente: "var(--painel-1)",
  a_vencer: "var(--painel-5)",
  vencido: "var(--badge-danger-text)",
  cancelado: "var(--painel-neutro)",
};

/** Os avisos antes do vencimento, em dias. */
export const AVISOS_EM_DIAS = [60, 30, 7] as const;
export type TipoDeAviso = "d60" | "d30" | "d7" | "vencido";

const DIA = 24 * 60 * 60 * 1000;

export function ehStatusDoContrato(v: unknown): v is StatusDoContrato {
  return typeof v === "string" && (STATUS_DO_CONTRATO as readonly string[]).includes(v);
}

/** O fim da vigência: o mesmo dia, um ano depois. */
export function fimDaVigencia(inicio: Date): Date {
  const fim = new Date(inicio);
  fim.setUTCFullYear(fim.getUTCFullYear() + 1);
  return fim;
}

export type DatasDoContrato = {
  status: string;
  inicioVigencia: Date | string | null;
  fimVigencia: Date | string | null;
  /**
   * O primeiro pagamento confirmado (04/10). Contrato assinado e sem
   * pagamento "aguarda pagamento", qualquer que seja a data: pela cláusula 5.1
   * a vigência só conta da confirmação do pagamento, e até lá a pessoa não é
   * cliente.
   */
  pagoEm?: Date | string | null;
};

const data = (d: Date | string | null) => (d ? new Date(d) : null);

/** Quantos dias faltam para vencer (negativo depois de vencido); null sem datas. */
export function diasParaVencer(c: DatasDoContrato, agora = new Date()): number | null {
  const fim = data(c.fimVigencia);
  if (!fim) return null;
  return Math.ceil((fim.getTime() - agora.getTime()) / DIA);
}

export function situacaoDoContrato(c: DatasDoContrato, agora = new Date()): StatusDoContrato {
  if (c.status === "cancelado") return "cancelado";
  if (c.status === "rascunho" || c.status === "enviado") return c.status;
  // Assinado e ainda sem pagamento: nem o relógio liga.
  if (!c.pagoEm) return "aguardando_pagamento";
  // Daqui para baixo o contrato está assinado e pago: o que muda é o relógio.
  const inicio = data(c.inicioVigencia);
  const fim = data(c.fimVigencia);
  if (!inicio || !fim) return "assinado";
  if (agora < inicio) return "assinado";
  if (agora >= fim) return "vencido";
  const dias = diasParaVencer(c, agora) ?? 999;
  return dias <= AVISOS_EM_DIAS[0] ? "a_vencer" : "vigente";
}

/**
 * Qual aviso cabe AGORA. Só o mais próximo: contrato que entra no sistema com
 * 20 dias para vencer recebe o de 30, e não o de 60 atrasado. O "vencido" vale
 * só nos 3 primeiros dias depois do fim (o cron pode ter ficado parado; mais
 * que isso, o aviso perdeu o sentido).
 */
export function avisoDevido(c: DatasDoContrato, agora = new Date()): TipoDeAviso | null {
  const s = situacaoDoContrato(c, agora);
  if (s !== "a_vencer" && s !== "vencido") return null;
  const dias = diasParaVencer(c, agora);
  if (dias === null) return null;
  if (dias <= 0) return dias > -3 ? "vencido" : null;
  if (dias <= 7) return "d7";
  if (dias <= 30) return "d30";
  if (dias <= 60) return "d60";
  return null;
}

/** Quanto da vigência já passou, de 0 a 1 (para a barra do painel). */
export function fracaoDaVigencia(c: DatasDoContrato, agora = new Date()): number {
  const inicio = data(c.inicioVigencia);
  const fim = data(c.fimVigencia);
  if (!inicio || !fim) return 0;
  const total = fim.getTime() - inicio.getTime();
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, (agora.getTime() - inicio.getTime()) / total));
}

export const centavosEmReais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * OS GRUPOS DO GESTOR (04/10), na língua do dono: rascunho, enviado para
 * assinatura, assinado aguardando pagamento, pago e ativo, vencido e
 * cancelado. "Pago e ativo" junta o que já foi pago e vale (ou vai valer).
 */
export const GRUPOS_DO_GESTOR = ["rascunho", "enviado", "aguardando_pagamento", "ativo", "vencido", "cancelado"] as const;
export type GrupoDoGestor = (typeof GRUPOS_DO_GESTOR)[number];

export const NOME_DO_GRUPO: Record<GrupoDoGestor, string> = {
  rascunho: "Rascunho",
  enviado: "Enviado para assinatura",
  aguardando_pagamento: "Assinado, aguardando pagamento",
  ativo: "Pago e ativo",
  vencido: "Vencido",
  cancelado: "Cancelado",
};

export const COR_DO_GRUPO: Record<GrupoDoGestor, string> = {
  rascunho: "var(--painel-neutro)",
  enviado: "var(--painel-4)",
  aguardando_pagamento: "var(--painel-2)",
  ativo: "var(--painel-1)",
  vencido: "var(--badge-danger-text)",
  cancelado: "var(--painel-neutro)",
};

export function grupoDaSituacao(s: StatusDoContrato): GrupoDoGestor {
  if (s === "assinado" || s === "vigente" || s === "a_vencer") return "ativo";
  return s;
}

export function ehGrupoDoGestor(v: unknown): v is GrupoDoGestor {
  return typeof v === "string" && (GRUPOS_DO_GESTOR as readonly string[]).includes(v);
}

/** As formas de pagamento que o admin registra à mão (04/10). */
export const FORMAS_DE_PAGAMENTO = ["pix", "boleto", "transferencia", "cartao"] as const;
export type FormaDePagamento = (typeof FORMAS_DE_PAGAMENTO)[number];
export const NOME_DA_FORMA: Record<string, string> = {
  pix: "Pix",
  boleto: "Boleto",
  transferencia: "Transferência",
  cartao: "Cartão",
  stripe: "Link de pagamento do Stripe",
  // As parcelas da assinatura do contrato parcelado (05/10).
  cartao_recorrente: "Cartão, crédito recorrente",
};
