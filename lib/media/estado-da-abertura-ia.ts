/**
 * O estado da ABERTURA POR IA de um corte (Higgsfield), do jeito que a tela lê.
 *
 * Módulo puro, sem banco: quem lê são o painel dos cortes e o card do Vitor no
 * quadro, que são componentes de cliente. O trabalho mora em
 * `lib/media/higgsfield-nos-cortes.ts`.
 */

export type EstadoDaAberturaIa =
  /** O corte chegou e espera o passo da fila pedir as gerações. */
  | "na-fila"
  /** Cobrando, preparando o quadro e pedindo à Higgsfield. */
  | "pedindo"
  /** Pedidos aceitos; a Higgsfield está gerando (leva de 1 a 5 min). */
  | "gerando"
  /** Clipes prontos; o worker está emendando no corte. */
  | "emendando"
  /** O corte na tela já é a versão com abertura. */
  | "pronto"
  /** Seguiu sem abertura, com o motivo gravado. */
  | "sem-abertura";

export type GeracaoDoCorte = {
  chave: string;
  requestId?: string;
  status?: string;
  blobUrl?: string;
  custoUsd?: number;
  camera?: string | null;
  efeito?: string | null;
  erro?: string;
};

/** O que fica em `clips[i].higgsfield` e espelhado no card do Vitor como `aberturaIa`. */
export type AberturaIa = {
  estado: EstadoDaAberturaIa;
  /** Quando o estado atual começou: é o que separa trabalho vivo de morto. */
  desde: string;
  /** Créditos cobrados por este corte (à parte da edição). */
  creditos?: number;
  /** O quadro 9:16 mandado à Higgsfield. */
  quadroUrl?: string;
  /** Hash curto da capa de origem: muda se o corte for refeito com outra capa. */
  origem?: string;
  abertura?: GeracaoDoCorte;
  apoio?: GeracaoDoCorte;
  /** A URL do vertical emendado, para saber se o corte foi refeito depois. */
  verticalEmendado?: string;
  tentativasDeEmenda?: number;
  motivo?: string | null;
};

const TRABALHANDO: EstadoDaAberturaIa[] = ["na-fila", "pedindo", "gerando", "emendando"];
/** Nenhum estado de trabalho vive mais que isto (o passo desiste aos 30 min). */
const PRAZO_NA_TELA_MS = 45 * 60_000;

export function lerAberturaIa(
  bruto: unknown
): { estado: EstadoDaAberturaIa; trabalhando: boolean; rotulo: string; detalhe: string | null; creditos: number } | null {
  if (!bruto || typeof bruto !== "object") return null;
  const a = bruto as AberturaIa;
  if (!a.estado) return null;
  const idade = Date.now() - new Date(a.desde ?? 0).getTime();
  // Estado que sobrevive ao fato vira mentira na tela: trabalho parado além
  // do prazo não é mostrado como "gerando".
  const trabalhando = TRABALHANDO.includes(a.estado) && idade < PRAZO_NA_TELA_MS;
  const creditos = a.creditos ?? 0;
  if (trabalhando) {
    return {
      estado: a.estado,
      trabalhando,
      rotulo: a.estado === "emendando" ? "Vitor emendando a abertura (Higgsfield)" : "Vitor gerando a abertura (Higgsfield)",
      detalhe: creditos ? `Abertura por IA: +${creditos} créditos, à parte da edição.` : null,
      creditos,
    };
  }
  if (a.estado === "pronto") {
    return {
      estado: a.estado,
      trabalhando: false,
      rotulo: "Abertura por IA pronta",
      detalhe: creditos ? `+${creditos} créditos, à parte da edição.` : null,
      creditos,
    };
  }
  return {
    estado: a.estado,
    trabalhando: false,
    rotulo: "Corte sem abertura por IA",
    detalhe: a.motivo ?? null,
    creditos,
  };
}
