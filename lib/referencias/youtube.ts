import { createSign } from "crypto";
import { getGCPCredentials } from "@/lib/media/google-auth";
import type { PostDeReferencia } from "@/lib/referencias/tipos";

/**
 * O YOUTUBE PELA API OFICIAL (01/10), no trilho de referências.
 *
 * A YouTube Data API lê números públicos de qualquer canal de graça (10 mil
 * unidades por dia; `channels.list` e `videos.list` custam 1, `search.list`
 * custa 100). Duas formas de entrar, nesta ordem:
 *   1. YOUTUBE_API_KEY, uma chave de API do Google com a YouTube Data API
 *      liberada (a chave do Gemini é restrita: medido em 01/10, 403);
 *   2. a conta de serviço do Google (GOOGLE_APPLICATION_CREDENTIALS_JSON),
 *      com o escopo de leitura do YouTube, se a API estiver ligada no projeto.
 */

const API = "https://www.googleapis.com/youtube/v3";
let tokenGuardado: { token: string; expira: number } | null = null;

async function tokenDaContaDeServico(): Promise<string | null> {
  if (tokenGuardado && tokenGuardado.expira > Date.now() + 60_000) return tokenGuardado.token;
  const cred = getGCPCredentials();
  if (!cred) return null;
  const agora = Math.floor(Date.now() / 1000);
  const cabeca = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const corpo = Buffer.from(
    JSON.stringify({
      iss: cred.client_email,
      scope: "https://www.googleapis.com/auth/youtube.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: agora,
      exp: agora + 3600,
    })
  ).toString("base64url");
  const assinador = createSign("RSA-SHA256");
  assinador.update(`${cabeca}.${corpo}`);
  const jwt = `${cabeca}.${corpo}.${assinador.sign(cred.private_key, "base64url")}`;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  }).catch(() => null);
  if (!r?.ok) return null;
  const j = (await r.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) return null;
  tokenGuardado = { token: j.access_token, expira: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return j.access_token;
}

async function chamar<T>(caminho: string, params: Record<string, string>): Promise<T | null> {
  const chave = process.env.YOUTUBE_API_KEY;
  const qs = new URLSearchParams(params);
  if (chave) qs.set("key", chave);
  const headers: Record<string, string> = {};
  if (!chave) {
    const token = await tokenDaContaDeServico();
    if (!token) return null;
    headers.Authorization = `Bearer ${token}`;
  }
  const r = await fetch(`${API}/${caminho}?${qs}`, { headers, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!r?.ok) {
    if (r) console.warn(`[referencias][youtube] ${caminho} ${r.status}`);
    return null;
  }
  return (await r.json()) as T;
}

/** "PT1M5S" para 65. */
function segundos(iso: string | undefined): number | null {
  const m = iso?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

type Canal = { id: string; snippet?: { title?: string; customUrl?: string }; statistics?: { subscriberCount?: string }; contentDetails?: { relatedPlaylists?: { uploads?: string } } };

/** O canal por @handle, link ou id. */
async function acharCanal(perfil: string): Promise<Canal | null> {
  const limpo = perfil.trim().replace(/^https?:\/\/(www\.)?youtube\.com\//, "").replace(/\/.*$/, "");
  const params: Record<string, string> = { part: "snippet,statistics,contentDetails" };
  if (/^UC[\w-]{20,}$/.test(limpo)) params.id = limpo;
  else params.forHandle = limpo.startsWith("@") ? limpo : `@${limpo}`;
  const r = await chamar<{ items?: Canal[] }>("channels", params);
  return r?.items?.[0] ?? null;
}

/** Os últimos vídeos de um canal, no formato único do trilho. */
export async function postsDoYoutube(perfil: string, maximo: number): Promise<PostDeReferencia[] | null> {
  const canal = await acharCanal(perfil);
  const uploads = canal?.contentDetails?.relatedPlaylists?.uploads;
  if (!canal || !uploads) return null;
  const lista = await chamar<{ items?: Array<{ contentDetails?: { videoId?: string } }> }>("playlistItems", {
    part: "contentDetails",
    playlistId: uploads,
    maxResults: String(Math.min(50, maximo)),
  });
  const ids = (lista?.items ?? []).map((i) => i.contentDetails?.videoId).filter(Boolean) as string[];
  if (!ids.length) return [];
  const videos = await chamar<{
    items?: Array<{
      id: string;
      snippet?: { title?: string; description?: string; publishedAt?: string };
      statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
      contentDetails?: { duration?: string };
    }>;
  }>("videos", { part: "snippet,statistics,contentDetails", id: ids.join(",") });
  const seguidores = canal.statistics?.subscriberCount ? Number(canal.statistics.subscriberCount) : null;
  return (videos?.items ?? []).map((v) => {
    const dur = segundos(v.contentDetails?.duration);
    return {
      rede: "youtube" as const,
      perfil: canal.snippet?.customUrl ?? perfil,
      externoId: v.id,
      url: `https://www.youtube.com/watch?v=${v.id}`,
      formato: dur !== null && dur <= 180 ? "short" : "video",
      legenda: `${v.snippet?.title ?? ""}\n${(v.snippet?.description ?? "").slice(0, 1500)}`,
      duracaoSeg: dur,
      publicadoEm: v.snippet?.publishedAt ?? null,
      curtidas: v.statistics?.likeCount ? Number(v.statistics.likeCount) : null,
      comentarios: v.statistics?.commentCount ? Number(v.statistics.commentCount) : null,
      visualizacoes: v.statistics?.viewCount ? Number(v.statistics.viewCount) : null,
      compartilhamentos: null,
      seguidoresDoAutor: seguidores,
    };
  });
}

/**
 * Os números públicos de vídeos pelo id (até 50 por chamada, 1 unidade da
 * cota). Acrescentado em 01/10 para medir os vídeos do PRÓPRIO cliente
 * (lib/analytics/sincronizar.ts), reaproveitando a mesma autenticação. Null
 * quando a API não respondeu; vídeo privado ou apagado simplesmente não volta.
 */
export async function numerosDosVideos(ids: string[]): Promise<Map<string, { visualizacoes: number | null; curtidas: number | null; comentarios: number | null }> | null> {
  const mapa = new Map<string, { visualizacoes: number | null; curtidas: number | null; comentarios: number | null }>();
  for (let i = 0; i < ids.length; i += 50) {
    const r = await chamar<{ items?: Array<{ id: string; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }> }>("videos", {
      part: "statistics",
      id: ids.slice(i, i + 50).join(","),
    });
    if (!r) return null;
    for (const v of r.items ?? []) {
      const n = (x?: string) => (x === undefined ? null : Number(x));
      mapa.set(v.id, { visualizacoes: n(v.statistics?.viewCount), curtidas: n(v.statistics?.likeCount), comentarios: n(v.statistics?.commentCount) });
    }
  }
  return mapa;
}

/** Canais do nicho pela busca (100 unidades da cota por busca). */
export async function canaisDoNicho(termo: string, maximo = 5): Promise<Array<{ perfil: string; nome: string; seguidores: number | null }> | null> {
  const r = await chamar<{ items?: Array<{ snippet?: { channelId?: string; channelTitle?: string } }> }>("search", {
    part: "snippet",
    type: "channel",
    q: termo,
    regionCode: "BR",
    relevanceLanguage: "pt",
    maxResults: String(maximo),
  });
  if (!r) return null;
  const ids = (r.items ?? []).map((i) => i.snippet?.channelId).filter(Boolean) as string[];
  if (!ids.length) return [];
  const canais = await chamar<{ items?: Canal[] }>("channels", { part: "snippet,statistics", id: ids.join(",") });
  return (canais?.items ?? []).map((c) => ({
    perfil: c.snippet?.customUrl ?? c.id,
    nome: c.snippet?.title ?? c.id,
    seguidores: c.statistics?.subscriberCount ? Number(c.statistics.subscriberCount) : null,
  }));
}

/** Se a leitura do YouTube está disponível (chave ou conta de serviço). */
export async function youtubeDisponivel(): Promise<boolean> {
  if (process.env.YOUTUBE_API_KEY) return true;
  return Boolean(await acharCanal("@GoogleDevelopers"));
}
