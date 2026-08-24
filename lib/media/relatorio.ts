import type { Word } from "@/lib/media/transcribe";
import type { Remocao } from "@/lib/media/edicao";

/**
 * O relatório do que a Demandou fez com a gravação.
 *
 * Pedido do Bruno em 24/08, e a razão dele é comercial, não técnica: "trazer o
 * relatório para o usuário mostra valor". O cliente sobe um arquivo e recebe
 * cortes prontos, e no meio disso a plataforma removeu centenas de trechos que
 * ele nunca vai ver. Sem contar isso, o trabalho fica invisível, e trabalho
 * invisível parece caro.
 *
 * ## A conta do tempo economizado, e por que ela é conservadora
 *
 * O número que impressiona é o tempo de edição poupado, e é justamente o mais
 * fácil de inflar. Aqui ele sai de uma base defensável: **editor humano leva de
 * 3 a 5 minutos de trabalho para cada minuto de vídeo bruto** em edição de fala
 * com corte de pausa e muleta, e esse é o piso da faixa que estúdios de edição
 * praticam.
 *
 * Usamos 3, o menor. Se o cliente for conferir, o número não decepciona, e é
 * melhor prometer o piso e entregar acima do que o contrário.
 */

export type RelatorioDoVideo = {
  /** Duração da gravação crua, em segundos. */
  duracaoOriginal: number;
  /** Duração depois da edição. */
  duracaoFinal: number;
  /** Quantos trechos foram removidos ao todo. */
  remocoes: number;
  /** Quantos segundos saíram. */
  segundosRemovidos: number;
  /** Quantas eram pausa e silêncio. */
  pausas: number;
  segundosDePausa: number;
  /** As muletas mais frequentes, já contadas. */
  muletas: Array<{ palavra: string; vezes: number }>;
  /** Total de muletas removidas. */
  totalMuletas: number;
  /** Quantos cortes prontos saíram. */
  cortes: number;
  /** Minutos de edição humana que isso representaria. */
  minutosEconomizados: number;
};

/**
 * Minutos de trabalho humano por minuto de vídeo bruto.
 *
 * 3 é o piso da faixa de 3 a 5 praticada em edição de fala. Escolhido de
 * propósito: número inflado numa tela que o cliente lê vira desconfiança quando
 * ele compara com o próprio tempo.
 */
const MINUTOS_DE_EDICAO_POR_MINUTO = 3;

/** As muletas que a gente conta e mostra. Só as que o público reconhece. */
const MULETAS = new Set([
  "é", "eh", "ééé", "éé", "ah", "ahn", "hum", "hmm", "né", "ne", "tipo",
  "então", "entao", "aí", "ai", "assim", "bom", "cara", "sabe", "olha",
  "pô", "po", "enfim", "beleza", "certo", "tá", "ta", "daí", "dai",
]);

function semPontuacao(palavra: string): string {
  return palavra.toLowerCase().replace(/[.,!?;:"'()…]/g, "").trim();
}

export function montarRelatorio(
  palavras: Word[],
  pausas: Remocao[],
  todasAsRemocoes: Remocao[],
  duracaoOriginal: number,
  cortes: number
): RelatorioDoVideo {
  const segundosRemovidos = todasAsRemocoes.reduce((s, r) => s + (r.ate - r.de), 0);
  const segundosDePausa = pausas.reduce((s, r) => s + (r.ate - r.de), 0);

  // Conta as muletas que caíram DENTRO de alguma remoção, e não todas as que
  // existem na gravação: o relatório precisa dizer o que a plataforma FEZ, não
  // o que ela viu. Prometer remoção que não aconteceu é o jeito mais rápido de
  // o cliente parar de acreditar no resto do número.
  const contagem = new Map<string, number>();
  for (const p of palavras) {
    const w = semPontuacao(p.word);
    if (!MULETAS.has(w)) continue;
    const removida = todasAsRemocoes.some((r) => p.start >= r.de - 0.05 && p.end <= r.ate + 0.05);
    if (!removida) continue;
    contagem.set(w, (contagem.get(w) ?? 0) + 1);
  }

  const muletas = [...contagem.entries()]
    .map(([palavra, vezes]) => ({ palavra, vezes }))
    .sort((a, b) => b.vezes - a.vezes)
    .slice(0, 6);

  return {
    duracaoOriginal: Math.round(duracaoOriginal),
    duracaoFinal: Math.round(duracaoOriginal - segundosRemovidos),
    remocoes: todasAsRemocoes.length,
    segundosRemovidos: Math.round(segundosRemovidos),
    pausas: pausas.length,
    segundosDePausa: Math.round(segundosDePausa),
    muletas,
    totalMuletas: [...contagem.values()].reduce((a, b) => a + b, 0),
    cortes,
    minutosEconomizados: Math.round(
      (duracaoOriginal / 60) * MINUTOS_DE_EDICAO_POR_MINUTO
    ),
  };
}

/**
 * O relatório em português, do jeito que o cliente lê.
 *
 * Texto e não só números porque o número sozinho não conta história: "147
 * remoções" não diz nada, "tiramos 147 trechos, entre pausa e vício de
 * linguagem" diz.
 */
export function relatorioEmTexto(r: RelatorioDoVideo): string[] {
  const linhas: string[] = [];

  const min = (s: number) => `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, "0")}s`;
  linhas.push(
    `Sua gravação tinha ${min(r.duracaoOriginal)} e o vídeo editado ficou com ${min(r.duracaoFinal)}.`
  );

  linhas.push(
    `Removemos ${r.remocoes} trechos, somando ${r.segundosRemovidos} segundos: ` +
      `${r.pausas} eram pausa e silêncio (${r.segundosDePausa}s) e o resto era hesitação e recomeço de frase.`
  );

  if (r.muletas.length) {
    const lista = r.muletas
      .map((m) => `${m.vezes} "${m.palavra}"`)
      .join(", ");
    linhas.push(`Entre os vícios de linguagem cortados: ${lista}.`);
  }

  if (r.cortes) {
    linhas.push(
      `Do material aproveitável saíram ${r.cortes} ${r.cortes === 1 ? "corte pronto" : "cortes prontos"} para publicar.`
    );
  }

  const horas = Math.floor(r.minutosEconomizados / 60);
  const resto = r.minutosEconomizados % 60;
  const tempo =
    horas > 0
      ? `${horas}h${resto ? ` ${resto}min` : ""}`
      : `${r.minutosEconomizados} minutos`;
  linhas.push(
    `Um editor faria esse mesmo trabalho em cerca de ${tempo}, contando decupagem, corte de pausa e exportação.`
  );

  return linhas;
}
