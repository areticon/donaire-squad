/**
 * O estado da revisão de UM corte, do jeito que a tela precisa ler.
 *
 * Módulo puro de propósito, sem banco e sem modelo: quem lê isto são os
 * componentes de cliente (o painel dos cortes e o card do Vitor no quadro), e
 * componente de cliente nunca importa módulo que toca o banco. O trabalho de
 * revisar e refazer mora em `lib/media/revisao-do-corte.ts`.
 *
 * Nasceu do teste do Bruno de 29/09: o corte que a Vera reprovava chegava ao
 * cliente como "esperando você", e o conserto era trabalho do cliente. Agora a
 * Vera devolve ao Vitor, ele refaz sozinho até duas vezes, e só chega ao
 * cliente, com o motivo, o que não teve conserto.
 */

/** Quantas vezes o Vitor refaz sozinho antes de levar o corte ao cliente. */
export const MAX_REFACOES_DO_CORTE = 2;

export type EstadoDaRevisaoDoCorte =
  /** A Vera está assistindo (lendo a fala do corte) agora. */
  | "revisando"
  /** A Vera aprovou; o corte segue para o cliente decidir se publica. */
  | "aprovado"
  /** A Vera reprovou e o Vitor está recortando o trecho com novo início e fim. */
  | "refazendo"
  /** Não teve conserto depois das tentativas: vai ao cliente, com o motivo. */
  | "para-voce";

export type TentativaDoCorte = {
  inicio: number;
  fim: number;
  veredito: "APROVADO" | "REPROVADO";
  motivo: string;
  em: string;
};

/** O que fica gravado no trecho (`clips[i].revisaoDoCorte`) e no card do Vitor. */
export type RevisaoDoCorte = {
  estado: EstadoDaRevisaoDoCorte;
  /** O motivo da última reprovação, na voz da Vera, para o cliente ler. */
  motivo?: string | null;
  /** O que o Vitor mudou na última refação, em uma frase. */
  ajuste?: string | null;
  /** Quantas refações já foram feitas (espelho de `trecho.refacoes`). */
  refacoes: number;
  /** Quando o estado atual começou, para a tela não mentir sobre trabalho morto. */
  desde: string;
  historico?: TentativaDoCorte[];
};

/**
 * Refação que passa disto sem o worker responder não está mais acontecendo.
 * Um recorte de um trecho leva de 2 a 6 minutos no worker; 30 é folga de
 * sobra. Sem este teto, um worker que morre no meio deixaria o card dizendo
 * "o Vitor está refazendo" para sempre, e estado que sobrevive ao fato vira
 * mentira na tela.
 */
const PRAZO_DA_REFACAO_MS = 30 * 60_000;
/** Revisão da Vera é uma chamada de segundos; 10 minutos é função morta. */
const PRAZO_DA_REVISAO_MS = 10 * 60_000;

export type LeituraDaRevisao = {
  estado: EstadoDaRevisaoDoCorte;
  /** A frase curta do selo: "Vitor refazendo (1 de 2)". */
  rotulo: string;
  /** A explicação para o cliente, quando há o que explicar. */
  detalhe: string | null;
  /** O squad ainda está trabalhando neste corte (o cliente não precisa agir). */
  trabalhando: boolean;
};

/**
 * Traduz o que está gravado para o que a tela diz, já tratando o estado
 * vencido: refação sem resposta do worker depois do prazo é mostrada como
 * "para você", com o motivo dito às claras.
 */
export function lerRevisaoDoCorte(
  revisao: RevisaoDoCorte | null | undefined,
  agora: number = Date.now()
): LeituraDaRevisao | null {
  if (!revisao?.estado) return null;
  const desde = new Date(revisao.desde).getTime();
  const idade = Number.isFinite(desde) ? agora - desde : 0;
  const tentativa = Math.min(Math.max(revisao.refacoes, 1), MAX_REFACOES_DO_CORTE);

  if (revisao.estado === "refazendo" && idade > PRAZO_DA_REFACAO_MS) {
    return {
      estado: "para-voce",
      rotulo: "Precisa de você",
      detalhe:
        `A Vera pediu para refazer este corte${revisao.motivo ? ` (${revisao.motivo})` : ""}, ` +
        "e o estúdio de vídeo não devolveu a versão nova. O corte que está aqui é o anterior.",
      trabalhando: false,
    };
  }
  if (revisao.estado === "revisando" && idade > PRAZO_DA_REVISAO_MS) {
    // A revisão morreu no meio: o corte existe e pode ser visto, só não foi
    // revisado. Não é o caso de assustar o cliente com reprovação.
    return null;
  }

  switch (revisao.estado) {
    case "revisando":
      return {
        estado: "revisando",
        rotulo: "Vera revisando o corte",
        detalhe: null,
        trabalhando: true,
      };
    case "refazendo":
      return {
        estado: "refazendo",
        rotulo: `Vitor refazendo o corte (${tentativa} de ${MAX_REFACOES_DO_CORTE})`,
        detalhe:
          `A Vera devolveu este corte ao Vitor${revisao.motivo ? `: ${revisao.motivo}` : "."}` +
          (revisao.ajuste ? ` ${revisao.ajuste}` : ""),
        trabalhando: true,
      };
    case "aprovado":
      return {
        estado: "aprovado",
        rotulo: revisao.refacoes > 0 ? "Aprovado pela Vera depois de refeito" : "Aprovado pela Vera",
        detalhe: null,
        trabalhando: false,
      };
    case "para-voce":
      return {
        estado: "para-voce",
        rotulo: "A Vera pede o seu olhar",
        detalhe:
          (revisao.refacoes > 0
            ? `O Vitor refez este corte ${revisao.refacoes === 1 ? "uma vez" : `${revisao.refacoes} vezes`} e a Vera ainda não aprovou`
            : "A Vera não aprovou este corte e ajustar o início e o fim não resolve") +
          (revisao.motivo ? `: ${revisao.motivo}` : ".") +
          " Assista e decida se publica, ajusta ou descarta.",
        trabalhando: false,
      };
  }
}
