/**
 * A TABELA DE CRÉDITO DO VÍDEO POR IA, sem banco.
 *
 * Existe separada de `lib/credits/video.ts` por um motivo só: a janela da
 * campanha precisa mostrar o preço ANTES de a pessoa pedir, e aquele módulo
 * importa o Prisma, que não entra em componente cliente. Até 21/09 a janela
 * tinha uma CÓPIA da conta (`(base / 8) * segundos`), e cópia é a forma mais
 * rápida de a promessa e a cobrança discordarem. Agora os dois lados chamam a
 * mesma função.
 *
 * O CRÉDITO É POR GERAÇÃO, NÃO POR SEGUNDO. Decidido em 21/09, medido na
 * sonda da extensão (scripts/tmp/sondar-extensao-veo-2109.mts): nenhum
 * gerador entrega 60 s numa chamada. O Veo 3.1 gera 8 s e depois ESTENDE em
 * passos de 7 s, cada passo uma geração paga por inteiro. A conta
 * proporcional antiga (195/8 por segundo) dizia que 60 s custavam 1.463
 * créditos; a cadeia real são 9 gerações, 1.755. A diferença era prejuízo
 * silencioso, do mesmo tipo que tirou o Veo do produto em agosto.
 *
 * Os preços de referência continuam os de 18/09: 8 s com narração custam
 * R$ 6,48 no rápido (195 créditos) e R$ 17,28 no cheio (520), calibrados em
 * 3x o custo variável. Uma extensão de 7 s custa perto de R$ 5,70 no rápido,
 * um pouco menos que a geração inicial de 8 s; cobrar os mesmos 195 por passo
 * é o que mantém a régua de 3x com folga para a refação, que aqui não é
 * cobrada do cliente.
 */

export type QualidadeDoVideo = "rapido" | "cheio";

export const CREDITOS_DE_VIDEO = {
  /** Uma geração (8 s iniciais ou uma extensão de 7 s), Veo 3.1 rápido. */
  rapido_8s: 195,
  /** Uma geração, Veo 3.1 na qualidade cheia. */
  cheio_8s: 520,
} as const;

/** As durações que a janela oferece. */
export const DURACOES_DE_VIDEO = [8, 15, 30, 60] as const;
export type DuracaoDeVideo = (typeof DURACOES_DE_VIDEO)[number];

/** O Veo 3.1 gera 8 s de primeira e acrescenta 7 s por extensão. */
export const SEGUNDOS_DA_PRIMEIRA_GERACAO = 8;
export const SEGUNDOS_POR_EXTENSAO = 7;

/**
 * Quantas gerações um vídeo de N segundos pede.
 *
 * Tolera UM segundo a menos: 30 s pedidos saem com 29 (8 + 3 x 7) em quatro
 * gerações, e não com 36 em cinco. Um segundo ninguém vê; uma geração a mais
 * são 195 créditos. Já 60 s precisam de 8 extensões (64 s), porque 7 dariam
 * 57, três segundos abaixo do que a pessoa escolheu.
 *
 *   8 s  -> 1 geração     15 s -> 2     30 s -> 4     60 s -> 9
 */
export function geracoesDoVideo(segundos: number): number {
  if (segundos <= SEGUNDOS_DA_PRIMEIRA_GERACAO) return 1;
  return 1 + Math.ceil((segundos - SEGUNDOS_DA_PRIMEIRA_GERACAO - 1) / SEGUNDOS_POR_EXTENSAO);
}

/** Quantos segundos o vídeo de fato terá, dado o que foi pedido. */
export function segundosEntregues(segundos: number): number {
  if (segundos <= SEGUNDOS_DA_PRIMEIRA_GERACAO) return segundos;
  return SEGUNDOS_DA_PRIMEIRA_GERACAO + (geracoesDoVideo(segundos) - 1) * SEGUNDOS_POR_EXTENSAO;
}

/** Quanto custa um vídeo, em créditos de vídeo: gerações vezes o preço da geração. */
export function custoDoVideo(segundos: number, qualidade: QualidadeDoVideo): number {
  const base = qualidade === "cheio" ? CREDITOS_DE_VIDEO.cheio_8s : CREDITOS_DE_VIDEO.rapido_8s;
  return geracoesDoVideo(segundos) * base;
}

/** O preço de UMA geração, para o estorno do que não saiu. */
export function creditosPorGeracao(qualidade: QualidadeDoVideo): number {
  return qualidade === "cheio" ? CREDITOS_DE_VIDEO.cheio_8s : CREDITOS_DE_VIDEO.rapido_8s;
}

/**
 * A duração que vale, dado o que chegou no pedido.
 *
 * Campanha antiga guardou 4, 6 ou 8 (as durações do Veo 3.1 numa chamada só);
 * as duas menores continuam sendo uma geração e saem como estão. Qualquer
 * outra coisa vira 8, que é o padrão da esteira desde 19/09.
 */
export function normalizarDuracao(valor: unknown): number {
  const n = Number(valor);
  if (n === 4 || n === 6) return n;
  return (DURACOES_DE_VIDEO as readonly number[]).includes(n) ? n : 8;
}
