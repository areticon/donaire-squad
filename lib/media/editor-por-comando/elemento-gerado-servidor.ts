import sharp from "sharp";
import { put } from "@vercel/blob";
import { gerarNaHiggsfield, FICHAS, type IdDaHiggsfield } from "@/lib/media/imagem-higgsfield";
import { recortarFundo } from "@/lib/media/editor-sob-medida/recortes-vox";
import { olhoDoGemini, conferenciaVisualLigada } from "@/lib/media/conferencia-visual";
import { jevLigado, perguntarAoJev } from "@/lib/jev/cliente";
import { midiaProduzida } from "@/lib/media/storage";
import { GRAVACAO_UNICA, nomeUnico } from "@/lib/media/geracao-unica";
import { ESQUEMA_DO_ELEMENTO, SISTEMA_DO_ELEMENTO, type DependenciasDoElemento } from "@/lib/media/editor-por-comando/elemento-gerado";

/**
 * As dependências DE VERDADE da esteira dos elementos gerados por IA
 * (elemento-gerado.ts): a Higgsfield e o BiRefNet, e o Blob público num nome
 * único por geração. Toda chamada aqui é PAGA: só a esteira da montagem e a
 * prova autorizada (scripts/tmp/prova-elementos-ia-0610.mts) usam.
 *
 * O MODELO: GPT Image 2.5 em qualidade média pela Higgsfield
 * ("higgsfield-gpt-image-2.5-medium", US$ 0,06 por imagem, 2K), o melhor da
 * conta para texto legível e logo (a prova A/B de 02/10 deu 23 a 24 de 25).
 * IMAGEM_ELEMENTO_IA troca por outro id de FICHAS sem deploy. Sem recuo para
 * outro gerador: elemento que a Higgsfield não entrega sai do plano.
 *
 * A conferência automática (Gemini e JEV) NÃO está na jornada oficial do
 * editor (a revisão é do usuário): só entra com ELEMENTO_CONFERENCIA=1.
 */

export function modeloDoElemento(): IdDaHiggsfield {
  const v = process.env.IMAGEM_ELEMENTO_IA?.trim();
  return v && v in FICHAS ? (v as IdDaHiggsfield) : "higgsfield-gpt-image-2.5-medium";
}

const dataUrlParaBuffer = (d: string) => Buffer.from(d.slice(d.indexOf(",") + 1), "base64");

/** O olho de verdade (o Gemini só descreve), usado só com ELEMENTO_CONFERENCIA=1. */
async function olharDeVerdade(png: Buffer, projectId?: string | null) {
  const jpg = await sharp(png).flatten({ background: "#7f7f7f" }).resize({ width: 1024, height: 1024, fit: "inside" }).jpeg({ quality: 88 }).toBuffer();
  return olhoDoGemini({ sistema: SISTEMA_DO_ELEMENTO, tarefa: "Descreva este elemento gráfico.", imagens: [{ base64: jpg.toString("base64"), mimeType: "image/jpeg" }], esquema: ESQUEMA_DO_ELEMENTO, projectId, operation: "conferencia-elemento-gerado" });
}

export function dependenciasDeVerdade(o: { projectId?: string | null; videoId?: string | null; ate?: number; local?: (nome: string, dados: Buffer) => Promise<string> }): DependenciasDoElemento {
  const modelo = modeloDoElemento();
  const comConferencia = process.env.ELEMENTO_CONFERENCIA === "1";
  return {
    projectId: o.projectId,
    async gerar(prompt, proporcao) {
      // fundoVerde: mantém o PNG sem perda para o recorte (no GPT Image o fundo liso vai no prompt; o BiRefNet recorta qualquer cor).
      const r = await gerarNaHiggsfield({ gerador: modelo, prompt, proporcao, ctx: { projectId: o.projectId ?? undefined, operation: "editor-elemento-gerado" }, ate: o.ate, fundoVerde: true });
      return { png: dataUrlParaBuffer(r.dataUrl), custoUsd: r.custoUsd, modelo };
    },
    async recortar(png) {
      const r = await recortarFundo(png, { projectId: o.projectId });
      if (!r.png) return r;
      // Aparado: a caixa do worker mede o elemento, não a margem vazia.
      return { png: await sharp(r.png).trim().png().toBuffer(), custoUsd: r.custoUsd };
    },
    olhar: comConferencia && conferenciaVisualLigada() ? (png) => olharDeVerdade(png, o.projectId) : null,
    juiz: comConferencia && jevLigado() ? perguntarAoJev : null,
    async gravar(png, momento) {
      const webp = await sharp(png).resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 90, alphaQuality: 95 }).toBuffer();
      // CADA EDIÇÃO É ALGO NOVO (06/10): nome único por geração, sufixo aleatório do Blob, nunca por cima.
      const nome = nomeUnico("editor-elementos", { video: o.videoId ?? o.projectId, momento, ext: "webp" });
      if (o.local) return o.local(nome.replace(/\//g, "-"), webp);
      return (await put(nome, webp, { ...midiaProduzida(), contentType: "image/webp", ...GRAVACAO_UNICA })).url;
    },
    async medir(png) {
      const m = await sharp(png).metadata();
      return (m.width ?? 1) / (m.height ?? 1);
    },
  };
}
