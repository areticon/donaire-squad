import crypto from "crypto";

/**
 * Instagram pela "API do Instagram com login do Instagram" (Meta, 2024+).
 *
 * Por que esta variante e não a clássica com login do Facebook: ela dispensa
 * página do Facebook vinculada. O cliente conecta a conta profissional
 * (Business ou Creator) direto, no mesmo gesto dos outros conectores.
 *
 * As três pegadinhas que moldaram este arquivo:
 *
 * 1. O token curto dura 1 hora. O longo dura ~60 dias e não vem por refresh
 *    token: troca-se o curto pelo longo na hora do callback, e renova-se o
 *    longo com `refresh_access_token` ANTES de expirar (e só depois de 24h de
 *    idade). Token expirado não renova: o cliente reconecta do zero.
 *
 * 2. A Meta busca a mídia por URL pública. Imagem em data URL ou em Blob
 *    privado não alcança; quem resolve é a rota pública temporária em
 *    /api/media/ig/[token], com HMAC para não ser adivinhável.
 *
 * 3. Publicar é sempre em dois passos (criar container, publicar container),
 *    e carrossel são três (containers filhos, container pai, publicar).
 */

const AUTH_URL = "https://www.instagram.com/oauth/authorize";
const TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const GRAPH = "https://graph.instagram.com";
const GRAPH_V = `${GRAPH}/v23.0`;

export const INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
].join(",");

/** Legenda acima disso a API recusa. */
export const INSTAGRAM_MAX_CAPTION = 2200;

export function instagramConfigured(): boolean {
  return Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET);
}

export function getInstagramAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: INSTAGRAM_SCOPES,
    state,
    // Sem estes dois, quem tem sessão do Facebook no navegador cai no fluxo
    // errado (o de página) e o login de conta profissional nem aparece.
    enable_fb_login: "0",
    force_authentication: "1",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

/** Troca o code pelo token curto e este pelo longo, numa chamada só daqui. */
export async function exchangeInstagramCode(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; expiresAt: Date; userId: string }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.INSTAGRAM_APP_ID!,
      client_secret: process.env.INSTAGRAM_APP_SECRET!,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    }),
  });
  if (!res.ok) {
    throw new Error(`Instagram token exchange failed: ${await res.text()}`);
  }
  const short = (await res.json()) as { access_token: string; user_id: string | number };

  const longRes = await fetch(
    `${GRAPH}/access_token?grant_type=ig_exchange_token&client_secret=${process.env.INSTAGRAM_APP_SECRET}&access_token=${short.access_token}`
  );
  if (!longRes.ok) {
    throw new Error(`Instagram long-lived exchange failed: ${await longRes.text()}`);
  }
  const long = (await longRes.json()) as { access_token: string; expires_in: number };

  return {
    accessToken: long.access_token,
    expiresAt: new Date(Date.now() + long.expires_in * 1000),
    userId: String(short.user_id),
  };
}

/**
 * Renova o token longo. Exige token com mais de 24h de idade e ainda válido.
 * Falhou? O chamador segue com o token atual; se este morrer, é reconexão.
 */
export async function refreshInstagramToken(
  accessToken: string
): Promise<{ accessToken: string; expiresAt: Date }> {
  const res = await fetch(
    `${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${accessToken}`
  );
  if (!res.ok) {
    throw new Error(`Instagram token refresh failed: ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  return {
    accessToken: json.access_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
  };
}

export async function getInstagramProfile(accessToken: string): Promise<{
  userId: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
}> {
  const res = await fetch(
    `${GRAPH_V}/me?fields=user_id,username,name,profile_picture_url&access_token=${accessToken}`
  );
  if (!res.ok) {
    throw new Error(`Instagram profile failed: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    id: string;
    user_id?: string | number;
    username: string;
    name?: string;
    profile_picture_url?: string;
  };
  return {
    userId: String(json.user_id ?? json.id),
    username: json.username,
    name: json.name ?? null,
    avatarUrl: json.profile_picture_url ?? null,
  };
}

async function igPost(path: string, accessToken: string, body: Record<string, string>) {
  const res = await fetch(`${GRAPH_V}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...body, access_token: accessToken }),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Instagram ${path} failed (${res.status}): ${text.slice(0, 400)}`);
  const json = JSON.parse(text) as { id?: string };
  if (!json.id) throw new Error(`Instagram ${path}: resposta sem id (${text.slice(0, 300)})`);
  return json.id;
}

/**
 * Espera o container ficar pronto. Imagem costuma sair FINISHED de imediato,
 * mas a doc manda checar, e a regra da casa é medir o que voltou. Vídeo pode
 * levar minutos; o timeout aqui cobre imagem e carrossel com folga.
 */
async function waitForContainer(
  containerId: string,
  accessToken: string,
  timeoutMs = 90_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await fetch(
      `${GRAPH_V}/${containerId}?fields=status_code&access_token=${accessToken}`
    );
    if (res.ok) {
      const { status_code } = (await res.json()) as { status_code?: string };
      if (status_code === "FINISHED") return;
      if (status_code === "ERROR" || status_code === "EXPIRED") {
        throw new Error(`Instagram container ${containerId}: status ${status_code}`);
      }
    }
    if (Date.now() > deadline) {
      throw new Error(`Instagram container ${containerId}: timeout aguardando processamento`);
    }
    await new Promise((r) => setTimeout(r, 3_000));
  }
}

async function fetchPermalink(mediaId: string, accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${GRAPH_V}/${mediaId}?fields=permalink&access_token=${accessToken}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { permalink?: string };
    return json.permalink ?? null;
  } catch {
    return null;
  }
}

/**
 * Publica uma imagem única no feed. `imageUrl` precisa ser https público.
 */
export async function publishInstagramImage(
  accessToken: string,
  igUserId: string,
  imageUrl: string,
  caption: string
): Promise<{ mediaId: string; url: string | null }> {
  const containerId = await igPost(`${igUserId}/media`, accessToken, {
    image_url: imageUrl,
    caption: caption.slice(0, INSTAGRAM_MAX_CAPTION),
  });
  await waitForContainer(containerId, accessToken);
  const mediaId = await igPost(`${igUserId}/media_publish`, accessToken, {
    creation_id: containerId,
  });
  return { mediaId, url: await fetchPermalink(mediaId, accessToken) };
}

/** Publica carrossel de 2 a 10 imagens, todas https públicas. */
export async function publishInstagramCarousel(
  accessToken: string,
  igUserId: string,
  imageUrls: string[],
  caption: string
): Promise<{ mediaId: string; url: string | null }> {
  if (imageUrls.length < 2 || imageUrls.length > 10) {
    throw new Error(`Instagram carrossel exige de 2 a 10 imagens, recebi ${imageUrls.length}`);
  }
  const children: string[] = [];
  for (const url of imageUrls) {
    const childId = await igPost(`${igUserId}/media`, accessToken, {
      image_url: url,
      is_carousel_item: "true",
    });
    children.push(childId);
  }
  await Promise.all(children.map((c) => waitForContainer(c, accessToken)));

  const containerId = await igPost(`${igUserId}/media`, accessToken, {
    media_type: "CAROUSEL",
    children: children.join(","),
    caption: caption.slice(0, INSTAGRAM_MAX_CAPTION),
  });
  await waitForContainer(containerId, accessToken);
  const mediaId = await igPost(`${igUserId}/media_publish`, accessToken, {
    creation_id: containerId,
  });
  return { mediaId, url: await fetchPermalink(mediaId, accessToken) };
}

/* ── URL pública temporária da mídia ─────────────────────────────────────
 *
 * A Meta busca a imagem por URL. Quando a imagem vive como data URL no banco
 * (caso das geradas pelo Gemini), servimos por /api/media/ig/[token], onde o
 * token é `payload.assinatura`: o payload identifica post e índice da imagem,
 * e a assinatura HMAC com o segredo do servidor impede enumerar posts alheios.
 * Sem tabela nova, sem migration, e o token morre junto com a imagem quando o
 * post publicado tem a imageUrl limpa.
 */

function igMediaSecret(): string {
  const s = process.env.BETTER_AUTH_SECRET;
  if (!s) throw new Error("BETTER_AUTH_SECRET ausente para assinar URL de mídia");
  return s;
}

function signIgMediaPayload(payload: string): string {
  return crypto.createHmac("sha256", igMediaSecret()).update(payload).digest("base64url");
}

export function buildIgMediaToken(postId: string, index: number): string {
  const payload = Buffer.from(`${postId}:${index}`).toString("base64url");
  return `${payload}.${signIgMediaPayload(payload)}`;
}

export function buildIgMediaPublicUrl(postId: string, index: number): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  return `${appUrl}/api/media/ig/${buildIgMediaToken(postId, index)}`;
}

export function verifyIgMediaToken(token: string): { postId: string; index: number } | null {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = signIgMediaPayload(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const decoded = Buffer.from(payload, "base64url").toString("utf8");
  const sep = decoded.lastIndexOf(":");
  if (sep === -1) return null;
  const index = Number(decoded.slice(sep + 1));
  if (!Number.isInteger(index) || index < 0) return null;
  return { postId: decoded.slice(0, sep), index };
}

/* ── Webhooks de desautorização e exclusão de dados ──────────────────────
 *
 * A Meta manda um `signed_request` (base64url do payload + assinatura HMAC
 * com o app secret). Verificar a assinatura não é opcional: sem isso qualquer
 * um poderia desativar a conexão de qualquer cliente com um POST.
 */
export function parseSignedRequest(
  signedRequest: string
): { user_id?: string; [k: string]: unknown } | null {
  const [sig, payload] = signedRequest.split(".", 2);
  if (!sig || !payload) return null;
  const expected = crypto
    .createHmac("sha256", process.env.INSTAGRAM_APP_SECRET!)
    .update(payload)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
