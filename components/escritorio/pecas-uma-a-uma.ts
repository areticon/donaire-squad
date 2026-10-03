"use client";

import { useEffect, useState } from "react";

/**
 * As peças novas chegam UMA A UMA (item 12, 29/09).
 *
 * A esteira do vídeo grava os posts da semana em lote, e a tela recarrega os
 * cards de uma vez: cinco peças aparecem juntas, e o que era trabalho de um
 * squad passando o bastão parece mágica de banco de dados. Aqui a lista que a
 * tela mostra segura as peças NOVAS numa fila e solta uma por vez.
 *
 * O que já estava na tela quando ela abriu aparece inteiro, na hora: a fila é
 * só para o que chega com a pessoa olhando. Peça que some sai na hora também.
 *
 * Genérico de propósito (recebe como tirar o id), para o calendário poder usar
 * o mesmo gancho sobre os cards da semana.
 */
export function useUmaAUma<T>(itens: T[], idDe: (item: T) => string, intervaloMs = 1200): T[] {
  // Os ids já liberados. Nasce com tudo o que existe no primeiro render.
  const [liberados, setLiberados] = useState<Set<string>>(() => new Set(itens.map(idDe)));
  // O próximo da fila, como texto: o array novo a cada render não reinicia o relógio.
  const proximo = itens.map(idDe).find((id) => !liberados.has(id)) ?? null;

  useEffect(() => {
    if (!proximo) return;
    const t = setTimeout(() => setLiberados((antes) => new Set(antes).add(proximo)), intervaloMs);
    return () => clearTimeout(t);
  }, [proximo, intervaloMs]);

  // Sem memo de propósito: a peça que já estava pode mudar de status, e a
  // lista devolvida precisa ser a de agora.
  return itens.filter((i) => liberados.has(idDe(i)));
}
