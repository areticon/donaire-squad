import sharp from "sharp";
import type { ProporcaoPedida } from "@/lib/media/formatos-das-redes";
import { editarImagemOpenAIComCusto, ehSemSaldoDaOpenAI, gerarImagemOpenAIComCusto, SemChaveDaOpenAI, temChaveDaOpenAI, type QualidadeDaOpenAI } from "@/lib/media/gpt-image";
import { FICHAS, gerarNaHiggsfield, type IdDaHiggsfield } from "@/lib/media/imagem-higgsfield";
import type { ContextoMidia } from "@/lib/media/usage";

/**
 * O GERADOR DA ARTE DE POST, COM IMAGEM DE REFERÊNCIA (05/10/2026).
 *
 * Regra consolidada do Bruno (05/10): "Imagem e vídeo: Google ou GPT". A arte
 * de post (modelo do book com foto, família Vox, lâmina de carrossel, arte do
 * dia de vídeo) sai PRIMEIRO do GPT Image 2 (OpenAI) ou do Gemini image (Nano
 * Banana), os dois aceitando a foto do cliente como imagem de referência; a
 * Higgsfield fica em TERCEIRO recuo, e serve aos elementos de vídeo (B-roll e
 * recortes no editor), não à arte de post.
 *
 * A ordem é configurável por variável de ambiente, sem deploy de código:
 *   IMAGEM_REFERENCIA_ORDEM="openai,google,higgsfield"   (o padrão)
 *   IMAGEM_REFERENCIA_QUALIDADE_OPENAI="medium"           (ou "low")
 *   IMAGEM_REFERENCIA_HIGGSFIELD="higgsfield-gpt-image-2.5-medium"
 *
 * Cada gerador é tentado na ordem; falhou (sem chave, sem saldo, recusa,
 * prazo), vai ao próximo. Só quando TODOS falham a função lança, e quem chama
 * cai no desenho em código, com aviso no card (lib/media/aviso-da-arte.ts).
 * Erro de saldo de um fornecedor NÃO derruba a peça: o outro responde. O
 * custo é gravado por quem respondeu, como sempre (`ai_usage`).
 *
 * A referência (a foto do cliente ou o melhor quadro do vídeo) é um JPEG
 * normalizado; a Higgsfield só recebe imagem por URL pública, então sem URL
 * ela gera do prompt sozinho (o prompt já descreve a pessoa como figurante).
 */

export type GeradorComReferencia = "openai" | "google" | "higgsfield";
const GERADORES: GeradorComReferencia[] = ["openai", "google", "higgsfield"];
export const ORDEM_PADRAO: GeradorComReferencia[] = ["openai", "google", "higgsfield"];

export type Referencia = {
  buffer: Buffer;
  mime: string;
  /** A mesma imagem numa URL pública, quando há (a Higgsfield só recebe por URL). */
  urlPublica?: string | null;
};

export type ImagemComReferencia = { dataUrl: string; modelo: string; custoUsd: number; gerador: GeradorComReferencia };

/** A ordem dos geradores: a variável de ambiente, ou o padrão. Pura, para a prova. */
export function ordemDosGeradores(valor: string | undefined = process.env.IMAGEM_REFERENCIA_ORDEM): GeradorComReferencia[] {
  const lidos = (valor ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is GeradorComReferencia => (GERADORES as string[]).includes(s));
  const ordem = [...new Set(lidos)];
  return ordem.length ? ordem : ORDEM_PADRAO;
}

function qualidadeDaOpenAI(): QualidadeDaOpenAI {
  return process.env.IMAGEM_REFERENCIA_QUALIDADE_OPENAI?.trim() === "low" ? "low" : "medium";
}

function geradorDaHiggsfield(): IdDaHiggsfield {
  const v = process.env.IMAGEM_REFERENCIA_HIGGSFIELD?.trim();
  return v && v in FICHAS ? (v as IdDaHiggsfield) : "higgsfield-gpt-image-2.5-medium";
}

/**
 * O custo ESTIMADO de uma geração, pelo primeiro gerador da ordem (para o
 * script que pede aprovação do gasto antes de gerar). Em dólar.
 */
export function custoEstimadoDaGeracao(ordem: GeradorComReferencia[] = ordemDosGeradores(), comReferencia = true): number {
  const primeiro = ordem[0] ?? "openai";
  if (primeiro === "openai") {
    // Medido em 02/10: medium US$ 0,045 por arte, low US$ 0,0096; a imagem
    // de entrada da edição soma perto de US$ 0,01 em tokens de imagem.
    const base = qualidadeDaOpenAI() === "low" ? 0.0096 : 0.045;
    return base + (comReferencia ? 0.01 : 0);
  }
  if (primeiro === "google") return comReferencia ? 0.136 : 0.101;
  return FICHAS[geradorDaHiggsfield()].precoUsd;
}

/** A referência como JPEG de até 1536 px, orientada pelo EXIF. */
export async function normalizarReferencia(original: Buffer, urlPublica?: string | null): Promise<Referencia> {
  const buffer = await sharp(original).rotate().resize({ width: 1536, height: 1536, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
  return { buffer, mime: "image/jpeg", urlPublica: urlPublica ?? null };
}

/**
 * Gera a imagem pela ordem configurada. Lança quando todos os geradores
 * falharam, com os motivos na mensagem.
 */
export async function gerarComReferencia(o: {
  prompt: string;
  proporcao: ProporcaoPedida;
  referencia?: Referencia | null;
  ctx: ContextoMidia;
  ordem?: GeradorComReferencia[];
}): Promise<ImagemComReferencia> {
  const ordem = o.ordem ?? ordemDosGeradores();
  const falhas: string[] = [];
  for (const gerador of ordem) {
    try {
      const r = await tentar(gerador, o);
      if (r) return { ...r, gerador };
      falhas.push(`${gerador}: sem imagem`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Saldo e chave são assunto do Bruno, nunca do cliente: o log grita, e o próximo gerador responde.
      if (ehSemSaldoDaOpenAI(e) || e instanceof SemChaveDaOpenAI) console.error(`[arte-com-referencia] OpenAI fora: ${msg.slice(0, 160)}`);
      else console.warn(`[arte-com-referencia] ${gerador} falhou: ${msg.slice(0, 200)}`);
      falhas.push(`${gerador}: ${msg.slice(0, 120)}`);
    }
  }
  throw new Error(`nenhum gerador de imagem respondeu (${falhas.join(" | ")})`);
}

async function tentar(gerador: GeradorComReferencia, o: { prompt: string; proporcao: ProporcaoPedida; referencia?: Referencia | null; ctx: ContextoMidia }): Promise<{ dataUrl: string; modelo: string; custoUsd: number } | null> {
  if (gerador === "openai") {
    if (!temChaveDaOpenAI()) throw new SemChaveDaOpenAI();
    const qualidade = qualidadeDaOpenAI();
    if (o.referencia) return editarImagemOpenAIComCusto(o.prompt, o.referencia, o.proporcao, o.ctx, qualidade);
    return gerarImagemOpenAIComCusto(o.prompt, o.proporcao, o.ctx, qualidade);
  }
  if (gerador === "google") {
    const { comporNoGoogle, gerarNoGoogle } = await import("@/lib/media/nano-banana");
    if (o.referencia) return comporNoGoogle(o.prompt, o.referencia.buffer.toString("base64"), o.referencia.mime, o.ctx, o.proporcao);
    return gerarNoGoogle(o.prompt, o.proporcao, "hd", o.ctx);
  }
  // Higgsfield, terceiro recuo: com a referência só por URL pública.
  return gerarNaHiggsfield({
    gerador: geradorDaHiggsfield(),
    prompt: o.prompt,
    proporcao: o.proporcao,
    imagemUrl: o.referencia?.urlPublica ?? undefined,
    ctx: o.ctx,
  });
}
