/**
 * ZERO CORTES APROVADO É ZERO CORTES (06/10/2026, vídeo cmux0hoxk do Bruno).
 *
 * O cliente que aprova "só o vídeo completo" tomou uma decisão, e a decisão
 * fica gravada no roteiro de forma explícita: `soCompleto: true` e
 * `cortesAprovados: []`. Antes ela era deduzida de `clips` vazio, e lista
 * vazia é ambígua ("ninguém escolheu ainda" ou "escolheu nenhum"): qualquer
 * passo que a lesse como "ainda não escolhido" podia escolher sozinho.
 *
 * Regras puras, sem banco, para todo passo que escolhe, corta ou põe corte
 * no quadro perguntar a mesma coisa.
 */

export type DecisaoDosCortes = {
  aprovadoEm?: string | null;
  soCompleto?: boolean | null;
  cortesAprovados?: number[] | null;
};

/** O roteiro foi aprovado com zero cortes? Só vale depois da aprovação. */
export function soCompletoAprovado(r: DecisaoDosCortes | null | undefined): boolean {
  if (!r?.aprovadoEm) return false;
  if (r.soCompleto === true) return true;
  return Array.isArray(r.cortesAprovados) && r.cortesAprovados.length === 0;
}

/**
 * A lista que a aprovação grava. Com `soCompleto` o pedido manda: a lista é
 * vazia mesmo que venham índices junto (o botão "Aprovar só o vídeo
 * completo" não pode virar um corte por estado velho da tela).
 */
export function listaDaAprovacao(escolhidos: unknown, soCompleto: boolean, total: number): number[] {
  if (soCompleto) return [];
  const brutos = Array.isArray(escolhidos) ? escolhidos : [];
  return [...new Set(brutos)]
    .filter((i): i is number => typeof i === "number" && Number.isInteger(i) && i >= 0 && i < total)
    .sort((a, b) => a - b);
}

/** Os trechos que vão ao worker: nenhum quando a decisão foi só o completo. */
export function trechosParaCortar<T>(trechos: T[] | null | undefined, r: DecisaoDosCortes | null | undefined): T[] {
  if (soCompletoAprovado(r)) return [];
  return trechos ?? [];
}

/** Pode este vídeo ter card de corte no quadro? */
export function podeTerCardDeCorte(r: DecisaoDosCortes | null | undefined): boolean {
  return !soCompletoAprovado(r);
}
