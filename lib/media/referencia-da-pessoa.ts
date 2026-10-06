import { prisma } from "@/lib/db/prisma";
import { decidirChoice, jevLigado, perguntarAoJev } from "@/lib/jev/cliente";
import { normalizarReferencia, type Referencia } from "@/lib/media/gerador-com-referencia";
import { ehPublica, lerMidia } from "@/lib/media/storage";
import { assinarCorpo, CABECALHO_ASSINATURA } from "@/lib/media/worker-token";
import type { MaterialDaMarca } from "@/lib/materiais/escolha";

/**
 * A FOTO DE REFERÊNCIA DA PESSOA (05/10/2026).
 *
 * Quando o modelo do book tem o lugar de "você" (foto "recorte"), o gerador
 * recebe uma foto real do cliente como REFERÊNCIA, e nunca a foto crua como
 * arte. De onde ela vem, nesta ordem:
 *
 *   1. a biblioteca de materiais: uma foto com etiqueta "pessoa" e rosto. Com
 *      mais de uma, quem escolhe é o JEV (decisão, não escrita); sem JEV, a
 *      menos usada. Nunca o Claude;
 *   2. o MELHOR QUADRO DO VÍDEO, pelo Face Landmarker: primeiro os quadros que
 *      o worker já escolheu para as capas dos cortes (nota do rosto gravada em
 *      `midia.recorte.notas`), com o rosto inteiro dentro do quadro e grande o
 *      bastante; sem corte pronto, o worker avalia a gravação agora
 *      (`/melhor-quadro`). Nunca um instante fixo, nunca olho fechado.
 *
 * Sem nenhuma das duas, devolve null: o modelo que pede a pessoa não sai com
 * um figurante, e a esteira escolhe outro modelo do book ou avisa.
 */

export type ReferenciaDaPessoa = Referencia & {
  origem: "material" | "quadro-do-corte" | "quadro-da-gravacao";
  materialId?: string;
  /** A pessoa já recortada (PNG), quando o worker a tem. */
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

type Caixa = { x: number; y: number; w: number; h: number };
type NotasDoRosto = { nota?: number; piscada?: number; boca?: number; giro?: number; caixa?: Caixa };
type MidiaDoTrecho = { capa?: { url?: string } | null; recorte?: { url?: string; rosto?: Caixa | null; notas?: NotasDoRosto | null } | null } | null;

/**
 * O quadro serve de referência? Rosto INTEIRO dentro (com folga das bordas),
 * grande o bastante, olhos abertos, boca fechada e de frente. Puro, para a prova.
 */
export function quadroServe(notas: NotasDoRosto | null | undefined, rosto?: Caixa | null): boolean {
  const caixa = rosto ?? notas?.caixa;
  if (!caixa) return false;
  const folga = 0.02;
  if (caixa.x < folga || caixa.y < folga || caixa.x + caixa.w > 1 - folga || caixa.y + caixa.h > 1 - folga) return false;
  if (caixa.w * caixa.h < 0.012) return false;
  if ((notas?.piscada ?? 0) > 0.45) return false;
  if ((notas?.boca ?? 0) > 0.6) return false;
  if (Math.abs(notas?.giro ?? 0) > 30) return false;
  return true;
}

/** O melhor entre os quadros das capas dos cortes, pela nota do rosto. Puro. */
export function melhorQuadroDosCortes(clips: unknown): { capaUrl: string; recorteUrl: string | null; nota: number } | null {
  const trechos = Array.isArray(clips) ? (clips as Array<{ midia?: MidiaDoTrecho }>) : [];
  let melhor: { capaUrl: string; recorteUrl: string | null; nota: number } | null = null;
  for (const t of trechos) {
    const capa = t?.midia?.capa?.url;
    const rec = t?.midia?.recorte;
    if (!capa || !rec?.notas) continue;
    if (!quadroServe(rec.notas, rec.rosto)) continue;
    const nota = rec.notas.nota ?? -99;
    if (!melhor || nota > melhor.nota) melhor = { capaUrl: capa, recorteUrl: rec.url ?? null, nota };
  }
  return melhor;
}

/** Instantes espalhados pela gravação, fugindo das bordas (abertura e despedida). Puro. */
export function instantesDaGravacao(duracaoSec: number, quantos = 16): number[] {
  const d = Math.max(1, duracaoSec);
  return Array.from({ length: quantos }, (_, i) => Math.round((d * (0.08 + (0.84 * i) / Math.max(1, quantos - 1))) * 100) / 100);
}

const quadrosEmCache = new Map<string, Promise<ReferenciaDaPessoa | null>>();

/** O melhor quadro da gravação como referência (cortes prontos, senão o worker agora). Null sem rosto ou sem worker. */
export function quadroDeReferenciaDoVideo(videoJobId: string): Promise<ReferenciaDaPessoa | null> {
  let v = quadrosEmCache.get(videoJobId);
  if (!v) {
    v = acharQuadro(videoJobId).catch((e) => {
      console.warn(`[referencia][${videoJobId}] sem quadro de referência:`, e instanceof Error ? e.message : e);
      return null;
    });
    quadrosEmCache.set(videoJobId, v);
    if (quadrosEmCache.size > 50) quadrosEmCache.delete(quadrosEmCache.keys().next().value as string);
  }
  return v;
}

async function acharQuadro(videoJobId: string): Promise<ReferenciaDaPessoa | null> {
  const video = await prisma.videoJob.findUnique({ where: { id: videoJobId }, select: { id: true, blobUrl: true, durationSec: true, clips: true } });
  if (!video) return null;
  const doCorte = melhorQuadroDosCortes(video.clips);
  if (doCorte) {
    const quadro = await lerMidia(doCorte.capaUrl).catch(() => null);
    if (quadro) {
      const recorte = doCorte.recorteUrl ? await lerMidia(doCorte.recorteUrl).catch(() => null) : null;
      return { ...(await normalizarReferencia(quadro, ehPublica(doCorte.capaUrl) ? doCorte.capaUrl : null)), origem: "quadro-do-corte", recorte };
    }
  }
  const base = process.env.VIDEO_WORKER_URL;
  if (!base || !video.blobUrl) return null;
  const corpo = JSON.stringify({ sourceUrl: video.blobUrl, instantes: instantesDaGravacao(video.durationSec ?? 600), chave: `cortes/${video.id}/referencia-${Date.now()}` });
  const r = await fetch(`${base.replace(/\/$/, "")}/melhor-quadro`, {
    method: "POST",
    headers: { "content-type": "application/json", [CABECALHO_ASSINATURA]: assinarCorpo(corpo) },
    body: corpo,
    signal: AbortSignal.timeout(240_000),
  });
  if (!r.ok) {
    console.warn(`[referencia] worker /melhor-quadro respondeu ${r.status}: ${(await r.text()).slice(0, 160)}`);
    return null;
  }
  const dados = (await r.json()) as { quadro?: { url?: string }; recorte?: { url?: string }; notas?: NotasDoRosto; rosto?: Caixa };
  if (!dados.quadro?.url || !quadroServe(dados.notas, dados.rosto)) return null;
  const quadro = await lerMidia(dados.quadro.url).catch(() => null);
  if (!quadro) return null;
  const recorte = dados.recorte?.url ? await lerMidia(dados.recorte.url).catch(() => null) : null;
  return { ...(await normalizarReferencia(quadro, ehPublica(dados.quadro.url) ? dados.quadro.url : null)), origem: "quadro-da-gravacao", recorte };
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
 * A referência da pessoa para uma peça: a foto da biblioteca, senão o quadro
 * do vídeo (quando a peça nasce de um vídeo). Null quando não há nenhuma.
 */
export async function referenciaDaPessoa(o: { materiais?: MaterialDaMarca[]; frase: string; projectId?: string; videoJobId?: string | null }): Promise<ReferenciaDaPessoa | null> {
  const material = await escolherFotoDaPessoa(o.materiais ?? [], o.frase, o.projectId);
  if (material) {
    const ref = await referenciaDoMaterial(material);
    if (ref) return ref;
  }
  if (o.videoJobId) return quadroDeReferenciaDoVideo(o.videoJobId);
  return null;
}
