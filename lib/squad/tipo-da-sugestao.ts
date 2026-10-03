/**
 * O formato de uma sugestão do squad, sem banco: a tela do escritório (cliente)
 * importa daqui, e nunca de sugestoes-do-squad.ts, que toca o Prisma.
 */
export type Sugestao = {
  id: string;
  /** Quem traz a sugestão até você no escritório. */
  agenteId: string;
  /** A frase que o agente diz ao chegar na sua sala. */
  fala: string;
  /** O que ele quer escrever no documento, ou null quando a ação é outra. */
  regra: string | null;
  /** Por que, em uma frase, com o dado que motivou. */
  porque: string;
  /** Para onde ir quando a sugestão não é uma regra (ex.: completar o setup). */
  link?: string;
};
