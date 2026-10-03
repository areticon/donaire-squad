/**
 * A MARCA DE REVISÃO, do lado que a TELA pode ler.
 *
 * Gêmea pura de `lib/pipeline/revisao-do-card.ts`, que escreve e puxa o
 * Prisma. A separação é a mesma de `lib/credits/video-tabela.ts`: o
 * componente cliente precisa da leitura e não pode importar banco, e uma
 * CÓPIA da regra nos dois lados é como a tela e o servidor passam a discordar.
 * Aqui mora o formato e o prazo; lá, a escrita.
 */

/** Depois disto, a marca é lixo de uma função que morreu no meio. */
export const VALIDADE_MINUTOS = 12;

export interface RevisaoEmAndamento {
  /** O que o cliente pediu, em uma linha, para a tela mostrar o pedido. */
  pedido: string;
  /** Quem pediu: é o avatar que a tela põe ao lado do agente. */
  porNome: string | null;
  porImagem: string | null;
  /** O agente que está fazendo, que pode não ser o dono do card do chat. */
  agenteId: string;
  agenteNome: string;
  /** ISO. A tela conta o tempo, e o leitor descarta marca velha. */
  desde: string;
}

/**
 * A revisão em andamento deste card, ou `null`.
 *
 * O PRAZO É PARTE DA LEITURA, e não zelo: a rota do chat é síncrona e pode
 * ser morta no teto de tempo da plataforma, e nesse desfecho o `finally` não
 * roda. Sem prazo, o card ficaria "em revisão" para sempre, que é a mesma
 * família de defeito que a fila resolve com `ressuscitarMortos`.
 */
export function lerRevisao(metadata: unknown): RevisaoEmAndamento | null {
  const m = (metadata ?? {}) as Record<string, unknown>;
  const r = m.revisao as RevisaoEmAndamento | undefined;
  if (!r || typeof r.desde !== "string" || typeof r.agenteId !== "string") return null;
  const idade = Date.now() - new Date(r.desde).getTime();
  if (!Number.isFinite(idade) || idade > VALIDADE_MINUTOS * 60_000) return null;
  return r;
}

/** Há quanto tempo, em palavras curtas, para o selo caber na célula. */
export function tempoDaRevisao(desde: string, agora = Date.now()): string {
  const s = Math.max(0, Math.round((agora - new Date(desde).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}min`;
}
