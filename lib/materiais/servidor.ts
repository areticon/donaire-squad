import sharp from "sharp";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/db/prisma";
import { askClaudeComImagem } from "@/lib/claude";
import { lerMidia, midiaPrivada } from "@/lib/media/storage";
import { ehEtiqueta, orientacaoDe, type CorteNaTela, type Etiqueta, type MaterialNaTela } from "@/lib/materiais/tipos";

/**
 * A BIBLIOTECA DE MATERIAIS DO CLIENTE, no servidor (03/10/2026).
 *
 * Três trabalhos, cada um pago UMA vez por material e guardado na linha:
 *
 *   1. as ETIQUETAS por visão (Sonnet sobre a miniatura ou a folha de quadros
 *      do vídeo, ~US$ 0,003): o que é, se há rosto, qualidade, luz, e palavras
 *      em inglês para casar com a cena do post e a consulta do B-roll;
 *   2. o RECORTE da pessoa (BiRefNet no fal.ai, ~US$ 0,003), só quando uma arte
 *      pede profundidade: PNG com transparência no Blob privado;
 *   3. o TRATAMENTO da foto (sharp, de graça): luz, cor e nitidez no quadro
 *      inteiro. Nunca mexe só no rosto e nunca gera pessoa a partir da foto:
 *      a foto real entra como foi tirada, só tratada e recortada.
 */

type Linha = Awaited<ReturnType<typeof prisma.materialDoCliente.findFirstOrThrow>>;

export function paraTela(m: Linha): MaterialNaTela {
  return {
    id: m.id,
    tipo: m.tipo === "video" ? "video" : "foto",
    nome: m.nome,
    etiquetas: m.etiquetas.filter(ehEtiqueta),
    etiquetasEditadas: m.etiquetasEditadas,
    descricao: m.descricao,
    qualidade: m.qualidade,
    luz: m.luz,
    orientacao: m.orientacao,
    temRosto: m.temRosto,
    status: (["analisando", "pronto", "falhou"].includes(m.status) ? m.status : "pronto") as MaterialNaTela["status"],
    duracaoSec: m.duracaoSec,
    largura: m.largura,
    altura: m.altura,
    usos: m.usos,
    temRecorte: Boolean(m.recorteUrl),
    createdAt: m.createdAt.toISOString(),
  };
}

function json<T>(bruto: string): T | null {
  const i = bruto.indexOf("{");
  const f = bruto.lastIndexOf("}");
  if (i < 0 || f <= i) return null;
  try {
    return JSON.parse(bruto.slice(i, f + 1)) as T;
  } catch {
    return null;
  }
}

/** A imagem que a visão lê: a folha do vídeo, a miniatura ou a própria foto reduzida. */
async function imagemParaVisao(m: Linha): Promise<Buffer | null> {
  const fonte = (m.tipo === "video" ? m.folhaUrl ?? m.miniaturaUrl : m.url) ?? m.miniaturaUrl;
  if (!fonte) return null;
  const b = await lerMidia(fonte).catch(() => null);
  if (!b) return null;
  return sharp(b).rotate().resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
}

/**
 * Lê o material e grava as etiquetas. Etiqueta editada pelo cliente não é
 * sobrescrita: a visão só preenche descrição, qualidade e palavras.
 */
export async function etiquetarMaterial(id: string): Promise<void> {
  const m = await prisma.materialDoCliente.findUnique({ where: { id } });
  if (!m) return;
  try {
    const img = await imagemParaVisao(m);
    if (!img) throw new Error("não consegui ler o arquivo");
    const bruto = await askClaudeComImagem(
      "Você cataloga as fotos e vídeos que um pequeno negócio sobe para a própria biblioteca de marca. Responda SÓ com JSON. Português do Brasil, nunca travessão.",
      `${m.tipo === "video" ? "Esta imagem são TRÊS QUADROS de um vídeo curto do cliente, lado a lado." : "Esta é uma foto do cliente."}
Devolva:
{"etiquetas": [uma ou mais entre "pessoa","equipe","produto","local","bastidor","documento"],
 "rostos": número de rostos visíveis,
 "descricao": "o que aparece, em até 22 palavras, concreto (objeto, lugar, ação)",
 "palavrasEn": [8 a 14 palavras ou expressões curtas em inglês do que aparece, sinônimos incluídos, para busca],
 "qualidade": "boa" | "media" | "fraca" (nitidez e enquadramento para usar em post de marca),
 "luz": "boa" | "escura" | "estourada" | "mista"}
Regras das etiquetas: "pessoa" é UMA pessoa em destaque, posando ou falando para a câmera (o dono do negócio, normalmente); "equipe" é mais de uma pessoa ou alguém trabalhando sem posar; "produto" é o que se vende, em destaque; "local" é o espaço (escritório, loja, fachada, consultório); "bastidor" é processo e dia a dia; "documento" é print, tela, papel, planilha ou texto. Nunca identifique quem é a pessoa.`,
      img.toString("base64"),
      "image/jpeg",
      { maxTokens: 4000, effort: "low", usage: { projectId: m.projectId, operation: "material_etiquetas" } }
    );
    const j = json<{ etiquetas?: unknown[]; rostos?: number; descricao?: string; palavrasEn?: unknown[]; qualidade?: string; luz?: string }>(bruto);
    if (!j) throw new Error("a visão respondeu fora do formato");
    const etiquetas = (j.etiquetas ?? []).filter(ehEtiqueta) as Etiqueta[];
    const palavras = (j.palavrasEn ?? []).filter((x): x is string => typeof x === "string").map((x) => x.toLowerCase().trim()).filter(Boolean).slice(0, 16);
    await prisma.materialDoCliente.update({
      where: { id },
      data: {
        etiquetas: m.etiquetasEditadas ? m.etiquetas : etiquetas.length ? etiquetas : ["bastidor"],
        temRosto: Number(j.rostos) > 0,
        descricao: String(j.descricao ?? "").replace(/\s*[—–]\s*/g, ", ").slice(0, 300) || null,
        palavrasEn: palavras,
        qualidade: ["boa", "media", "fraca"].includes(String(j.qualidade)) ? String(j.qualidade) : "media",
        luz: ["boa", "escura", "estourada", "mista"].includes(String(j.luz)) ? String(j.luz) : "boa",
        orientacao: m.orientacao ?? orientacaoDe(m.largura, m.altura),
        status: "pronto",
      },
    });
  } catch (e) {
    console.warn("[materiais] etiquetas não vieram:", e instanceof Error ? e.message : e);
    await prisma.materialDoCliente.update({ where: { id }, data: { status: "falhou", orientacao: m.orientacao ?? orientacaoDe(m.largura, m.altura) } }).catch(() => {});
  }
}

// ───────────────────────────── tratamento e recorte ─────────────────────────────

/**
 * O TRATAMENTO DE ARTE sobre a foto real: o quadro inteiro, nunca uma região.
 * Orientação pelo EXIF, luz conforme o que a visão leu, um pouco de cor e de
 * nitidez. É o que um editor faria no Lightroom antes de diagramar.
 */
export async function tratarFoto(b: Buffer, luz?: string | null): Promise<Buffer> {
  const brilho = luz === "escura" ? 1.14 : luz === "estourada" ? 0.94 : 1.03;
  let s = sharp(b).rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true });
  s = s.modulate({ brightness: brilho, saturation: 1.1 }).linear(1.06, -6).sharpen({ sigma: 0.6 });
  if (luz === "escura") s = s.gamma(2.2, 2.0);
  return s.jpeg({ quality: 92 }).toBuffer();
}

const MODELO_DO_RECORTE = "fal-ai/birefnet/v2";
/** BiRefNet v2: US$ 0,0008 por segundo de máquina; medido ~3 s por foto. */
const CUSTO_DO_RECORTE = 0.003;

/**
 * A pessoa recortada (PNG com transparência), paga uma vez por material e
 * guardada no Blob privado. Devolve null quando não dá (sem chave, falha, ou o
 * recorte veio vazio): a arte segue sem profundidade.
 */
export async function recorteDoMaterial(id: string): Promise<Buffer | null> {
  const m = await prisma.materialDoCliente.findUnique({ where: { id } });
  if (!m || m.tipo !== "foto") return null;
  if (m.recorteUrl) {
    const guardado = await lerMidia(m.recorteUrl).catch(() => null);
    if (guardado) return guardado;
  }
  if (!process.env.FAL_KEY) return null;
  try {
    const original = await lerMidia(m.url);
    if (!original) return null;
    // A mesma base que a arte usa (orientada e no teto de 2400), para o recorte casar pixel a pixel.
    const base = await sharp(original).rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer();
    const png = await recortarPessoaNoFal(base, { projectId: m.projectId, operation: "material_recorte" });
    if (!png) return null;
    const salvo = await put(`materiais/${m.projectId}/recorte-${m.id}.png`, png, { ...midiaPrivada(), contentType: "image/png", addRandomSuffix: true });
    await prisma.materialDoCliente.update({ where: { id }, data: { recorteUrl: salvo.url } });
    return png;
  } catch (e) {
    console.warn("[materiais] recorte falhou:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * A pessoa recortada de QUALQUER foto (05/10): o mesmo BiRefNet, para a imagem
 * que o modelo de imagem gerou a partir da foto de referência (os modelos
 * "você" do book, lib/media/arte-com-frase.tsx). Sem chave ou sem pessoa de
 * verdade no resultado, null. Custo gravado em `ai_usage` na operação dada.
 */
export async function recortarPessoaNoFal(jpeg: Buffer, ctx: { projectId?: string; operation: string }): Promise<Buffer | null> {
  const chave = process.env.FAL_KEY;
  if (!chave) return null;
  const r = await fetch(`https://fal.run/${MODELO_DO_RECORTE}`, {
    method: "POST",
    headers: { Authorization: `Key ${chave}`, "content-type": "application/json" },
    body: JSON.stringify({ image_url: `data:image/jpeg;base64,${jpeg.toString("base64")}`, model: "General Use (Heavy)", operating_resolution: "2048x2048", output_format: "png", refine_foreground: true }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) throw new Error(`fal.ai HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const d = (await r.json()) as { image?: { url?: string } };
  if (!d.image?.url) throw new Error("fal.ai não devolveu a imagem");
  const png = Buffer.from(await (await fetch(d.image.url, { signal: AbortSignal.timeout(60_000) })).arrayBuffer());
  const { gravarCustoDeImagem } = await import("@/lib/media/usage");
  gravarCustoDeImagem(MODELO_DO_RECORTE, CUSTO_DO_RECORTE, ctx);
  // Recorte que sobrou quase vazio (sem pessoa de verdade) não serve.
  const st = await sharp(png).ensureAlpha().extractChannel(3).stats();
  if ((st.channels[0]?.mean ?? 0) < 6) return null;
  return png;
}

/** A caixa da pessoa no recorte (em pixels da base), pelo canal alfa. */
export async function caixaDaPessoa(recorte: Buffer): Promise<{ x: number; y: number; w: number; h: number; W: number; H: number } | null> {
  const { data, info } = await sharp(recorte).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y += 2) {
    const linha = y * info.width;
    for (let x = 0; x < info.width; x += 2) {
      if (data[linha + x] > 128) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, W: info.width, H: info.height };
}

// ───────────────────────────── cortes da gravação ─────────────────────────────

/** A segunda-feira (UTC) da data, no formato do Gestor. */
function segundaDe(d: Date): string {
  const dia = d.getUTCDay();
  const base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return new Date(base + (dia === 0 ? -6 : 1 - dia) * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Os cortes (Reels) prontos das gravações do projeto, para a biblioteca
 * (05/10/2026). Lê só o que já existe: o trecho com o vertical renderizado e
 * o card do Vitor que aponta para ele. Nada é copiado nem gravado, então o
 * corte refeito no card aparece aqui já refeito.
 */
export async function cortesDoProjeto(projectId: string): Promise<CorteNaTela[]> {
  const [videos, cards] = await Promise.all([
    prisma.videoJob.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { id: true, originalName: true, clips: true, createdAt: true, finishedAt: true },
    }),
    prisma.campaignCard.findMany({
      where: { projectId, cardType: "video_clip" },
      orderBy: { scheduledDate: "asc" },
      select: { id: true, metadata: true, scheduledDate: true, createdAt: true },
    }),
  ]);

  // Um trecho pode virar mais de um card (um por rede): vale o primeiro da agenda.
  const cardDoTrecho = new Map<string, { id: string; semana: string }>();
  for (const c of cards) {
    const meta = c.metadata as { videoJobId?: string; trechoIndice?: number; completo?: boolean } | null;
    if (!meta?.videoJobId || meta.completo || typeof meta.trechoIndice !== "number") continue;
    const chave = `${meta.videoJobId}:${meta.trechoIndice}`;
    if (!cardDoTrecho.has(chave)) cardDoTrecho.set(chave, { id: c.id, semana: segundaDe(c.scheduledDate ?? c.createdAt) });
  }

  const cortes: CorteNaTela[] = [];
  for (const v of videos) {
    const trechos = Array.isArray(v.clips) ? (v.clips as Array<{ inicio?: number; fim?: number; titulo?: string; texto?: { titulo?: string }; midia?: { vertical?: { url?: string } | null } | null }>) : [];
    trechos.forEach((t, i) => {
      if (!t?.midia?.vertical?.url) return;
      const id = `${v.id}:${i}`;
      const card = cardDoTrecho.get(id);
      const base = `/api/videos/${v.id}/midia?trecho=${i}`;
      cortes.push({
        id,
        videoJobId: v.id,
        indice: i,
        titulo: (t.texto?.titulo || t.titulo || `Corte ${i + 1}`).replace(/\s*[—–]\s*/g, ", "),
        duracaoSec: Math.max(0, Math.round((Number(t.fim) || 0) - (Number(t.inicio) || 0))),
        gravacao: v.originalName,
        miniaturaUrl: `${base}&tipo=capa-arte`,
        videoUrl: `${base}&tipo=vertical`,
        baixarUrl: `${base}&tipo=vertical&download=1`,
        cardId: card?.id ?? null,
        semanaDoCard: card?.semana ?? null,
        createdAt: (v.finishedAt ?? v.createdAt).toISOString(),
      });
    });
  }
  return cortes;
}

// ───────────────────────────── uso ─────────────────────────────

export async function marcarUso(id: string): Promise<void> {
  await prisma.materialDoCliente.update({ where: { id }, data: { usos: { increment: 1 }, ultimoUsoEm: new Date() } }).catch(() => {});
}
