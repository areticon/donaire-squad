/**
 * QUAL FOTO ENTROU EM CADA ARTE (08/10/2026).
 *
 * Regra do Bruno: "só use foto em post se for foto enviada pelo usuário". As
 * artes que nasciam do vídeo usavam o melhor quadro da gravação como foto da
 * pessoa (o print, recortado e colado pelo gerador), e nada registrava isso:
 * não dava para provar, pelo banco, de onde veio a foto de um post.
 *
 * Agora cada arte diz de onde veio a foto:
 *   - "material": uma foto da Biblioteca de materiais (materiais_do_cliente),
 *     com o id; é a ÚNICA foto real que entra num post;
 *   - "gerada": a cena saiu do modelo de imagem, sem foto do cliente e sem
 *     pessoa de referência;
 *   - "nenhuma": a peça é só tipografia (ou a imagem não veio).
 * Quadro ou recorte do vídeo não é fonte possível: não existe valor para ele.
 *
 * A composição (arte-com-frase) não tem o post à mão, então registra aqui,
 * pela manchete, como o aviso do recuo (lib/media/aviso-da-arte.ts); quem grava
 * o post pergunta e escreve em `metadata.fotoDaPeca` (imagem) ou
 * `metadata.fotosDasLaminas` (carrossel). Memória do processo: serve ao mesmo
 * trabalho que gerou a peça, e nada mais.
 *
 * Arquivo puro: sem banco, sem IA. A prova roda sem rede
 * (scripts/testes/estilo-dos-posts-0810.test.mts).
 */

export type FonteDaFoto = "material" | "gerada" | "nenhuma";

// Tipo (e não interface) para caber no metadata JSON do Prisma sem conversão.
export type FotoDaPeca = {
  fonte: FonteDaFoto;
  /** O id em materiais_do_cliente, quando a fonte é "material". */
  materialId?: string;
};

const FOTOS = new Map<string, FotoDaPeca>();

export function registrarFotoDaPeca(manchete: string, foto: FotoDaPeca): void {
  const chave = manchete.trim();
  if (!chave) return;
  FOTOS.delete(chave);
  FOTOS.set(chave, foto.fonte === "material" && foto.materialId ? { fonte: "material", materialId: foto.materialId } : { fonte: foto.fonte === "material" ? "nenhuma" : foto.fonte });
  if (FOTOS.size > 300) FOTOS.delete(FOTOS.keys().next().value as string);
}

/** A foto registrada para esta manchete, ou null quando nada foi registrado. */
export function fotoDaPeca(manchete: string | null | undefined): FotoDaPeca | null {
  if (!manchete) return null;
  return FOTOS.get(manchete.trim()) ?? null;
}

/**
 * O que vai no metadata do post: `fotoDaPeca` para uma manchete (imagem) e
 * `fotosDasLaminas` para várias (carrossel, na ordem das lâminas). Vazio
 * quando nada foi registrado (o post fica como antes).
 */
export function metadataDaFoto(manchetes: string[]): { fotoDaPeca?: FotoDaPeca; fotosDasLaminas?: FotoDaPeca[] } {
  const lista = manchetes.map((m) => fotoDaPeca(m));
  if (!lista.some(Boolean)) return {};
  if (manchetes.length === 1) return { fotoDaPeca: lista[0]! };
  return { fotosDasLaminas: lista.map((f) => f ?? { fonte: "nenhuma" }) };
}

/** Uma foto gravada no metadata, conferida (o JSON do banco não tem tipo). */
function fotoGravada(v: unknown): FotoDaPeca | null {
  const f = v as Partial<FotoDaPeca> | null;
  if (!f || (f.fonte !== "material" && f.fonte !== "gerada" && f.fonte !== "nenhuma")) return null;
  return f.fonte === "material" && typeof f.materialId === "string" && f.materialId ? { fonte: "material", materialId: f.materialId } : { fonte: f.fonte === "material" ? "nenhuma" : f.fonte };
}

/**
 * AS FOTOS DAS LÂMINAS DEPOIS DE REFAZER SÓ ALGUMAS (08/10, revisão): o chat
 * do card refaz as lâminas pedidas e deixa as outras. As refeitas valem pelo
 * registro novo; as outras, pelo que já estava gravado no post. Sem nada a
 * dizer (nenhum registro e nada gravado), null: o post fica como estava.
 */
export function fotosDasLaminasRefeitas(frases: string[], refeitas: number[], antes: unknown): FotoDaPeca[] | null {
  const gravadas = Array.isArray(antes) ? antes.map(fotoGravada) : [];
  const novas = new Map(refeitas.map((i) => [i, fotoDaPeca(frases[i])] as const));
  if (![...novas.values()].some(Boolean) && !gravadas.some(Boolean)) return null;
  return frases.map((_, i) => (novas.has(i) ? novas.get(i) : gravadas[i]) ?? { fonte: "nenhuma" });
}
