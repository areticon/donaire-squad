/**
 * O TEXTO QUE O MODELO COMPÔS, para a conferência da arte (03/10/2026).
 *
 * A conferência (lib/media/conferencia-da-arte.ts) reprova qualquer palavra
 * além do "texto permitido", e até aqui o permitido era só a manchete. Com um
 * modelo do book, a peça tem mais texto, todo composto em código (itens da
 * lista, os dois lados, o nome da marca no cabeçalho). Este registro guarda,
 * por manchete, o texto que o código desenhou, e lib/media/arte-por-rede.ts
 * soma isso ao permitido antes de conferir. Memória do processo: a composição
 * e a conferência acontecem na mesma função, uma logo depois da outra.
 */

const COMPOSTOS = new Map<string, { textos: string[]; em: number }>();

export function registrarTextoComposto(manchete: string, textos: string[]): void {
  COMPOSTOS.set(manchete.trim(), { textos: textos.filter(Boolean), em: Date.now() });
  if (COMPOSTOS.size > 200) {
    const velhos = [...COMPOSTOS.entries()].sort((a, b) => a[1].em - b[1].em).slice(0, 100);
    for (const [k] of velhos) COMPOSTOS.delete(k);
  }
}

/** O texto permitido, somado ao que os modelos compuseram para estas manchetes. */
export function textoPermitidoComModelo(esperado: string[] | undefined): string[] | undefined {
  if (!esperado) return esperado;
  const extra = esperado.flatMap((m) => COMPOSTOS.get(m.trim())?.textos ?? []);
  return extra.length ? [...esperado, ...extra] : esperado;
}
