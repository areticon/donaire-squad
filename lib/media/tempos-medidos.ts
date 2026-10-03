/**
 * QUANTO CADA ETAPA LEVA, MEDIDO, E A PROMESSA QUE SAI DISSO (02/10/2026).
 *
 * A regra do Bruno, depois de ver a linha terminar e a tarja roxa aparecer:
 * "é melhor prometer mais tempo e entregar em menos". A promessa de antes era
 * um ALVO (1,5 min por minuto de vídeo, fixado em 30/09) e não cobria a
 * montagem com efeitos nem a revisão final. Aqui a promessa é o LIMITE DE
 * CIMA do que já aconteceu de verdade, etapa por etapa.
 *
 * ## De onde vêm os números
 *
 * `scripts/tmp/tempos-medidos-0210.mts` e `tempos-gemeo-0210.mts`, sobre os
 * `video_jobs` e os vídeos do gêmeo dos últimos 25 dias (SELECT puro, contas
 * em UTC no SQL). Amostras limpas: rodada que começou junto com a aprovação
 * (refação por script fica de fora) e sem a do roteiro refeito à mão
 * (cmuqc9r7z, 19 min de roteiro por um "Voltar à edição").
 *
 *   etapa (minutos)                 0,8 min de vídeo   4,7 min       22 min
 *   roteiro (envio até pronto)      3,1 a 3,9          5,8 a 8,2     15,6
 *   cortes, capas, textos e fala    1,8 a 2,2          8,0 a 9,2     28,0
 *   efeitos depois disso (render)   2,3 a 8,4          12,6          9,5
 *   render do worker (s)            69 a 83            159 a 212     295
 *   gêmeo (pedido até a esteira)    7,4 a 12,4 (50 s de fala, 3 a 4 pedaços)
 *
 * Poucas amostras ainda (3 a 7 por etapa). Por isso a promessa é o MAIOR valor
 * medido em cada faixa de duração (o p90 com essa amostra), mais 15% de folga,
 * ligado em linha reta entre as faixas: nunca a mediana. Com mais vídeos,
 * rode os scripts de novo e troque os pontos abaixo.
 *
 * A revisão final entrou hoje e ainda não tem amostra completa: o número dela
 * é a conta do que ela faz (quadros a cada 3 s lidos por um modelo, mais UMA
 * rodada de conserto com um render inteiro do worker), também pelo alto.
 *
 * Módulo puro: a faixa (componente de cliente) e as rotas leem daqui.
 */

/** Pontos (minutos de vídeo -> minutos da etapa), já com a folga. */
type Curva = ReadonlyArray<readonly [number, number]>;

const FOLGA = 1.15;
const com = (pontos: Array<[number, number]>): Curva => pontos.map(([m, t]) => [m, +(t * FOLGA).toFixed(2)] as const);

export const CURVAS = {
  /**
   * Do envio ao roteiro pronto: ouvir, pesquisar, escolher e planejar.
   * Medido com o diretor antigo: 3,1 a 3,9 min (0,8 min de vídeo), 5,8 a 8,2
   * (4,7 min), 15,6 (22 min). Desde a noite de 02/10 o plano sai do diretor
   * limpo (lib/media/diretor-limpo.ts), em segundos e bloco a bloco: a parte
   * do diretor (perto de 1/4 do roteiro nas medidas) sai da conta. Ainda sem
   * amostra do diretor novo, então o corte é conservador; medir de novo com
   * `scripts/tmp/tempos-medidos-0210.mts` depois dos primeiros vídeos.
   */
  roteiro: com([[0, 2.6], [0.8, 3.0], [4.7, 6.2], [22, 12]]),
  /** Da aprovação aos cortes, capas, textos e à edição da fala do vídeo inteiro. */
  base: com([[0, 2], [0.8, 2.2], [4.7, 9.2], [22, 28]]),
  /** Os efeitos: plano do diretor, imagens e cenas (antes do render). */
  efeitos: com([[0, 6], [0.8, 7], [4.7, 10.5], [22, 14]]),
  /** O render com a abertura, a legenda e o som (o worker): 83 s a 295 s medidos. */
  montagem: com([[0, 1.3], [0.8, 1.4], [4.7, 3.6], [22, 5]]),
  /** A revisão final quadro a quadro, com uma rodada de conserto (render de novo). */
  revisao: com([[0, 3], [0.8, 3.2], [4.7, 5.5], [22, 9]]),
  /** O gêmeo: voz, pedaços em paralelo e a junção (até 90 s de fala). */
  gemeoVoz: com([[0, 0.5]]),
  gemeoPedacos: com([[0, 10.8]]),
  gemeoJuntar: com([[0, 1.5]]),
} as const;

export type EtapaMedida = keyof typeof CURVAS;

function naCurva(curva: Curva, minutos: number): number {
  if (curva.length === 1) return curva[0][1];
  if (minutos <= curva[0][0]) return curva[0][1];
  for (let i = 1; i < curva.length; i++) {
    const [m1, t1] = curva[i];
    const [m0, t0] = curva[i - 1];
    if (minutos <= m1) return t0 + ((minutos - m0) / (m1 - m0)) * (t1 - t0);
  }
  // Acima do maior vídeo medido: a última inclinação, nunca menos que o último ponto.
  const [ma, ta] = curva[curva.length - 2];
  const [mb, tb] = curva[curva.length - 1];
  return Math.max(tb, tb + ((minutos - mb) / (mb - ma)) * (tb - ta));
}

/** Quantos SEGUNDOS a etapa leva para um vídeo desta duração, pelo alto. */
export function segundosDaEtapa(etapa: EtapaMedida, duracaoSec: number | null | undefined): number {
  // Sem a duração (antes de ouvir a gravação), vale a de 10 minutos: o número
  // aparece pelo alto e cai quando a transcrição diz a duração de verdade.
  const minutos = (duracaoSec ?? 600) / 60;
  return Math.round(naCurva(CURVAS[etapa], minutos) * 60);
}

/** A edição inteira depois da aprovação: base, efeitos, montagem e revisão. */
export function segundosDaEdicao(duracaoSec: number | null | undefined, opcoes: { efeitos: boolean; revisao: boolean }): number {
  let s = segundosDaEtapa("base", duracaoSec);
  if (opcoes.efeitos) s += segundosDaEtapa("efeitos", duracaoSec) + segundosDaEtapa("montagem", duracaoSec);
  if (opcoes.efeitos && opcoes.revisao) s += segundosDaEtapa("revisao", duracaoSec);
  return s;
}

/** Para a tabela do relatório: a promessa de cada etapa para uma duração. */
export function tabelaDaPromessa(minutosDeVideo: number): Record<EtapaMedida | "edicao" | "tudo", number> {
  const d = minutosDeVideo * 60;
  const r = Object.fromEntries((Object.keys(CURVAS) as EtapaMedida[]).map((k) => [k, +(segundosDaEtapa(k, d) / 60).toFixed(1)])) as Record<EtapaMedida, number>;
  const edicao = +(segundosDaEdicao(d, { efeitos: true, revisao: true }) / 60).toFixed(1);
  return { ...r, edicao, tudo: +(r.roteiro + edicao).toFixed(1) };
}
