import sharp from "sharp";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/db/prisma";
import { enviarEmail } from "@/lib/email";
import { gerarNaHiggsfield, type IdDaHiggsfield, FICHAS } from "@/lib/media/imagem-higgsfield";
import { baixarResultado, consultarPedido, custoDaGeracao, MODELOS, pedirGeracao } from "@/lib/media/higgsfield";
import { midiaProduzida } from "@/lib/media/storage";
import { gravarCustoDeImagem, gravarCustoDeVideo } from "@/lib/media/usage";
import { conferirResposta, avisarSeForSemSaldo } from "@/lib/fornecedores/aviso-de-saldo";
import { jevLigado, perguntarAoJev } from "@/lib/jev/cliente";
import { GRAVACAO_DA_JORNADA, nomeDaMidia } from "@/lib/media/jornada/estado";
import { ESQUEMA_DA_LEITURA_DO_TEXTO, SISTEMA_DA_LEITURA_DO_TEXTO } from "@/lib/media/jornada/leitura-do-texto";
import type { DependenciasDaGeracao, MidiaGerada } from "@/lib/media/jornada/geracao";

/**
 * As dependências DE VERDADE da geração da jornada (passo 6). Toda chamada
 * aqui é PAGA: só a montagem da jornada e as provas autorizadas usam.
 *
 *   - imagem: Higgsfield, GPT Image 2.5 qualidade média (JORNADA_IMAGEM troca
 *     por outro id da Higgsfield sem deploy);
 *   - reserva: Nano Banana Pro (gemini-3-pro-image-preview), com aviso ao admin;
 *   - vídeo: Higgsfield, Kling 3.0 Pro texto para vídeo (pede HIGGSFIELD_NA_EDICAO=1);
 *   - recorte: BiRefNet v2 na fal;
 *   - leitura do texto: gemini-2.5-flash (só transcreve);
 *   - gravação: Blob público, nome único por geração, nunca por cima.
 */

const dataUrlParaBuffer = (d: string) => Buffer.from(d.slice(d.indexOf(",") + 1), "base64");

export function modeloDaImagemDaJornada(): IdDaHiggsfield {
  const v = process.env.JORNADA_IMAGEM?.trim();
  return v && v in FICHAS ? (v as IdDaHiggsfield) : "higgsfield-gpt-image-2.5-medium";
}

/** Nano Banana Pro, direto (o segundo melhor modelo, decisão 2 do Bruno). */
export async function imagemNoNanoBananaPro(prompt: string, proporcao: string, ctx: { projectId?: string | null }): Promise<MidiaGerada> {
  const chave = process.env.GEMINI_API_KEY;
  if (!chave) throw new Error("GEMINI_API_KEY ausente");
  const modelo = "gemini-3-pro-image-preview";
  const aceitas = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${chave}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["IMAGE", "TEXT"], imageConfig: { aspectRatio: aceitas.includes(proporcao) ? proporcao : "1:1", imageSize: "2K" } } }),
    signal: AbortSignal.timeout(150_000),
  });
  if (!r.ok) {
    const corpo = await r.text().catch(() => "");
    await conferirResposta("google", { status: r.status, corpo }, "imagem de reserva da jornada (Nano Banana Pro)");
    throw new Error(`Nano Banana Pro HTTP ${r.status}: ${corpo.slice(0, 160)}`);
  }
  const j = (await r.json()) as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data: string } }> } }> };
  const b64 = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
  if (!b64) throw new Error("Nano Banana Pro não devolveu imagem");
  const custoUsd = 0.134;
  gravarCustoDeImagem(modelo, custoUsd, { projectId: ctx.projectId ?? undefined, operation: "jornada-elemento-reserva" });
  return { dados: Buffer.from(b64, "base64"), custoUsd, modelo };
}

/** Um B-roll de 3 s pelo Kling Pro (texto para vídeo), esperando o resultado. */
export async function videoNoKling(prompt: string, proporcao: string, segundos: number, ctx: { projectId?: string | null; referencia: string; chave: string }): Promise<MidiaGerada> {
  const pedido = await pedirGeracao({ modelo: "kling-pro", prompt, segundos, proporcao: proporcao === "9:16" ? "9:16" : "16:9", referencia: ctx.referencia, chave: ctx.chave });
  const prazo = Date.now() + 8 * 60_000;
  while (Date.now() < prazo) {
    await new Promise((r) => setTimeout(r, 6000));
    const s = await consultarPedido(pedido.requestId);
    if (s.status === "completed" && s.videoUrl) {
      const mp4 = await baixarResultado(s.videoUrl);
      const custoUsd = custoDaGeracao("kling-pro", segundos);
      gravarCustoDeVideo(MODELOS["kling-pro"].textoParaVideo, custoUsd, { projectId: ctx.projectId ?? undefined, operation: "jornada-broll" });
      return { dados: mp4, custoUsd, modelo: "kling-3.0-pro" };
    }
    if (s.final) throw new Error(`Kling terminou como ${s.status}`);
  }
  throw new Error("Kling não entregou em 8 min");
}

/** O recorte do fundo (BiRefNet v2 na fal), aparado. */
export async function recortarNaFal(png: Buffer, ctx: { projectId?: string | null }): Promise<{ png: Buffer | null; custoUsd: number }> {
  const chave = process.env.FAL_KEY;
  if (!chave) return { png: null, custoUsd: 0 };
  const base = await sharp(png).resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer();
  const r = await fetch("https://fal.run/fal-ai/birefnet/v2", {
    method: "POST",
    headers: { Authorization: `Key ${chave}`, "content-type": "application/json" },
    body: JSON.stringify({ image_url: `data:image/jpeg;base64,${base.toString("base64")}`, model: "General Use (Heavy)", operating_resolution: "2048x2048", output_format: "png", refine_foreground: true }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) {
    const corpo = await r.text();
    await conferirResposta("fal", { status: r.status, corpo }, "recorte da jornada no fal.ai");
    throw new Error(`fal.ai HTTP ${r.status}: ${corpo.slice(0, 160)}`);
  }
  const d = (await r.json()) as { image?: { url?: string } };
  if (!d.image?.url) throw new Error("fal.ai não devolveu a imagem");
  const saida = Buffer.from(await (await fetch(d.image.url, { signal: AbortSignal.timeout(60_000) })).arrayBuffer());
  gravarCustoDeImagem("fal-ai/birefnet/v2", 0.003, { projectId: ctx.projectId ?? undefined, operation: "jornada-recorte" });
  const st = await sharp(saida).ensureAlpha().extractChannel(3).stats();
  if ((st.channels[0]?.mean ?? 0) < 6) return { png: null, custoUsd: 0.003 };
  return { png: await sharp(saida).trim().png().toBuffer(), custoUsd: 0.003 };
}

/** O Gemini lê o texto da imagem (só transcreve). */
export async function lerTextoNoGemini(png: Buffer, ctx: { projectId?: string | null }): Promise<{ texto: string; custoUsd: number }> {
  const chave = process.env.GEMINI_API_KEY;
  if (!chave) throw new Error("GEMINI_API_KEY ausente");
  const jpg = await sharp(png).flatten({ background: "#7f7f7f" }).resize({ width: 1024, height: 1024, fit: "inside" }).jpeg({ quality: 88 }).toBuffer();
  const modelo = "gemini-2.5-flash";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${chave}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SISTEMA_DA_LEITURA_DO_TEXTO }] },
      contents: [{ role: "user", parts: [{ inlineData: { mimeType: "image/jpeg", data: jpg.toString("base64") } }, { text: "Transcreva o texto desta imagem." }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: ESQUEMA_DA_LEITURA_DO_TEXTO, temperature: 0, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) {
    const corpo = await r.text().catch(() => "");
    await conferirResposta("google", { status: r.status, corpo }, "leitura do texto do elemento (Gemini)");
    throw new Error(`Gemini HTTP ${r.status}`);
  }
  const j = (await r.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
  const t = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "{}";
  let texto = "";
  try {
    texto = String((JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)) as { texto?: string }).texto ?? "");
  } catch {
    texto = t;
  }
  const custoUsd = ((j.usageMetadata?.promptTokenCount ?? 0) * 0.3 + (j.usageMetadata?.candidatesTokenCount ?? 0) * 2.5) / 1_000_000;
  gravarCustoDeImagem(modelo, custoUsd, { projectId: ctx.projectId ?? undefined, operation: "jornada-leitura-do-texto" });
  return { texto, custoUsd };
}

const avisados = new Map<string, number>();

/** O aviso SÓ para o admin (a Higgsfield falhou e a reserva entrou): e-mail, no máximo um a cada 6 h por motivo. */
export async function avisarAdminDaJornada(onde: string, detalhe: string): Promise<void> {
  console.error(`[jornada] ${onde}: ${detalhe}`);
  await avisarSeForSemSaldo(new Error(detalhe), `jornada: ${onde}`).catch(() => null);
  const chave = detalhe.replace(/[0-9a-f]{8,}/gi, "").slice(0, 80);
  if (Date.now() - (avisados.get(chave) ?? 0) < 6 * 3600_000) return;
  avisados.set(chave, Date.now());
  try {
    const admins = await prisma.user.findMany({ where: { role: "admin" }, select: { email: true } });
    for (const a of admins) if (a.email) await enviarEmail({ para: a.email, assunto: "Editor (jornada): fornecedor falhou, a reserva entrou", texto: `${onde}\n\n${detalhe}` }).catch(() => false);
  } catch {
    // O aviso nunca derruba a geração.
  }
}

export function dependenciasDaGeracao(o: {
  projectId: string | null;
  videoId: string;
  edicaoId: string;
  /** A prova local grava em disco em vez do Blob. */
  local?: (nome: string, dados: Buffer) => Promise<string>;
  concorrencia?: number;
}): DependenciasDaGeracao {
  const ctx = { projectId: o.projectId };
  return {
    projectId: o.projectId,
    concorrencia: o.concorrencia ?? Math.max(1, Number(process.env.JORNADA_GERACOES_JUNTAS ?? 4)),
    async imagem(prompt, proporcao) {
      const r = await gerarNaHiggsfield({ gerador: modeloDaImagemDaJornada(), prompt, proporcao, ctx: { projectId: o.projectId ?? undefined, operation: "jornada-elemento" }, fundoVerde: true });
      return { dados: dataUrlParaBuffer(r.dataUrl), custoUsd: r.custoUsd, modelo: r.modelo };
    },
    imagemReserva: (prompt, proporcao) => imagemNoNanoBananaPro(prompt, proporcao, ctx),
    video: (prompt, proporcao, segundos) => videoNoKling(prompt, proporcao, segundos, { projectId: o.projectId, referencia: `jornada-${o.videoId}-${o.edicaoId}`, chave: nomeDaMidia({ videoId: o.videoId, edicaoId: o.edicaoId, elementoId: "broll", ext: "mp4" }).replace(/[^a-zA-Z0-9-]/g, "") }),
    recortar: (png) => recortarNaFal(png, ctx),
    lerTexto: (png) => lerTextoNoGemini(png, ctx),
    jev: jevLigado() ? perguntarAoJev : null,
    async gravar(dados, elementoId, ext) {
      const corpo = ext === "mp4" ? dados : await sharp(dados).resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).webp({ quality: 90, alphaQuality: 95 }).toBuffer();
      const nome = nomeDaMidia({ videoId: o.videoId, edicaoId: o.edicaoId, elementoId, ext: ext === "mp4" ? "mp4" : "webp" });
      if (o.local) return o.local(nome.replace(/\//g, "-"), corpo);
      return (await put(nome, corpo, { ...midiaProduzida(), contentType: ext === "mp4" ? "video/mp4" : "image/webp", ...GRAVACAO_DA_JORNADA })).url;
    },
    async medir(png) {
      const m = await sharp(png).metadata();
      return (m.width ?? 1) / (m.height ?? 1);
    },
    avisarAdmin: avisarAdminDaJornada,
  };
}
