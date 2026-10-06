import type { MaterialDaMarca } from "@/lib/materiais/escolha";

/**
 * AS FOTOS DO CLIENTE NAS LÂMINAS DO CARROSSEL, intercaladas (05/10/2026).
 *
 * O caso do Bruno: o carrossel de segunda de Fé & Gestão saiu com as cinco
 * lâminas geradas a partir da MESMA foto dele (a única "pessoa" da biblioteca
 * na hora). Ele subiu mais três e pediu "intercale as fotos no carrossel".
 * A escolha da referência da pessoa (lib/media/referencia-da-pessoa.ts) era
 * por frase, sem olhar as lâminas vizinhas, e o JEV, com o mesmo contexto,
 * devolvia a mesma foto para todas.
 *
 * A regra, aqui, pura e provada com mocks:
 *
 *   - cada lâmina leva uma foto DIFERENTE da vizinha: a candidata nunca é a
 *     foto da lâmina anterior;
 *   - entre as candidatas, primeiro as menos usadas NESTE carrossel (para a
 *     biblioteca inteira passear), depois as menos usadas na conta; com mais
 *     de uma empatada, quem decide é o JEV (escolha, não escrita), pela frase
 *     da lâmina; sem JEV, a primeira da ordem;
 *   - com UMA foto só e o pedido de intercalar, a foto alterna com lâmina só
 *     de texto (foto, texto, foto, texto...), em vez de repetir em todas;
 *   - sem foto, nenhuma lâmina leva foto.
 *
 * Arquivo PURO: sem banco e sem rede. Quem carrega a foto escolhida como
 * referência do gerador é lib/media/referencia-da-pessoa.ts.
 */

export type FotoDaLamina = MaterialDaMarca | null;

/** O cliente pediu para intercalar, alternar ou variar as fotos? */
export function pedidoDeIntercalar(texto: string): boolean {
  return /\b(intercal\w*|altern\w*|revez\w*|vari\w+\s+(as\s+)?fotos|fotos?\s+diferentes?|outras?\s+fotos?|troc\w+\s+(as\s+)?fotos|cada\s+l[aâ]mina\s+(com\s+)?uma\s+foto|uma\s+foto\s+(diferente\s+)?(por|em\s+cada)\s+l[aâ]mina)\b/i.test(texto);
}

/** As fotos na ordem de preferência: marcadas na campanha primeiro, depois as menos usadas (e usadas há mais tempo). */
export function ordemDasFotos(fotos: MaterialDaMarca[]): MaterialDaMarca[] {
  return [...fotos].sort((a, b) => Number(b.daCampanha) - Number(a.daCampanha) || a.usos - b.usos || a.ultimoUsoEm - b.ultimoUsoEm);
}

/**
 * O plano sem JEV: a foto de cada lâmina pela rotação das menos usadas. Com
 * duas ou mais fotos a rotação já garante vizinhas diferentes; com uma só,
 * `intercalar` alterna a foto com lâmina só de texto.
 */
export function distribuirFotos(laminas: number, fotos: MaterialDaMarca[], opcoes: { intercalar: boolean }): FotoDaLamina[] {
  const ordem = ordemDasFotos(fotos);
  if (!ordem.length) return Array.from({ length: laminas }, () => null);
  if (ordem.length === 1) return Array.from({ length: laminas }, (_, i) => (opcoes.intercalar && i % 2 === 1 ? null : ordem[0]));
  return Array.from({ length: laminas }, (_, i) => ordem[i % ordem.length]);
}

/**
 * O plano com escolha por lâmina. `escolher` recebe a frase da lâmina e as
 * candidatas empatadas (nunca a foto da lâmina anterior) e devolve uma delas;
 * null ou fora da lista cai na primeira da ordem. Sem `escolher`, o plano é a
 * rotação de `distribuirFotos`.
 */
export async function escolherFotosDasLaminas(o: {
  frases: string[];
  fotos: MaterialDaMarca[];
  intercalar: boolean;
  escolher?: (frase: string, candidatas: MaterialDaMarca[]) => Promise<MaterialDaMarca | null>;
}): Promise<FotoDaLamina[]> {
  const ordem = ordemDasFotos(o.fotos);
  if (ordem.length < 2 || !o.escolher) return distribuirFotos(o.frases.length, o.fotos, { intercalar: o.intercalar });
  const vezes = new Map<string, number>(ordem.map((f) => [f.id, 0]));
  const plano: FotoDaLamina[] = [];
  let anterior: MaterialDaMarca | null = null;
  for (const frase of o.frases) {
    const candidatas = ordem.filter((f) => f.id !== anterior?.id);
    const menor = Math.min(...candidatas.map((f) => vezes.get(f.id) ?? 0));
    const empatadas = candidatas.filter((f) => (vezes.get(f.id) ?? 0) === menor);
    let escolhida = empatadas[0];
    if (empatadas.length > 1) {
      const r = await o.escolher(frase, empatadas).catch(() => null);
      if (r && empatadas.some((f) => f.id === r.id)) escolhida = r;
    }
    vezes.set(escolhida.id, (vezes.get(escolhida.id) ?? 0) + 1);
    plano.push(escolhida);
    anterior = escolhida;
  }
  return plano;
}

/** Alguma lâmina repete a foto da vizinha? (A prova usa; o plano nunca deve.) */
export function temFotoRepetidaEmVizinhas(plano: FotoDaLamina[]): boolean {
  return plano.some((f, i) => i > 0 && f && plano[i - 1] && f.id === plano[i - 1]!.id);
}

/** Como se conta ao cliente o que as lâminas levaram. Vazio quando nenhuma levou foto. */
export function descreverIntercalacao(plano: FotoDaLamina[]): string {
  const comFoto = plano.filter((f): f is MaterialDaMarca => Boolean(f));
  if (!comFoto.length) return "";
  const distintas = new Set(comFoto.map((f) => f.id)).size;
  const soTexto = plano.length - comFoto.length;
  if (distintas === 1 && soTexto > 0) return `a sua foto alternada com ${soTexto === 1 ? "uma lâmina só de texto" : `${soTexto} lâminas só de texto`}`;
  if (distintas === 1) return "a sua foto em todas as lâminas";
  return `${distintas} fotos suas intercaladas, nenhuma repetida em lâminas vizinhas${soTexto ? ` e ${soTexto === 1 ? "uma lâmina só de texto" : `${soTexto} lâminas só de texto`}` : ""}`;
}
