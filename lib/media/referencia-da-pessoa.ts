import { decidirChoice, jevLigado, perguntarAoJev } from "@/lib/jev/cliente";
import { normalizarReferencia, type Referencia } from "@/lib/media/gerador-com-referencia";
import { ehPublica, lerMidia } from "@/lib/media/storage";
import type { MaterialDaMarca } from "@/lib/materiais/escolha";

/**
 * A FOTO DE REFERÊNCIA DA PESSOA (05/10/2026).
 *
 * Quando o modelo do book tem o lugar de "você" (foto "recorte"), o gerador
 * recebe uma foto real do cliente como REFERÊNCIA, e nunca a foto crua como
 * arte. De onde ela vem: a biblioteca de materiais, uma foto com etiqueta
 * "pessoa" e rosto. Com mais de uma, quem escolhe é o JEV (decisão, não
 * escrita); sem JEV, a menos usada. Nunca o Claude.
 *
 * 08/10, A REGRA DO BRUNO: "só use foto em post se for foto enviada pelo
 * usuário". Até aqui, sem foto na biblioteca, a referência caía no MELHOR
 * QUADRO DO VÍDEO (a capa do corte ou o /melhor-quadro do worker), e o gerador
 * recortava e colava o print da gravação: os "recortes do vídeo misturados"
 * das artes do Igor. Esse recuo saiu inteiro. Sem foto da pessoa, devolve
 * null, e o modelo que pede a pessoa sai sem pessoa (arte-com-frase.tsx).
 */

export type ReferenciaDaPessoa = Referencia & {
  /** Só "material" desde 08/10: o quadro do vídeo deixou de ser referência. */
  origem: "material";
  materialId?: string;
  /** A pessoa já recortada (PNG), quando existe. */
  recorte?: Buffer | null;
};

/** As fotos da biblioteca que mostram a pessoa (etiqueta "pessoa" e rosto). */
export function materiaisDaPessoa(materiais: MaterialDaMarca[] | undefined): MaterialDaMarca[] {
  return (materiais ?? []).filter((m) => m.etiquetas.includes("pessoa") && m.temRosto);
}

/** A menos usada (e usada há mais tempo), com as marcadas na campanha na frente. Puro. */
export function menosUsado(materiais: MaterialDaMarca[]): MaterialDaMarca | null {
  if (!materiais.length) return null;
  return [...materiais].sort((a, b) => Number(b.daCampanha) - Number(a.daCampanha) || a.usos - b.usos || a.ultimoUsoEm - b.ultimoUsoEm)[0];
}

/**
 * Qual foto da pessoa serve a esta frase: o JEV escolhe entre as descrições;
 * confiança baixa ou JEV desligado, a menos usada.
 */
export async function escolherFotoDaPessoa(materiais: MaterialDaMarca[], frase: string, projectId?: string): Promise<MaterialDaMarca | null> {
  const pessoa = materiaisDaPessoa(materiais);
  if (pessoa.length <= 1) return pessoa[0] ?? null;
  const padrao = menosUsado(pessoa)!;
  if (!jevLigado()) return padrao;
  try {
    const criteria = Object.fromEntries(pessoa.slice(0, 12).map((m) => [m.id, `${m.descricao || "foto da pessoa"} (usada ${m.usos} vez${m.usos === 1 ? "" : "es"})`]));
    const r = await perguntarAoJev(
      { projectId, etapa: "foto-da-pessoa", state: `Manchete do post: "${frase}". Entre as fotos reais da pessoa abaixo, qual serve melhor de referência para a arte deste post? Prefira a menos usada quando servem igual.` },
      { foto: { type: "choice", instructions: "Qual foto serve melhor a esta manchete?", criteria } }
    );
    const id = decidirChoice(r.foto, Object.keys(criteria), padrao.id);
    return pessoa.find((m) => m.id === id) ?? padrao;
  } catch (e) {
    console.warn("[referencia] o JEV não escolheu a foto; vai a menos usada:", e instanceof Error ? e.message : e);
    return padrao;
  }
}

/**
 * A referência de UM material já escolhido (05/10): o carrossel intercalado
 * decide a foto de cada lâmina antes (lib/media/fotos-do-carrossel.ts) e só
 * precisa carregá-la. Null quando o arquivo não pôde ser lido.
 */
export async function referenciaDoMaterial(material: MaterialDaMarca): Promise<ReferenciaDaPessoa | null> {
  const original = await lerMidia(material.url).catch(() => null);
  if (!original) return null;
  return { ...(await normalizarReferencia(original, ehPublica(material.url) ? material.url : null)), origem: "material", materialId: material.id };
}

/**
 * A referência da pessoa para uma peça: SÓ a foto da Biblioteca de materiais
 * (08/10). Null quando o cliente não subiu foto da pessoa: o modelo que pede a
 * pessoa sai sem pessoa (lib/media/arte-com-frase.tsx), nunca com o quadro do
 * vídeo.
 */
export async function referenciaDaPessoa(o: { materiais?: MaterialDaMarca[]; frase: string; projectId?: string }): Promise<ReferenciaDaPessoa | null> {
  const material = await escolherFotoDaPessoa(o.materiais ?? [], o.frase, o.projectId);
  if (!material) return null;
  return referenciaDoMaterial(material);
}
