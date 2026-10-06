import { randomBytes } from "node:crypto";

/**
 * CADA EDIÇÃO É ALGO NOVO (06/10/2026, regra do Bruno, prioridade máxima).
 *
 * Nenhum elemento, imagem, vídeo ou foto gerado para uma edição pode ser
 * reaproveitado de outro vídeo nem de outra edição do mesmo vídeo. Antes, a
 * mídia gerada era gravada no Blob por um nome feito do hash do prompt
 * (`insercao-<sha1>.png`, addRandomSuffix false, allowOverwrite true): prompt
 * igual caía no MESMO endereço, por cima, e o CDN do Blob podia servir a
 * imagem antiga ao worker; e vários caminhos LIAM esse endereço antes de
 * gerar ("o mesmo pedido nunca é pago duas vezes"), devolvendo a mídia de
 * outro vídeo.
 *
 * Daqui em diante, toda mídia gerada para a edição:
 *   - é gravada num nome ÚNICO por geração (`nomeUnico`): o vídeo, o momento,
 *     o instante e bytes aleatórios, com `GRAVACAO_UNICA` (sufixo aleatório do
 *     Blob ligado, nunca sobrescreve);
 *   - nunca é procurada antes de gerar: o checkpoint de pedido pago e NÃO
 *     entregue (lib/media/imagem-higgsfield.ts) continua, porque ele só
 *     recupera o que foi pago e nunca chegou a ninguém (não é reaproveitamento);
 *   - a chave de um pedido de vídeo leva `marcaDaGeracao()`, para que o mesmo
 *     prompt em outra edição peça um vídeo novo.
 *
 * Módulo puro.
 */

/** As opções do `put` do Blob para mídia gerada: nome com sufixo aleatório, nunca por cima de outra. */
export const GRAVACAO_UNICA = { addRandomSuffix: true } as const;

const limpo = (s: string | null | undefined, n: number) =>
  String(s ?? "")
    .replace(/[^a-zA-Z0-9-]/g, "")
    .slice(0, n);

/** Uma marca curta e nova a cada chamada: o instante em base 36 e 4 bytes aleatórios. */
export function marcaDaGeracao(): string {
  return `${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
}

/**
 * O nome único de uma mídia gerada: `<pasta>/<video>-<momento>-<marca>.<ext>`.
 * Dois pedidos com o mesmo prompt, no mesmo vídeo ou em vídeos diferentes,
 * nunca dão o mesmo nome.
 */
export function nomeUnico(pasta: string, o: { video?: string | null; momento?: string | null; ext: string }): string {
  const video = limpo(o.video, 40) || "sem-video";
  const momento = limpo(o.momento, 40) || "m";
  return `${pasta.replace(/\/+$/, "")}/${video}-${momento}-${marcaDaGeracao()}.${limpo(o.ext, 5) || "bin"}`;
}

/** A chave de um pedido de geração (vídeo da Higgsfield): a base legível e a marca nova desta edição. */
export function chaveDaGeracao(base: string): string {
  return `${limpo(base, 60)}-${marcaDaGeracao()}`;
}
