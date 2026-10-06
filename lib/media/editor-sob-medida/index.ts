import { put } from "@vercel/blob";
import { createHash } from "node:crypto";
import { gerarImagem, dataUrlToBuffer } from "@/lib/media/nano-banana";
import { midiaProduzida } from "@/lib/media/storage";
import { bibliaDoEstilo } from "@/lib/media/biblias";
import { referenciaDoEstilo, textoDaReferencia } from "@/lib/media/referencias-de-estilo";
import type { PalavraNoCorte } from "@/lib/media/plano-de-montagem";
import type { EdicaoDoEditor } from "@/lib/media/editor-sob-medida/tipos";
import { fotosDoMomento, prepararFotosDoVox } from "@/lib/media/editor-sob-medida/recortes-vox";
import { TETO_DO_BRIEFING_ESTILIZADO } from "@/lib/media/editor-por-comando/linguagem";

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
  " Photographic, natural light, no text, no letters, no logos, no watermark. No recognizable person and no face close-up: people only from behind, in silhouette, as hands or far away; never a real public figure, nothing sensual.";

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
  // AS FOTOS DE ARQUIVO DO VOX (04/10): as peças de papel que pedem foto ganham a url aqui, nas props do próprio momento.
  if (e.momentos?.some((m) => fotosDoMomento(m).length)) {
    const f = await prepararFotosDoVox(e, { projectId: o.projectId }).catch((err) => ({ prontas: 0, custoUsd: 0, erros: [`fotos do Vox: ${String(err).slice(0, 120)}`] }));
    custo += f.custoUsd;
    erros.push(...f.erros);
  }
  const pedidos = (e.insercoes ?? []).slice(0, o.teto ?? 24);
  await Promise.all(
    pedidos.map(async (ins, k) => {
      const id = String(ins.id ?? `i${k + 1}`).replace(/[^a-z0-9-]/gi, "") || `i${k + 1}`;
      // O briefing estilizado (editor por comando em dois eixos, 05/10) já traz o bloco de estilo da linguagem e a guarda: nada de forçar "foto".
      const prompt = ins.estilizada ? String(ins.briefing ?? "").slice(0, TETO_DO_BRIEFING_ESTILIZADO) : `${String(ins.briefing ?? "").slice(0, 900)}${GUARDA_DA_INSERCAO}`;
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

// ─────────────────────────────── as inserções em vídeo (Higgsfield) ───────────────────────────────

/**
 * A GUARDA DO VÍDEO GERADO: cinema, nunca pessoa real reconhecível (o dono só
 * aparece pela própria gravação), sem texto e sem marca.
 */
const GUARDA_DO_VIDEO =
  " Cinematic footage, shallow depth of field, rich natural light, subtle film grain. The camera is ALWAYS moving: a continuous, clearly visible dolly, crane, orbit or push-in from the first to the last frame, with parallax; never a static shot. No recognizable person and no face close-up: people only from behind, in silhouette, as hands or far away. Never a real public figure. No text, no letters, no captions, no logos, no watermark.";

/**
 * Quantas inserções viram VÍDEO (Kling 3.0 Pro na Higgsfield, ~US$ 0,11 por
 * segundo, 3 a 5 s cada). As outras ficam como foto com movimento.
 *
 * Decisão do dono em 03/10 (terceira volta): MAIS cinema por vídeo. No
 * completo, 1 a cada ~50 s de fala (um vídeo de 20 min tem ~24, eram 4); no
 * corte, 4. O B-roll de banco cobre o resto da imagem real. Isso passa da
 * régua de R$ 0,027 por crédito com o preço de hoje (a conta está no relatório
 * de 03/10); as variáveis ajustam sem deploy:
 *   EDITOR_SOB_MEDIDA_VIDEOS        teto FIXO do completo (sem ela, pela duração)
 *   EDITOR_SOB_MEDIDA_VIDEOS_POR_MIN quantos por minuto no completo (padrão 1,2)
 *   EDITOR_SOB_MEDIDA_VIDEOS_CORTE  teto do corte (padrão 4)
 *
 * Decisão do dono em 04/10: no completo, uma cena a cada ~3 min (0,33 por
 * minuto na Vercel), intercalada com as peças e o B-roll. O piso de 4 que
 * havia aqui contrariava isso num vídeo curto (5 min pediria 4); agora o piso
 * é 1 (todo completo com duração ganha ao menos uma cena). Sem duração, 4,
 * como nas provas antigas.
 */
export function tetoDeVideos(alvo: "completo" | "corte", minutos = 0): number {
  if (alvo === "corte") return Math.max(0, Number(process.env.EDITOR_SOB_MEDIDA_VIDEOS_CORTE ?? 4));
  if (process.env.EDITOR_SOB_MEDIDA_VIDEOS) return Math.max(0, Number(process.env.EDITOR_SOB_MEDIDA_VIDEOS));
  const porMin = Number(process.env.EDITOR_SOB_MEDIDA_VIDEOS_POR_MIN ?? 1.2);
  if (!(minutos > 0)) return 4;
  return Math.max(1, Math.round(minutos * porMin));
}

/**
 * Quais inserções viram vídeo quando o teto é menor que a lista: ESPALHADAS
 * pela lista (que segue a ordem do vídeo, bloco a bloco), e não as primeiras.
 * Com 0,33 por minuto, as primeiras N caíam todas no começo do completo e o
 * resto ficava sem cena (04/10).
 */
export function espalhar<T>(lista: T[], teto: number): T[] {
  const n = Math.max(0, Math.floor(teto));
  if (n >= lista.length) return lista;
  if (n === 0) return [];
  return Array.from({ length: n }, (_, k) => lista[Math.min(lista.length - 1, Math.floor(((k + 0.5) * lista.length) / n))]);
}
/** Compatível com as provas antigas: o teto do corte e o do completo sem duração. */
export const TETO_DE_VIDEOS = { completo: tetoDeVideos("completo"), corte: tetoDeVideos("corte") };

export type PedidoDeVideo = { id: string; referencia: string; chave: string; custoEstimadoUsd: number };

/**
 * PEDE os vídeos das inserções (não espera): o POST da Higgsfield devolve o
 * id na hora e o checkpoint fica no Blob (lib/media/higgsfield.ts, um pedido
 * pago nunca se repete). Quem conclui é `concluirVideosDasInsercoes`, depois
 * da prévia, quando o vídeo já ficou pronto. `duracoes` (s) vem da edição
 * resolvida; sem ela, 4 s. Sem HIGGSFIELD_NA_EDICAO=1, nada é pedido e as
 * inserções seguem como foto.
 */
export async function pedirVideosDasInsercoes(
  e: EdicaoDoEditor,
  insercoes: Record<string, { url: string; tipo: "imagem" | "video" }>,
  o: { formato: "16:9" | "9:16"; referencia: string; teto: number; duracoes?: Record<string, number> }
): Promise<{ pedidos: PedidoDeVideo[]; erros: string[] }> {
  const { pedirGeracao, higgsfieldNaEdicaoLigada } = await import("@/lib/media/higgsfield");
  if (!higgsfieldNaEdicaoLigada()) return { pedidos: [], erros: ["HIGGSFIELD_NA_EDICAO desligada: inserções ficam em foto"] };
  const pedidos: PedidoDeVideo[] = [];
  const erros: string[] = [];
  const lista = (e.insercoes ?? [])
    .map((ins, k) => ({ ins, id: String(ins.id ?? `i${k + 1}`).replace(/[^a-z0-9-]/gi, "") || `i${k + 1}` }))
    // Só as que ficaram na edição resolvida (a que cruza uma tela cheia cai lá e não paga vídeo).
    .filter(({ id }) => insercoes[id] && (!o.duracoes || id in o.duracoes))
    // No plano em dois eixos (05/10, noite) o JEV já disse quais são vídeo: só essas viram vídeo (a janela nunca).
    .filter(({ ins }) => !(e.insercoes ?? []).some((x) => x.midia) || (ins.midia === "video" && !ins.janela));
  const escolhidas = espalhar(lista, o.teto);
  await Promise.all(
    escolhidas.map(async ({ ins, id }) => {
      const prompt = ins.estilizada ? String(ins.briefing ?? "").slice(0, TETO_DO_BRIEFING_ESTILIZADO) : `${String(ins.briefing ?? "").slice(0, 900)}${GUARDA_DO_VIDEO}`;
      const segundos = Math.min(ins.segundos ? 15 : 5, Math.max(3, Math.ceil(o.duracoes?.[id] ?? ins.segundos ?? 4)));
      const chave = `sob-medida-${id}-${createHash("sha1").update(`${prompt}|${segundos}|${o.formato}`).digest("hex").slice(0, 10)}`;
      try {
        const g = await pedirGeracao({ modelo: "kling-pro", prompt, segundos, proporcao: o.formato, referencia: o.referencia, chave });
        pedidos.push({ id, referencia: o.referencia, chave, custoEstimadoUsd: g.custoEstimadoUsd });
      } catch (err) {
        erros.push(`${id}: ${err instanceof Error ? err.message.slice(0, 160) : err}`);
      }
    })
  );
  return { pedidos, erros };
}

/**
 * CONCLUI os vídeos pedidos: o que ficou pronto troca a foto pelo vídeo (a
 * cópia no nosso Blob, com o custo gravado uma vez); o que não ficou segue em
 * foto. `esperarMs` > 0 consulta de novo até o prazo (a prova local espera; a
 * esteira passa a cada cron).
 */
export async function concluirVideosDasInsercoes(
  insercoes: Record<string, { url: string; tipo: "imagem" | "video" }>,
  pedidos: PedidoDeVideo[],
  o: { projectId?: string | null; esperarMs?: number }
): Promise<{ insercoes: Record<string, { url: string; tipo: "imagem" | "video" }>; prontos: number; falhos: string[] }> {
  const { concluirSePronto } = await import("@/lib/media/higgsfield");
  const saida = { ...insercoes };
  const falhos: string[] = [];
  const faltam = new Set(pedidos.map((p) => p.id));
  const limite = Date.now() + Math.max(0, o.esperarMs ?? 0);
  for (;;) {
    for (const p of pedidos.filter((x) => faltam.has(x.id))) {
      try {
        const g = await concluirSePronto(p.referencia, p.chave, { projectId: o.projectId ?? undefined, operation: "editor-sob-medida-video" });
        if (g?.blobUrl) {
          saida[p.id] = { url: g.blobUrl, tipo: "video" };
          faltam.delete(p.id);
        } else if (g && ["failed", "nsfw", "canceled", "cancelled"].includes(g.status ?? "")) {
          falhos.push(`${p.id}: ${g.status}`);
          faltam.delete(p.id);
        }
      } catch (err) {
        falhos.push(`${p.id}: ${err instanceof Error ? err.message.slice(0, 120) : err}`);
        faltam.delete(p.id);
      }
    }
    if (!faltam.size || Date.now() > limite) break;
    await new Promise((r) => setTimeout(r, 10_000));
  }
  return { insercoes: saida, prontos: pedidos.length - faltam.size - falhos.length, falhos };
}

/** A duração de cada inserção na edição resolvida (o vídeo pedido tem o tamanho dela). */
export function duracoesDasInsercoes(ed: { planos?: Array<{ tipo: string; de: number; ate: number; midia?: string }> }): Record<string, number> {
  return Object.fromEntries((ed.planos ?? []).filter((p) => p.tipo === "insercao" && p.midia).map((p) => [String(p.midia), +(p.ate - p.de).toFixed(2)]));
}

/** Quantos minutos de fala: a régua do custo. */
export const minutosDaFala = (palavras: PalavraNoCorte[], duracao: number) => Math.max(duracao, palavras.at(-1)?.fim ?? 0) / 60;

export { escreverEdicao, consertarEdicao, MODELO_DO_EDITOR } from "@/lib/media/editor-sob-medida/editor";
export { resolverEdicao, temaDoEstilo, frasesNumeradas, medidasDaEdicao } from "@/lib/media/editor-sob-medida/resolver";
export { revisarPrevia } from "@/lib/media/editor-sob-medida/revisor";
export type { EdicaoDoEditor, EdicaoResolvida } from "@/lib/media/editor-sob-medida/tipos";
