/**
 * O QUE UM PUNHADO DE CRÉDITOS VIRA, em linguagem de cliente (06/10/2026).
 *
 * Crédito é a unidade de custo nossa; o cliente pensa em vídeo e peça. Este
 * módulo traduz uma quantidade de créditos no que ela rende, com a MESMA conta
 * da tela de envio (`creditosEmDuasPartes` em lib/media/limits.ts): uma
 * gravação com a semana sugerida (vídeo completo, 3 cortes verticais, as peças
 * da semana e a abertura) e o preço de um corte vertical a mais.
 *
 * Quem usa: a ajuda do teto de créditos da equipe e os pacotes de crédito. Se a
 * ajuda "Como contamos" dos planos (lib/entregas-do-plano.ts, em outra frente)
 * entrar, a conta é a mesma: gravação de 30 minutos com a semana sugerida.
 *
 * Sem banco e sem SDK: componente de cliente importa daqui.
 */
import { CORTES_SUGERIDOS, CREDITOS_POR_CORTE_APROVADO, creditosEmDuasPartes } from "@/lib/media/limits";

/** A gravação de referência das frases: 30 minutos, como na ajuda dos planos. */
export const MINUTOS_DA_GRAVACAO_DE_REFERENCIA = 30;

/** Créditos de uma gravação de N minutos com a semana sugerida. */
export function creditosDaGravacao(minutos: number = MINUTOS_DA_GRAVACAO_DE_REFERENCIA): number {
  return creditosEmDuasPartes(minutos * 60).total;
}

export type Rendimento = {
  /** Gravações de referência inteiras que cabem. */
  gravacoes: number;
  /** Cortes verticais a mais que cabem no que sobra depois das gravações. */
  cortes: number;
  /** A frase pronta: "1 gravação de 30 minutos com a semana inteira e mais 2 cortes verticais". */
  frase: string;
};

const n = (v: number) => v.toLocaleString("pt-BR");

/** O que esta quantidade de créditos rende, em gravações e cortes. */
export function rendimento(creditos: number): Rendimento {
  const porGravacao = creditosDaGravacao();
  const gravacoes = Math.floor(Math.max(0, creditos) / porGravacao);
  const cortes = Math.floor((Math.max(0, creditos) - gravacoes * porGravacao) / CREDITOS_POR_CORTE_APROVADO);
  const partes: string[] = [];
  if (gravacoes > 0) {
    partes.push(
      `${n(gravacoes)} ${gravacoes === 1 ? "gravação" : "gravações"} de ${MINUTOS_DA_GRAVACAO_DE_REFERENCIA} minutos com a semana inteira`
    );
  }
  if (cortes > 0) {
    partes.push(`${gravacoes > 0 ? "mais " : ""}${n(cortes)} ${cortes === 1 ? "corte vertical" : "cortes verticais"}${gravacoes > 0 ? "" : " a mais"}`);
  }
  const frase = partes.length ? partes.join(" e ") : "menos de um corte vertical";
  return { gravacoes, cortes, frase };
}

/**
 * A AJUDA DO TETO DE CRÉDITOS (06/10): o que o número limita, sem jargão. Diz
 * de onde o crédito sai (o saldo de produção da conta) e o que ele compra, com
 * dois exemplos que a pessoa reconhece.
 */
export function ajudaDoTetoDeCreditos(): string {
  return (
    `Créditos são o saldo de produção da conta. Uma gravação de ${MINUTOS_DA_GRAVACAO_DE_REFERENCIA} minutos com a semana sugerida ` +
    `(vídeo completo, ${CORTES_SUGERIDOS} cortes e as peças) usa cerca de ${n(creditosDaGravacao())}; cada corte vertical a mais usa ${n(CREDITOS_POR_CORTE_APROVADO)}. ` +
    `Vídeo por IA tem saldo próprio e não entra neste teto.`
  );
}
