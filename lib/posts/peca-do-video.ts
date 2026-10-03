/**
 * UM CARD POR PEÇA (03/10, pedido do Bruno: "você edita o mesmo post 10 vezes").
 *
 * O corte de vídeo nasce como UM post por rede (YouTube Shorts, Reels, TikTok,
 * LinkedIn), cada um com o seu card do Vitor. O quadro agrupava pela id do
 * card, e o mesmo corte aparecia quatro vezes no mesmo dia; ao abrir, o card
 * listava todos os posts do dia da campanha, o completo junto. Para quem olha,
 * é a mesma peça repetida, e cada cópia dizendo que sai em todas as redes.
 *
 * A peça de vídeo é o que o post aponta no metadata:
 *   - o completo: `completo:<videoJobId>` (gravacaoCompleta);
 *   - o corte:    `corte:<videoJobId>:<trechoIndice>`.
 * Post sem esse vínculo é peça de texto do dia (`texto`).
 *
 * Puro de propósito: o quadro e o card usam a mesma regra, sem banco.
 */
export function chaveDaPecaDoVideo(metadata: unknown): string | null {
  const m = metadata as { videoJobId?: unknown; trechoIndice?: unknown; gravacaoCompleta?: unknown } | null | undefined;
  if (!m || typeof m.videoJobId !== "string") return null;
  if (m.gravacaoCompleta === true) return `completo:${m.videoJobId}`;
  if (typeof m.trechoIndice === "number") return `corte:${m.videoJobId}:${m.trechoIndice}`;
  return null;
}

/** A peça de qualquer post: a do vídeo, ou "texto" para o conteúdo do dia. */
export function pecaDoPost(p: { metadata?: unknown; mediaType?: string | null }): string {
  return chaveDaPecaDoVideo(p.metadata) ?? "texto";
}

/**
 * Os posts da MESMA peça que `postId`, entre os do dia. Sem o post de
 * referência na lista, devolve a lista inteira (melhor mostrar o dia do que
 * esconder tudo).
 */
export function postsDaMesmaPeca<P extends { id: string; metadata?: unknown; mediaType?: string | null }>(lista: P[], postId: string | null | undefined): P[] {
  if (!postId) return lista;
  const ref = lista.find((p) => p.id === postId);
  if (!ref) return lista;
  const chave = pecaDoPost(ref);
  return lista.filter((p) => pecaDoPost(p) === chave);
}
