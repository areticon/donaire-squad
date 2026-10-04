import { createHash } from "node:crypto";
import { head, put } from "@vercel/blob";
import { midiaProduzida } from "@/lib/media/storage";
import type { EdicaoDoEditor, MidiaDaInsercao } from "@/lib/media/editor-sob-medida/tipos";

/**
 * O B-ROLL REAL (03/10/2026, terceira volta). O dono viu os cortes de
 * cmurtv2zg e disse que ainda não é profissional: vídeo profissional corta
 * para imagem de verdade várias vezes por minuto. O editor pede, onde a fala
 * cita objeto, lugar, ação ou metáfora visual, uma CONSULTA curta em inglês;
 * aqui ela vira um trecho de vídeo de banco:
 *
 *   - PEXELS (PEXELS_API_KEY): licença livre para uso comercial e para
 *     modificar, sem atribuição obrigatória no vídeo; a API pede o link de
 *     volta ao Pexels onde o app mostra o resultado (o crédito vai junto em
 *     `credito`). Não pode revender o arquivo sem alteração nem montar outro
 *     banco de imagens: aqui ele é sempre editado (recorte, cor, zoom, 1,5 a
 *     3 s dentro do vídeo do cliente).
 *   - PIXABAY (PIXABAY_API_KEY), quando não há chave do Pexels (a emissão de
 *     chaves novas do Pexels foi pausada em out/2026): Licença de Conteúdo do
 *     Pixabay, uso comercial e modificação livres, sem atribuição obrigatória;
 *     proíbe vender ou distribuir o arquivo sozinho, sem alteração, e usar
 *     comercialmente o que mostra marca ou logotipo reconhecível. A API pede o
 *     cache das buscas por 24 h (100 pedidos por minuto) e recomenda guardar o
 *     vídeo no nosso servidor: o arquivo vem sempre para o nosso Blob. A API
 *     de vídeo não filtra orientação: a nota põe o em pé na frente.
 *   - Sem nenhuma das chaves: nada, e o editor segue sem B-roll. Só com
 *     BROLL_PELA_HIGGSFIELD=1 (e HIGGSFIELD_NA_EDICAO=1) a consulta vira um
 *     vídeo de 3 s no Kling Pro (US$ 0,34; o Std falhou em todo pedido de texto para vídeo na prova de 03/10, sem cobrar), e o pedido ESPERA ficar pronto: é
 *     o caminho da prova local, não da esteira. BROLL_PELA_FAL=1 (com FAL_KEY)
 *     faz o mesmo no Kling 2.5 Turbo Pro do fal.ai (US$ 0,07 por segundo, 5 s
 *     cobrados, US$ 0,35): a prova de 03/10 achou a conta da API da Higgsfield
 *     sem saldo.
 *
 * CACHE POR CONSULTA: a escolha (o arquivo, o segundo de começo e o crédito)
 * fica guardada pela consulta e pelo formato; a segunda vez não busca nem
 * baixa de novo. Na esteira, no Blob (editor-sob-medida/broll/); na prova, na
 * pasta local que ela passar.
 */

export type BrollEscolhido = MidiaDaInsercao & { consulta: string; fonte: FonteDoBroll; custoUsd: number };
export type FonteDoBroll = "pexels" | "pixabay" | "higgsfield" | "fal";

/** De onde sai o B-roll agora: um banco (com a chave; Pexels antes do Pixabay) ou, só na prova, um gerador. */
export function fonteDoBroll(): FonteDoBroll | null {
  if (process.env.PEXELS_API_KEY) return "pexels";
  if (process.env.PIXABAY_API_KEY) return "pixabay";
  if (process.env.BROLL_PELA_HIGGSFIELD === "1" && process.env.HIGGSFIELD_NA_EDICAO === "1") return "higgsfield";
  if (process.env.BROLL_PELA_FAL === "1" && process.env.FAL_KEY) return "fal";
  return null;
}

type ArquivoPexels = { quality?: string; file_type?: string; width?: number; height?: number; link?: string };
type VideoPexels = { id: number; width: number; height: number; duration: number; url?: string; user?: { name?: string; url?: string }; video_files?: ArquivoPexels[] };

/** Banco de vídeo grátis (busca e escolhe), contra gerador pago (cria). */
const ehBanco = (f: FonteDoBroll | null): f is "pexels" | "pixabay" => f === "pexels" || f === "pixabay";

export function bancoDeVideoLigado(): boolean {
  return fonteDoBroll() !== null;
}

/** A consulta limpa: minúscula, só letras, números e espaço, até 5 palavras. */
export function limparConsulta(c: string): string {
  return String(c ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .join(" ");
}

/**
 * O MELHOR ARQUIVO de um vídeo para o formato: mp4, com o lado curto de pelo
 * menos 1080 (sem pagar o 4K, que pesa e não aparece), na orientação certa
 * quando houver. Devolve null se nada serve.
 */
export function melhorArquivo(v: VideoPexels, formato: "9:16" | "16:9"): ArquivoPexels | null {
  const mp4 = (v.video_files ?? []).filter((f) => f.link && /mp4/i.test(f.file_type ?? "mp4") && (f.width ?? 0) > 0 && (f.height ?? 0) > 0);
  const curto = (f: ArquivoPexels) => Math.min(f.width!, f.height!);
  const bons = mp4.filter((f) => curto(f) >= 1080 && curto(f) <= 2160).sort((a, b) => curto(a) - curto(b));
  if (bons.length) return bons[0];
  const quase = mp4.filter((f) => curto(f) >= 720 && curto(f) <= 2160).sort((a, b) => curto(b) - curto(a));
  void formato;
  return quase[0] ?? null;
}

/**
 * A NOTA de um vídeo do banco para o pedido: orientação igual ao formato vale
 * mais (o 9:16 tirado de um 16:9 perde 2/3 da imagem), duração entre 5 e 30 s
 * (curto demais não tem trecho limpo; longo demais pesa), resolução boa.
 */
export function notaDoVideo(v: VideoPexels, formato: "9:16" | "16:9"): number {
  const emPe = v.height > v.width;
  const orientacao = (formato === "9:16") === emPe ? 3 : 0;
  const dur = v.duration >= 5 && v.duration <= 30 ? 2 : v.duration >= 3 ? 0.5 : -5;
  const res = Math.min(v.width, v.height) >= 1080 ? 1 : 0;
  return orientacao + dur + res;
}

async function buscarNoPexels(consulta: string, formato: "9:16" | "16:9"): Promise<VideoPexels[]> {
  const q = new URLSearchParams({ query: consulta, orientation: formato === "9:16" ? "portrait" : "landscape", size: "medium", per_page: "15" });
  const r = await fetch(`https://api.pexels.com/videos/search?${q}`, { headers: { Authorization: process.env.PEXELS_API_KEY ?? "" }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`Pexels respondeu HTTP ${r.status}`);
  const j = (await r.json()) as { videos?: VideoPexels[] };
  let lista = j.videos ?? [];
  // Pouca coisa em pé: completa com os deitados (o worker reenquadra).
  if (lista.length < 3) {
    const q2 = new URLSearchParams({ query: consulta, size: "medium", per_page: "15" });
    const r2 = await fetch(`https://api.pexels.com/videos/search?${q2}`, { headers: { Authorization: process.env.PEXELS_API_KEY ?? "" }, signal: AbortSignal.timeout(20_000) });
    if (r2.ok) lista = [...lista, ...(((await r2.json()) as { videos?: VideoPexels[] }).videos ?? [])];
  }
  return lista;
}

// ─────────────────────────────── Pixabay ───────────────────────────────

type ArquivoPixabay = { url?: string; width?: number; height?: number; size?: number; thumbnail?: string };
export type VideoPixabay = {
  id: number;
  pageURL?: string;
  type?: string;
  tags?: string;
  duration?: number;
  videos?: Partial<Record<"large" | "medium" | "small" | "tiny", ArquivoPixabay>>;
  user_id?: number;
  user?: string;
};

/**
 * Um vídeo do Pixabay no formato do Pexels, para a mesma nota e a mesma
 * escolha de arquivo: as quatro versões viram `video_files` (as vazias, como o
 * "large" que não existe, ficam de fora) e o tamanho do vídeo é o da maior.
 */
export function doPixabay(v: VideoPixabay): VideoPexels {
  const arquivos: ArquivoPexels[] = [];
  for (const q of ["large", "medium", "small", "tiny"] as const) {
    const a = v.videos?.[q];
    if (a?.url && a.width && a.height) arquivos.push({ quality: q, file_type: "video/mp4", width: a.width, height: a.height, link: a.url });
  }
  const maior = arquivos.reduce<ArquivoPexels | null>((m, f) => (!m || f.width! * f.height! > m.width! * m.height! ? f : m), null);
  const autor = String(v.user ?? "").trim();
  return {
    id: v.id,
    width: maior?.width ?? 0,
    height: maior?.height ?? 0,
    duration: Number(v.duration) || 0,
    url: v.pageURL ?? `https://pixabay.com/videos/id-${v.id}/`,
    user: autor ? { name: autor, url: v.user_id ? `https://pixabay.com/users/${autor}-${v.user_id}/` : undefined } : undefined,
    video_files: arquivos,
  };
}

/** A resposta da busca de vídeos do Pixabay, já no formato do Pexels. */
export function lerRespostaDoPixabay(j: unknown): VideoPexels[] {
  const hits = (j as { hits?: VideoPixabay[] } | null)?.hits;
  if (!Array.isArray(hits)) return [];
  return hits.filter((h) => h && typeof h.id === "number").map(doPixabay).filter((v) => v.video_files?.length);
}

/** O cache de 24 h das buscas (os termos da API pedem): a mesma consulta não volta ao Pixabay no mesmo dia. */
const buscasDoPixabay = new Map<string, { quando: number; lista: VideoPexels[] }>();
const DIA_MS = 24 * 60 * 60 * 1000;

async function buscarNoPixabay(consulta: string): Promise<VideoPexels[]> {
  const guardada = buscasDoPixabay.get(consulta);
  if (guardada && Date.now() - guardada.quando < DIA_MS) return guardada.lista;
  // Sem filtro de orientação na API de vídeo: vêm 50, e a nota põe os em pé na frente no 9:16.
  const q = new URLSearchParams({ key: process.env.PIXABAY_API_KEY ?? "", q: consulta.slice(0, 100), video_type: "film", safesearch: "true", per_page: "50" });
  const r = await fetch(`https://pixabay.com/api/videos/?${q}`, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`Pixabay respondeu HTTP ${r.status}`);
  const lista = lerRespostaDoPixabay(await r.json());
  buscasDoPixabay.set(consulta, { quando: Date.now(), lista });
  return lista;
}

type Guarda = {
  ler: (chave: string) => Promise<BrollEscolhido | null>;
  gravar: (chave: string, dados: BrollEscolhido) => Promise<void>;
  /** Copia o arquivo de vídeo para o nosso lado e devolve a URL (ou o caminho local). */
  arquivo: (nome: string, dados: Buffer) => Promise<string>;
};

/**
 * Os B-rolls que SOBREVIVEM à resolução: a edição resolvida com todo B-roll
 * presente (mídia de mentira) diz quais ganham plano; só esses são buscados
 * (e pagos, no gerador). `resolver` é a resolução do chamador (corte ou completo).
 */
export function brollsQueCabem(e: EdicaoDoEditor, insercoes: Record<string, MidiaDaInsercao>, resolver: (ins: Record<string, MidiaDaInsercao>) => { planos: Array<{ tipo: string; midia?: string }> }): string[] {
  const falsos: Record<string, MidiaDaInsercao> = { ...insercoes };
  (e.broll ?? []).forEach((b, k) => {
    const id = String(b.id ?? `b${k + 1}`).replace(/[^a-z0-9-]/gi, "") || `b${k + 1}`;
    falsos[id] = { url: "", tipo: "video", origem: "banco" };
  });
  const ids = new Set((e.broll ?? []).map((b, k) => String(b.id ?? `b${k + 1}`).replace(/[^a-z0-9-]/gi, "") || `b${k + 1}`));
  return resolver(falsos).planos.filter((p) => p.tipo === "insercao" && p.midia && ids.has(p.midia)).map((p) => p.midia!);
}

/** O cache no Blob (a esteira). */
export function guardaNoBlob(): Guarda {
  const caminho = (chave: string) => `editor-sob-medida/broll/${chave}`;
  return {
    async ler(chave) {
      try {
        const meta = await head(caminho(`${chave}.json`), { token: midiaProduzida().token });
        const r = await fetch(meta.url, { cache: "no-store" });
        return r.ok ? ((await r.json()) as BrollEscolhido) : null;
      } catch {
        return null;
      }
    },
    async gravar(chave, dados) {
      await put(caminho(`${chave}.json`), JSON.stringify(dados), { ...midiaProduzida(), contentType: "application/json", addRandomSuffix: false, allowOverwrite: true });
    },
    async arquivo(nome, dados) {
      return (await put(caminho(nome), dados, { ...midiaProduzida(), contentType: "video/mp4", addRandomSuffix: false, allowOverwrite: true })).url;
    },
  };
}

const GUARDA_DO_BROLL =
  " Documentary b-roll, real-world footage look, natural light, shallow depth of field, steady slow camera push-in. No recognizable person and no face: people only as hands, from behind or far away. No text, no letters, no logos, no watermark.";

/** Sem banco: a consulta vira 3 s no Kling Pro da Higgsfield, e espera ficar pronto. */
async function brollPelaHiggsfield(consulta: string, formato: "9:16" | "16:9", referencia: string, projectId: string | null | undefined, esperarMs: number): Promise<BrollEscolhido | null> {
  const { pedirGeracao, concluirSePronto } = await import("@/lib/media/higgsfield");
  const prompt = `${consulta}.${GUARDA_DO_BROLL}`;
  const chave = `broll-pro-${createHash("sha1").update(`${prompt}|${formato}`).digest("hex").slice(0, 12)}`;
  const g = await pedirGeracao({ modelo: "kling-pro", prompt, segundos: 3, proporcao: formato, referencia, chave });
  const limite = Date.now() + esperarMs;
  for (;;) {
    const p = await concluirSePronto(referencia, chave, { projectId: projectId ?? undefined, operation: "editor-sob-medida-broll" });
    if (p?.blobUrl) return { url: p.blobUrl, tipo: "video", origem: "banco", inicio: 0, consulta, fonte: "higgsfield", custoUsd: g.custoEstimadoUsd, credito: "gerado (Higgsfield)" };
    if (p && ["failed", "nsfw", "canceled", "cancelled"].includes(p.status ?? "")) return null;
    if (Date.now() > limite) return null;
    await new Promise((r) => setTimeout(r, 10_000));
  }
}

const MODELO_FAL = "fal-ai/kling-video/v2.5-turbo/pro/text-to-video";

/** Sem banco e sem Higgsfield: 5 s no Kling 2.5 Turbo Pro do fal.ai, esperando ficar pronto. */
async function brollPeloFal(consulta: string, formato: "9:16" | "16:9", guarda: Guarda, chave: string, projectId: string | null | undefined, esperarMs: number): Promise<BrollEscolhido | null> {
  const cab = { Authorization: `Key ${process.env.FAL_KEY}`, "content-type": "application/json" };
  const r = await fetch(`https://queue.fal.run/${MODELO_FAL}`, {
    method: "POST",
    headers: cab,
    body: JSON.stringify({ prompt: `${consulta}.${GUARDA_DO_BROLL}`, duration: "5", aspect_ratio: formato, negative_prompt: "text, watermark, logo, face close-up, blur, distortion" }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`fal.ai recusou o B-roll (HTTP ${r.status}): ${(await r.text()).slice(0, 160)}`);
  const d = (await r.json()) as { status_url?: string; response_url?: string };
  if (!d.status_url || !d.response_url) throw new Error("fal.ai não devolveu o pedido");
  const limite = Date.now() + esperarMs;
  for (;;) {
    await new Promise((ok) => setTimeout(ok, 8_000));
    const st = (await (await fetch(d.status_url, { headers: cab, signal: AbortSignal.timeout(30_000) })).json()) as { status?: string };
    if (st.status === "COMPLETED") break;
    if (Date.now() > limite) return null;
  }
  const res = (await (await fetch(d.response_url, { headers: cab, signal: AbortSignal.timeout(60_000) })).json()) as { video?: { url?: string } };
  if (!res.video?.url) return null;
  const v = await fetch(res.video.url, { signal: AbortSignal.timeout(120_000) });
  if (!v.ok) return null;
  const url = await guarda.arquivo(`${chave}.mp4`, Buffer.from(await v.arrayBuffer()));
  const custoUsd = 0.35;
  const { gravarCustoDeVideo } = await import("@/lib/media/usage");
  gravarCustoDeVideo(MODELO_FAL, custoUsd, { projectId: projectId ?? undefined, operation: "editor-sob-medida-broll" });
  return { url, tipo: "video", origem: "banco", inicio: 0.6, consulta, fonte: "fal", custoUsd, credito: "gerado (fal.ai, Kling 2.5)" };
}

/**
 * OS B-ROLLS que o editor pediu, já escolhidos e copiados para o nosso lado
 * (o Pexels e o Pixabay pedem que não se use o link deles direto). Cada id do editor vira
 * uma entrada de `insercoes` com `origem: "banco"`. Um vídeo do banco nunca
 * se repete na mesma edição.
 */
export async function gerarBrolls(
  e: EdicaoDoEditor,
  o: { formato: "9:16" | "16:9"; projectId?: string | null; referencia: string; guarda?: Guarda; teto?: number; esperarMs?: number; prazoMs?: number; so?: string[] }
): Promise<{ insercoes: Record<string, MidiaDaInsercao>; custoUsd: number; erros: string[]; fonte: FonteDoBroll | null; creditos: string[] }> {
  const insercoes: Record<string, MidiaDaInsercao> = {};
  const erros: string[] = [];
  const creditos: string[] = [];
  let custo = 0;
  const idDe = (b: { id?: string }, k: number) => String(b.id ?? `b${k + 1}`).replace(/[^a-z0-9-]/gi, "") || `b${k + 1}`;
  const pedidos = (e.broll ?? [])
    .map((b, k) => ({ ...b, id: idDe(b, k) }))
    // `so` poupa só o que é PAGO (gerador): do banco, grátis, vem tudo, e o B-roll que
    // a resolução derrubou volta sozinho se a revisão tirar a peça que o atrapalhava.
    .filter((b) => limparConsulta(b.consulta) && (!o.so || ehBanco(fonteDoBroll()) || o.so.includes(b.id)))
    .slice(0, o.teto ?? 40);
  if (!pedidos.length) return { insercoes, custoUsd: 0, erros, fonte: null, creditos };
  const fonte = fonteDoBroll();
  if (!fonte) return { insercoes, custoUsd: 0, erros: ["sem PEXELS_API_KEY nem PIXABAY_API_KEY: edição sem B-roll"], fonte: null, creditos };
  const guarda = o.guarda ?? guardaNoBlob();
  const usados = new Set<string>();
  const vezes = new Map<string, number>();
  const itens = pedidos.map((b, k) => {
    const consulta = limparConsulta(b.consulta);
    const n = vezes.get(consulta) ?? 0;
    vezes.set(consulta, n + 1);
    void k;
    return { id: b.id, consulta, n, chave: createHash("sha1").update(`${fonte}|${consulta}|${o.formato}|${n}`).digest("hex").slice(0, 16) };
  });
  const um = async ({ id, consulta, n, chave }: (typeof itens)[number]) => {
    try {
      let escolhido = await guarda.ler(chave);
      if (!escolhido) {
        if (fonte === "higgsfield" || fonte === "fal") {
          escolhido =
            fonte === "fal"
              ? await brollPeloFal(consulta, o.formato, guarda, chave, o.projectId, o.esperarMs ?? 600_000)
              : await brollPelaHiggsfield(consulta, o.formato, `${o.referencia}-broll`, o.projectId, o.esperarMs ?? 600_000);
          if (escolhido) custo += escolhido.custoUsd;
        } else {
          const lista = (fonte === "pixabay" ? await buscarNoPixabay(consulta) : await buscarNoPexels(consulta, o.formato)).filter((v) => !usados.has(`${fonte}-${v.id}`));
          const ordem = lista.map((v) => ({ v, nota: notaDoVideo(v, o.formato), arq: melhorArquivo(v, o.formato) })).filter((x) => x.arq && x.nota > 0).sort((a, b) => b.nota - a.nota);
          const melhor = ordem[n] ?? ordem[0];
          if (melhor?.arq?.link) {
            const r = await fetch(melhor.arq.link, { signal: AbortSignal.timeout(90_000) });
            if (!r.ok) throw new Error(`download do ${fonte === "pixabay" ? "Pixabay" : "Pexels"} HTTP ${r.status}`);
            const url = await guarda.arquivo(`${chave}.mp4`, Buffer.from(await r.arrayBuffer()));
            const v = melhor.v;
            escolhido = {
              url,
              tipo: "video",
              origem: "banco",
              // O começo limpo: pula o primeiro segundo (o fade do autor) quando o vídeo tem folga.
              inicio: v.duration >= 7 ? 1.5 : v.duration >= 5 ? 0.8 : 0,
              consulta,
              fonte,
              custoUsd: 0,
              credito:
                fonte === "pixabay"
                  ? `Vídeo de ${v.user?.name ?? "autor"} no Pixabay (${v.url})`
                  : `Vídeo de ${v.user?.name ?? "autor"} no Pexels (${v.url ?? `https://www.pexels.com/video/${v.id}/`})`,
            };
            usados.add(`${fonte}-${v.id}`);
          }
        }
        if (escolhido) await guarda.gravar(chave, escolhido);
      }
      if (!escolhido) {
        erros.push(`${id}: nada no banco para "${consulta}"`);
        return;
      }
      insercoes[id] = { url: escolhido.url, tipo: "video", origem: "banco", inicio: escolhido.inicio ?? 0, credito: escolhido.credito };
      if (escolhido.credito) creditos.push(escolhido.credito);
    } catch (err) {
      erros.push(`${id}: ${err instanceof Error ? err.message.slice(0, 140) : err}`);
    }
  };
  // Os bancos em série (a ordem decide quem leva o melhor vídeo; o Pexels tem 200
  // pedidos por hora, o Pixabay 100 por minuto); os geradores em paralelo (cada um espera minutos).
  const prazo = Date.now() + (o.prazoMs ?? Infinity);
  if (ehBanco(fonte))
    for (const it of itens) {
      // O prazo da passada: o que não coube fica sem B-roll (a edição segue).
      if (Date.now() > prazo) {
        erros.push(`${itens.length - itens.indexOf(it)} B-roll(s) ficaram de fora pelo prazo`);
        break;
      }
      await um(it);
    }
  else await Promise.all(itens.map(um));
  return { insercoes, custoUsd: +custo.toFixed(4), erros, fonte, creditos };
}
