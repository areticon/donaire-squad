import type { Trecho } from "@/lib/media/select-clips";
import type { Word } from "@/lib/media/transcribe";

/**
 * As bordas que vão ao worker. Por padrão o início desce e o fim sobe para o
 * segundo inteiro: o segundo que o agente de seleção devolve é aproximado, e
 * arredondar para fora nunca come fala do trecho.
 *
 * O arredondamento, porém, abre o corte com o rabo da palavra anterior: no
 * teste de 29/09 o corte 2 começava em 504,465 s, no início exato de
 * "Funcionário", e o pedido saía com 504, que pega o fim do "né?" dito antes.
 * Trecho com `emPausa` (bordas escolhidas pela refação do Vitor no meio de
 * uma pausa medida) vai com o segundo exato, porque arredondar ali só poderia
 * tirar a borda da pausa.
 */
export function bordasDoCorte(t: Pick<Trecho, "inicio" | "fim" | "emPausa">, palavras: Word[] = []): { inicio: number; fim: number } {
  if (t.emPausa) return { inicio: t.inicio, fim: t.fim };
  // AS BORDAS CAEM NO SILÊNCIO, e não no segundo inteiro (30/09).
  //
  // O arredondamento para fora ("nunca come fala do trecho") pegava fala de
  // FORA: o fim subia até o segundo seguinte e levava o começo da próxima
  // frase. No teste de 30/09 o corte do dia 28 terminava em "...contexto pra
  // ele, Você já deve ter", o de Moisés em "Então a forma" e outro em "E", e o
  // início abria com "é que," da frase anterior. O Bruno viu como "corta do
  // nada no meio da frase". Agora a borda é o meio da pausa entre a última
  // palavra do trecho e a primeira de fora (com teto de 0,35 s de respiro), e
  // o mesmo no começo.
  const dentro = palavras.filter((w) => w.start >= t.inicio - 0.08 && w.end <= t.fim + 0.08);
  if (!dentro.length) return { inicio: Math.floor(t.inicio), fim: Math.ceil(t.fim) };
  const primeira = dentro[0];
  const ultima = dentro[dentro.length - 1];
  const antes = palavras.filter((w) => w.end <= primeira.start + 0.001).at(-1);
  const depois = palavras.find((w) => w.start >= ultima.end - 0.001 && w !== ultima);
  const inicio = antes
    ? Math.max(antes.end + (primeira.start - antes.end) / 2, primeira.start - 0.3)
    : Math.max(0, primeira.start - 0.3);
  const fim = depois
    ? Math.min(ultima.end + (depois.start - ultima.end) / 2, ultima.end + 0.35)
    : ultima.end + 0.35;
  return { inicio: Math.round(inicio * 100) / 100, fim: Math.round(fim * 100) / 100 };
}
