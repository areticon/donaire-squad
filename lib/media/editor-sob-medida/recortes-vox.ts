import { conferirResposta } from "@/lib/fornecedores/aviso-de-saldo";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { head, put } from "@vercel/blob";
import { midiaProduzida } from "@/lib/media/storage";
import type { EdicaoDoEditor, MomentoDoEditor } from "@/lib/media/editor-sob-medida/tipos";

/**
 * OS RECORTES DE ARQUIVO DO ESTILO VOX (04/10/2026). O dono mandou o quadro
 * docs/overlays/referencias/vox/bruno-0410/vox-01.png e pediu o Vox de
 * verdade: fotos de arquivo em preto e branco de ALTA resolução, recortadas
 * com borda de papel e sombra, em camadas. Cada foto que uma peça Vox pede
 * (colagem, jornal, mapa-antigo, censura) nasce assim:
 *   1. gerada na Higgsfield como foto de arquivo em P&B (o tipo "colagem" de
 *      lib/media/imagem-higgsfield.ts, GPT Image 2.5 medium, ~US$ 0,06);
 *   2. recortada no BiRefNet da fal (o mesmo da biblioteca de materiais,
 *      ~US$ 0,003), fundo transparente, em WebP de até 1200 px;
 *   3. nos assuntos com rosto (estátua, figura), a posição dos OLHOS medida por
 *      visão (Sonnet, ~US$ 0,004), para a tarja de censura cair no lugar;
 *   4. guardada no Blob PÚBLICO pelo hash do pedido: o mesmo pedido nunca é
 *      pago duas vezes (o conserto que repete a descrição sai de graça).
 *
 * NUNCA pessoa real reconhecível: a figura é sempre um anônimo fictício
 * (figurante de época), a estátua é genérica; nome próprio na descrição de
 * figura ou estátua é trocado pela descrição genérica do assunto. A tarja de
 * censura só vai em estátua ou figura fictícia.
 *
 * SEM A FOTO (sem saldo, falha, Blob privado), A PEÇA SAI SEM FOTO, só com o
 * texto, ou não sai (05/10 à noite, regra do Bruno: no vídeo cmuvv0jje a
 * "figura" de reserva, um senhor de bigode, representou "Bruno de 15 anos";
 * uma reserva nunca pode representar uma pessoa citada). Os recortes de
 * worker/fontes/vox não entram mais em peça nenhuma; ver `tirarFotosSemImagem`.
 */

export type AssuntoDoRecorte = "estatua" | "figura" | "predio" | "objeto" | "documento" | "lugar";
export const ASSUNTOS: AssuntoDoRecorte[] = ["estatua", "figura", "predio", "objeto", "documento", "lugar"];

/** Uma foto pedida por uma peça Vox (o editor escreve assunto e descrição; o código põe url e olhos). */
export type FotoDoVox = { assunto?: string; descricao?: string; url?: string; olhos?: { x: number; y: number; w: number } | null; censura?: boolean };

const GENERICO: Record<AssuntoDoRecorte, string> = {
  estatua: "a generic classical marble bust of an anonymous ancient figure, head and shoulders, front view, eyes visible",
  figura: "an anonymous fictional 1920s man in a dark suit, waist up, facing camera",
  predio: "an early 1900s brick industrial building with a tall chimney",
  objeto: "an old everyday object from the early 1900s",
  documento: "an old typewritten document page with a seal, text too small to read",
  lugar: "an old town street with stone houses, early 1900s",
};

const GUARDA: Record<AssuntoDoRecorte, string> = {
  estatua: " It is a generic statue, never a famous monument and never a statue of a real identifiable person.",
  figura: " The person is an anonymous fictional extra from the period, never a portrait of any real, famous or historical identifiable person.",
  predio: " No people.",
  objeto: " No people.",
  documento: " No people; any text is too small and blurred to read.",
  lugar: " Any people are tiny and far away, unrecognizable.",
};

export const assuntoValido = (a: unknown): AssuntoDoRecorte => (ASSUNTOS.includes(String(a) as AssuntoDoRecorte) ? (String(a) as AssuntoDoRecorte) : "objeto");

/** Nome próprio (duas palavras com maiúscula seguidas, ou maiúscula no meio da frase) em figura ou estátua vira a descrição genérica. */
function descricaoSegura(assunto: AssuntoDoRecorte, descricao: string): string {
  const d = String(descricao ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (!d) return GENERICO[assunto];
  if ((assunto === "figura" || assunto === "estatua") && /\b[A-Z][a-z]+\s+[A-Z][a-z]+|\s[A-Z][a-z]{2,}/.test(d)) return GENERICO[assunto];
  return d;
}

/** O pedido de imagem do recorte: foto de arquivo P&B, o assunto inteiro isolado no fundo liso (o BiRefNet recorta). */
export function promptDoRecorte(assunto: string, descricao: string): string {
  const a = assuntoValido(assunto);
  const d = descricaoSegura(a, descricao);
  const fundo = a === "lugar" ? " Shot as a photo print with a thin white border." : " The subject is complete and isolated in the center on a plain flat light grey studio background, nothing else in frame, generous margin around it.";
  return `Archival black and white photograph, very high resolution, sharp detail, fine silver film grain, early 20th century documentary look: ${d}.${fundo}${GUARDA[a]} No text, no letters, no logos, no watermark, no color.`;
}

const MODELO_DO_RECORTE = "fal-ai/birefnet/v2";
const CUSTO_DO_RECORTE = 0.003;

/** O fundo removido no BiRefNet (fal). `png` null quando não dá (sem chave, falha, recorte vazio). */
export async function recortarFundo(imagem: Buffer, ctx?: { projectId?: string | null }): Promise<{ png: Buffer | null; custoUsd: number }> {
  const chave = process.env.FAL_KEY;
  if (!chave) return { png: null, custoUsd: 0 };
  const base = await sharp(imagem).resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer();
  const r = await fetch(`https://fal.run/${MODELO_DO_RECORTE}`, {
    method: "POST",
    headers: { Authorization: `Key ${chave}`, "content-type": "application/json" },
    body: JSON.stringify({ image_url: `data:image/jpeg;base64,${base.toString("base64")}`, model: "General Use (Heavy)", operating_resolution: "2048x2048", output_format: "png", refine_foreground: true }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) {
    const corpoDoErro = await r.text();
    await conferirResposta("fal", { status: r.status, corpo: corpoDoErro }, "recorte do editor sob medida no fal.ai");
    throw new Error(`fal.ai HTTP ${r.status}: ${corpoDoErro.slice(0, 160)}`);
  }
  const d = (await r.json()) as { image?: { url?: string } };
  if (!d.image?.url) throw new Error("fal.ai não devolveu a imagem");
  const png = Buffer.from(await (await fetch(d.image.url, { signal: AbortSignal.timeout(60_000) })).arrayBuffer());
  const { gravarCustoDeImagem } = await import("@/lib/media/usage");
  gravarCustoDeImagem(MODELO_DO_RECORTE, CUSTO_DO_RECORTE, { projectId: ctx?.projectId ?? undefined, operation: "editor-sob-medida-vox-recorte" });
  const st = await sharp(png).ensureAlpha().extractChannel(3).stats();
  return { png: (st.channels[0]?.mean ?? 0) < 6 ? null : png, custoUsd: CUSTO_DO_RECORTE };
}

/** Os olhos no recorte (fração da largura e da altura da imagem), por visão. Null quando não há rosto. */
async function medirOlhos(webp: Buffer, projectId?: string | null): Promise<{ x: number; y: number; w: number } | null> {
  try {
    const { askClaudeComImagens } = await import("@/lib/claude");
    const jpg = await sharp(webp).flatten({ background: "#ffffff" }).resize({ width: 768, height: 768, fit: "inside" }).jpeg({ quality: 85 }).toBuffer();
    const resp = await askClaudeComImagens(
      "Você mede posições em imagens. Responda só JSON.",
      'Onde estão os OLHOS do rosto principal (estátua ou pessoa) nesta imagem? Responda {"olhos":{"x":centro horizontal dos dois olhos de 0 a 1,"y":centro vertical de 0 a 1,"w":distância de canto externo a canto externo dos dois olhos, de 0 a 1 da largura}} ou {"olhos":null} se não houver rosto de frente.',
      [{ base64: jpg.toString("base64"), rotulo: "A imagem:", mediaType: "image/jpeg" }],
      { model: "claude-sonnet-5", maxTokens: 300, timeoutMs: 60_000, usage: { projectId: projectId ?? undefined, operation: "editor-sob-medida-vox-olhos" } }
    );
    const j = JSON.parse(resp.slice(resp.indexOf("{"), resp.lastIndexOf("}") + 1)) as { olhos?: { x?: number; y?: number; w?: number } | null };
    const o = j.olhos;
    if (!o || ![o.x, o.y, o.w].every((v) => typeof v === "number" && v > 0 && v < 1)) return null;
    return { x: +o.x!.toFixed(3), y: +o.y!.toFixed(3), w: +Math.max(0.08, o.w!).toFixed(3) };
  } catch {
    return null;
  }
}

export type RecorteGuardado = { url: string; olhos: { x: number; y: number; w: number } | null; custoUsd: number };

/** Onde guardar: o Blob público (o Chrome do Remotion lê a URL). `local` serve à prova. */
export type GuardaDoRecorte = {
  ler(chave: string): Promise<{ url: string; olhos: RecorteGuardado["olhos"] } | null>;
  gravar(chave: string, webp: Buffer, olhos: RecorteGuardado["olhos"]): Promise<string | null>;
};

export function guardaDoRecorteNoBlob(): GuardaDoRecorte {
  const caminho = (n: string) => `editor-sob-medida/vox/${n}`;
  const opcoes = midiaProduzida();
  return {
    async ler(chave) {
      try {
        const meta = await head(caminho(`${chave}.json`), { token: opcoes.token });
        const r = await fetch(meta.url, { cache: "no-store" });
        return r.ok ? ((await r.json()) as { url: string; olhos: RecorteGuardado["olhos"] }) : null;
      } catch {
        return null;
      }
    },
    async gravar(chave, webp, olhos) {
      // Blob privado o Chrome do worker não lê: sem o público, a peça fica com a reserva.
      if (opcoes.access !== "public") return null;
      const { url } = await put(caminho(`${chave}.webp`), webp, { ...opcoes, contentType: "image/webp", addRandomSuffix: false, allowOverwrite: true });
      await put(caminho(`${chave}.json`), JSON.stringify({ url, olhos }), { ...opcoes, contentType: "application/json", addRandomSuffix: false, allowOverwrite: true });
      return url;
    },
  };
}

/** Gera (ou acha no cache) o recorte de uma foto pedida. */
export async function recorteDaFoto(foto: FotoDoVox, o: { projectId?: string | null; guarda?: GuardaDoRecorte }): Promise<RecorteGuardado | null> {
  const assunto = assuntoValido(foto.assunto);
  const prompt = promptDoRecorte(assunto, String(foto.descricao ?? ""));
  const chave = `rec-${createHash("sha1").update(prompt).digest("hex").slice(0, 16)}`;
  const guarda = o.guarda ?? guardaDoRecorteNoBlob();
  const achado = await guarda.ler(chave);
  if (achado?.url) return { ...achado, custoUsd: 0 };
  const { gerarImagem, dataUrlToBuffer } = await import("@/lib/media/nano-banana");
  const img = await gerarImagem(prompt, assunto === "predio" || assunto === "lugar" ? "4:3" : "3:4", "hd", { projectId: o.projectId ?? undefined, operation: "editor-sob-medida-vox-foto" }, { tipo: "colagem" });
  let custo = img.custoUsd ?? 0;
  const original = dataUrlToBuffer(img.dataUrl);
  let webp: Buffer;
  if (assunto === "lugar") {
    // O lugar é a foto inteira (papel fotográfico); a borda e a sombra vêm da peça.
    webp = await sharp(original).resize({ width: 1200, height: 1200, fit: "inside" }).webp({ quality: 84 }).toBuffer();
  } else {
    const r = await recortarFundo(original, { projectId: o.projectId });
    custo += r.custoUsd;
    if (!r.png) return null;
    webp = await sharp(r.png).trim().resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).webp({ quality: 86, alphaQuality: 90 }).toBuffer();
  }
  const olhos = assunto === "estatua" || assunto === "figura" ? await medirOlhos(webp, o.projectId) : null;
  if (olhos) custo += 0.004;
  const url = await guarda.gravar(chave, webp, olhos);
  return url ? { url, olhos, custoUsd: +custo.toFixed(4) } : null;
}

/** As peças do estilo Vox que levam foto, e onde a foto mora nas props. */
export const PECAS_COM_FOTO: Record<string, string> = { colagem: "recortes", jornal: "foto", "mapa-antigo": "foto", censura: "figura", cronologia: "marcos" };

/** As fotos de um momento (referências vivas para as props: preencher aqui preenche a peça). */
export function fotosDoMomento(m: MomentoDoEditor): FotoDoVox[] {
  const campo = PECAS_COM_FOTO[m.peca];
  if (!campo || !m.props) return [];
  const v = (m.props as Record<string, unknown>)[campo];
  // Na cronologia a foto mora em cada marco (marcos[].foto).
  const lista0 = Array.isArray(v) ? v : v && typeof v === "object" ? [v] : [];
  const lista = m.peca === "cronologia" ? lista0.map((x) => (x && typeof x === "object" ? (x as { foto?: unknown }).foto : null)).filter(Boolean) : lista0;
  return lista.filter((x): x is FotoDoVox => Boolean(x) && typeof x === "object" && Boolean((x as FotoDoVox).descricao || (x as FotoDoVox).assunto));
}

/**
 * Preenche a url (e os olhos) de toda foto pedida pelas peças Vox da edição,
 * NO LUGAR (as props do próprio momento). Até `teto` gerações novas por
 * chamada, 2 de cada vez (a Higgsfield faz 2 ao mesmo tempo); o que passa do
 * teto ou falha fica sem url e a peça usa a reserva do assunto.
 */
export async function prepararFotosDoVox(e: EdicaoDoEditor, o: { projectId?: string | null; guarda?: GuardaDoRecorte; teto?: number } = {}): Promise<{ prontas: number; custoUsd: number; erros: string[] }> {
  // Teto de fotos NOVAS por chamada (VOX_FOTOS_POR_EDICAO, padrão 6): no recuo do Google cada uma custa ~US$ 0,10.
  const teto = o.teto ?? Number(process.env.VOX_FOTOS_POR_EDICAO ?? 6);
  // A fila vai até o teto (05/10 à noite): o corte fixo em 12 deixou 18 fotos do completo de 17 min sem imagem.
  const fotos = (e.momentos ?? []).flatMap(fotosDoMomento).filter((f) => !f.url).slice(0, Math.max(12, teto));
  const erros: string[] = [];
  let custo = 0;
  let prontas = 0;
  let novas = 0;
  const fila = [...fotos];
  const trabalhar = async () => {
    for (let f = fila.shift(); f; f = fila.shift()) {
      try {
        if (novas >= teto) break;
        const r = await recorteDaFoto(f, o);
        if (!r) continue;
        if (r.custoUsd > 0) novas++;
        custo += r.custoUsd;
        f.url = r.url;
        if (r.olhos) f.olhos = r.olhos;
        prontas++;
      } catch (err) {
        erros.push(`foto "${String(f.descricao ?? f.assunto).slice(0, 40)}": ${err instanceof Error ? err.message.slice(0, 120) : err}`);
      }
    }
  };
  await Promise.all([trabalhar(), trabalhar()]);
  return { prontas, custoUsd: +custo.toFixed(4), erros };
}

/**
 * AS FOTOS SEM IMAGEM GERADA SAEM DO PLANO (05/10, noite): a peça fica só com
 * o texto; a que não existe sem foto (censura: a tarja precisa de um rosto)
 * sai inteira. Devolve o plano novo e o que mudou. Módulo puro.
 */
export function tirarFotosSemImagem<T extends { momentos: MomentoDoEditor[] }>(e: T): { plano: T; semFoto: number; removidos: string[] } {
  let semFoto = 0;
  const removidos: string[] = [];
  const temUrl = (f: unknown) => Boolean(f && typeof f === "object" && typeof (f as FotoDoVox).url === "string" && (f as FotoDoVox).url);
  const momentos = (e.momentos ?? []).flatMap((m) => {
    const campo = PECAS_COM_FOTO[m.peca];
    if (!campo || !m.props) return [m];
    const props = { ...(m.props as Record<string, unknown>) };
    const v = props[campo];
    if (m.peca === "cronologia" && Array.isArray(v)) {
      props[campo] = v.map((x) => {
        if (!x || typeof x !== "object" || !(x as { foto?: unknown }).foto) return x;
        if (temUrl((x as { foto?: unknown }).foto)) return x;
        semFoto++;
        const { foto: _f, ...resto } = x as Record<string, unknown>;
        void _f;
        return resto;
      });
      return [{ ...m, props }];
    }
    if (Array.isArray(v)) {
      const comUrl = v.filter(temUrl);
      semFoto += v.length - comUrl.length;
      props[campo] = comUrl;
      // A colagem sem nenhum recorte e sem mapa não tem o que mostrar.
      if (m.peca === "colagem" && !comUrl.length && !props.mapa) {
        removidos.push(String(m.id ?? m.peca));
        return [];
      }
      return [{ ...m, props }];
    }
    if (v && typeof v === "object" && !temUrl(v)) {
      semFoto++;
      delete props[campo];
      if (m.peca === "censura") {
        removidos.push(String(m.id ?? m.peca));
        return [];
      }
      return [{ ...m, props }];
    }
    return [m];
  });
  return { plano: { ...e, momentos }, semFoto, removidos };
}
