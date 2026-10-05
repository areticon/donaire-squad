/**
 * O AVISO DE QUE A ARTE SAIU NO DESENHO EM CÓDIGO (05/10/2026).
 *
 * Regra do Bruno: o desenho em código é RESERVA, só quando a geração pelo
 * modelo de imagem falha, e o card precisa avisar. A composição (arte-com-frase)
 * não tem o card à mão, então registra aqui, pela manchete, o motivo do recuo;
 * quem grava o card (a semana do vídeo, a esteira) pergunta e escreve o aviso.
 * Memória do processo, como `registrarPecaComMaterial`: serve ao mesmo trabalho
 * que gerou a peça, e nada mais.
 *
 * Arquivo puro: sem banco, sem IA.
 */

const RECUOS = new Map<string, { motivo: string; em: number }>();

export function registrarRecuoParaCodigo(manchete: string, motivo: string): void {
  RECUOS.set(manchete.trim(), { motivo: motivo.slice(0, 200), em: Date.now() });
  if (RECUOS.size > 300) RECUOS.delete(RECUOS.keys().next().value as string);
}

/** O motivo do recuo desta manchete, ou null quando a arte saiu do modelo de imagem. */
export function recuoParaCodigo(manchete: string | null | undefined): string | null {
  if (!manchete) return null;
  return RECUOS.get(manchete.trim())?.motivo ?? null;
}

/** Limpa o registro de uma manchete (a peça foi refeita e saiu do modelo). */
export function limparRecuo(manchete: string): void {
  RECUOS.delete(manchete.trim());
}

/** O texto do aviso no card, a partir dos motivos das manchetes da peça. */
export function avisoDoRecuo(manchetes: string[]): string | null {
  const motivos = [...new Set(manchetes.map((m) => recuoParaCodigo(m)).filter((m): m is string => Boolean(m)))];
  if (!motivos.length) return null;
  return `AVISO: a arte saiu no desenho em código, porque o modelo de imagem não respondeu (${motivos.join("; ")}). Peça pelo chat deste card para gerar de novo.`;
}
