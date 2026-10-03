import { put } from "@vercel/blob";
import { createHash } from "node:crypto";
import { gerarImagem, dataUrlToBuffer } from "@/lib/media/nano-banana";
import { midiaProduzida } from "@/lib/media/storage";
import { bibliaDoEstilo } from "@/lib/media/biblias";
import { referenciaDoEstilo, textoDaReferencia } from "@/lib/media/referencias-de-estilo";
import type { PalavraNoCorte } from "@/lib/media/plano-de-montagem";
import type { EdicaoDoEditor } from "@/lib/media/editor-sob-medida/tipos";

/**
 * O EDITOR SOB MEDIDA (03/10/2026): o caminho novo da edição, atrás do
 * interruptor EDITOR_SOB_MEDIDA.
 *
 *   EDITOR_SOB_MEDIDA ausente ou "0": desligado; a esteira de sempre (diretor
 *     limpo, plano de montagem, Remotion por cenas) segue igual.
 *   "1": ligado como PADRÃO para todo estilo que tem referência pronta
 *     (lib/media/referencias-de-estilo, hoje as 27 linguagens do catálogo).
 *   "todos": ligado mesmo sem referência (usa a bíblia como referência).
 *
 * A esteira antiga fica como RESERVA: se o editor, a revisão ou o render do
 * caminho novo falharem, o completo volta ao caminho de sempre.
 */
export function editorSobMedidaLigado(estiloId: string | null | undefined): boolean {
  const v = (process.env.EDITOR_SOB_MEDIDA ?? "").trim().toLowerCase();
  if (!v || v === "0") return false;
  if (v === "todos") return true;
  return Boolean(textoDaReferencia(estiloId ?? null));
}

/** A referência do estilo para o editor e o revisor (a da pesquisa; sem ela, o resumo da bíblia). */
export function referenciaParaOEditor(estiloId: string | null | undefined): { texto: string; quadros: string[] } {
  const ref = referenciaDoEstilo(estiloId ?? null);
  const texto = textoDaReferencia(estiloId ?? null);
  if (ref && texto) return { texto, quadros: [...ref.quadrosDeReferencia] };
  const b = bibliaDoEstilo(estiloId);
  return {
    texto: [`# ESTILO ${b.nome.toUpperCase()}`, b.essencia, `Tipografia: ${b.tipografia.titulo}; ${b.tipografia.regras.join(" ")}`, `Movimento: ${b.movimento.camera} ${b.movimento.entradas}`, `Regras:\n${b.regras.map((r) => `- ${r}`).join("\n")}`].join("\n\n"),
    quadros: [],
  };
}

/** Os instantes dos quadros que o editor vê: um a cada ~6 s, no máximo 180. */
export function instantesParaOEditor(duracao: number): number[] {
  const passo = Math.max(6, duracao / 180);
  const saida: number[] = [];
  for (let t = 1; t < duracao - 0.5; t += passo) saida.push(+t.toFixed(2));
  return saida;
}

/** O roteiro aprovado em texto curto (a tese, os pedidos do cliente nas cenas). */
export function roteiroParaOEditor(roteiro: unknown): string | null {
  const r = roteiro as { completo?: { plano?: { tese?: string; cenas?: Array<{ pedido?: { texto?: string } }> } }; abertura?: unknown } | null | undefined;
  const plano = r?.completo?.plano;
  if (!plano) return null;
  const pedidos = (plano.cenas ?? []).map((c) => c.pedido?.texto).filter(Boolean) as string[];
  return [plano.tese ? `Tese aprovada: ${plano.tese}` : "", pedidos.length ? `Pedidos do cliente nas cenas (atenda quando couber): ${pedidos.map((p) => `"${p}"`).join("; ")}` : ""].filter(Boolean).join("\n") || null;
}

const GUARDA_DA_INSERCAO =
  " Photographic, natural light, no text, no letters, no logos, no watermark. Any person shown is fictional or historical, modestly dressed, never a real public figure, nothing sensual.";

/**
 * As INSERÇÕES que o editor pediu, geradas como foto (o briefing dele) e
 * guardadas. Imagem igual é reaproveitada pelo hash do pedido. `local`: a
 * prova grava em disco em vez do Blob.
 */
export async function gerarInsercoes(
  e: EdicaoDoEditor,
  o: { formato: "16:9" | "9:16"; projectId?: string | null; local?: (nome: string, dados: Buffer) => Promise<string>; teto?: number }
): Promise<{ insercoes: Record<string, { url: string; tipo: "imagem" | "video" }>; custoUsd: number; erros: string[] }> {
  const insercoes: Record<string, { url: string; tipo: "imagem" | "video" }> = {};
  const erros: string[] = [];
  let custo = 0;
  const pedidos = (e.insercoes ?? []).slice(0, o.teto ?? 24);
  await Promise.all(
    pedidos.map(async (ins, k) => {
      const id = String(ins.id ?? `i${k + 1}`).replace(/[^a-z0-9-]/gi, "") || `i${k + 1}`;
      const prompt = `${String(ins.briefing ?? "").slice(0, 900)}${GUARDA_DA_INSERCAO}`;
      try {
        const img = await gerarImagem(prompt, o.formato, "hd", { projectId: o.projectId ?? undefined, operation: "editor-sob-medida-insercao" }, { tipo: "colagem" });
        custo += img.custoUsd ?? 0;
        const dados = dataUrlToBuffer(img.dataUrl);
        const nome = `insercao-${createHash("sha1").update(prompt).digest("hex").slice(0, 12)}.png`;
        const url = o.local ? await o.local(nome, dados) : (await put(`editor-sob-medida/${nome}`, dados, { ...midiaProduzida(), contentType: "image/png", addRandomSuffix: false, allowOverwrite: true })).url;
        insercoes[id] = { url, tipo: "imagem" };
      } catch (err) {
        erros.push(`${id}: ${err instanceof Error ? err.message.slice(0, 120) : err}`);
      }
    })
  );
  return { insercoes, custoUsd: +custo.toFixed(4), erros };
}

/** Quantos minutos de fala: a régua do custo. */
export const minutosDaFala = (palavras: PalavraNoCorte[], duracao: number) => Math.max(duracao, palavras.at(-1)?.fim ?? 0) / 60;

export { escreverEdicao, consertarEdicao, MODELO_DO_EDITOR } from "@/lib/media/editor-sob-medida/editor";
export { resolverEdicao, temaDoEstilo, frasesNumeradas, medidasDaEdicao } from "@/lib/media/editor-sob-medida/resolver";
export { revisarPrevia } from "@/lib/media/editor-sob-medida/revisor";
export type { EdicaoDoEditor, EdicaoResolvida } from "@/lib/media/editor-sob-medida/tipos";
