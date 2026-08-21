/**
 * Facebook (páginas) pelo mesmo app da Meta do Instagram.
 *
 * A diferença estrutural para o Instagram: quem publica não é o usuário, é a
 * PÁGINA. O fluxo tem um passo a mais: depois do OAuth do usuário, lista-se
 * as páginas que ele administra em /me/accounts e guarda-se o token DE CADA
 * PÁGINA, que é o que o POST /{page_id}/feed aceita. Token de usuário no
 * feed da página é erro.
 *
 * Permissões (conferidas na doc em 21/08/2026): pages_show_list para listar,
 * pages_read_engagement e pages_manage_posts para publicar. O token de página
 * obtido a partir de um token de usuário de longa duração não expira por
 * tempo; morre por troca de senha, revogação ou auditoria da Meta, e nesse
 * caso a publicação falha com erro claro pedindo reconexão.
 */

const FB = "https://www.facebook.com/v23.0";
const GRAPH = "https://graph.facebook.com/v23.0";

export const FACEBOOK_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
].join(",");

export function facebookConfigured(): boolean {
  return Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
}

export function getFacebookAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.FACEBOOK_APP_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: FACEBOOK_SCOPES,
    state,
  });
  return `${FB}/dialog/oauth?${params.toString()}`;
}

/** Troca o code pelo token de usuário e este pelo de longa duração. */
export async function exchangeFacebookCode(
  code: string,
  redirectUri: string
): Promise<{ userToken: string }> {
  const res = await fetch(
    `${GRAPH}/oauth/access_token?` +
      new URLSearchParams({
        client_id: process.env.FACEBOOK_APP_ID!,
        client_secret: process.env.FACEBOOK_APP_SECRET!,
        redirect_uri: redirectUri,
        code,
      })
  );
  if (!res.ok) throw new Error(`Facebook token exchange failed: ${await res.text()}`);
  const short = (await res.json()) as { access_token: string };

  const longRes = await fetch(
    `${GRAPH}/oauth/access_token?` +
      new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: process.env.FACEBOOK_APP_ID!,
        client_secret: process.env.FACEBOOK_APP_SECRET!,
        fb_exchange_token: short.access_token,
      })
  );
  if (!longRes.ok) {
    throw new Error(`Facebook long-lived exchange failed: ${await longRes.text()}`);
  }
  const long = (await longRes.json()) as { access_token: string };
  return { userToken: long.access_token };
}

export interface FacebookPage {
  pageId: string;
  name: string;
  pageToken: string;
  avatarUrl: string | null;
}

/**
 * Páginas que a pessoa administra, cada uma com o próprio token. Vem só o que
 * a pessoa marcou na tela de consentimento: ela pode conceder uma página e
 * negar as outras, e lista vazia aqui é isso, não erro.
 */
export async function listFacebookPages(userToken: string): Promise<FacebookPage[]> {
  const res = await fetch(
    `${GRAPH}/me/accounts?fields=id,name,access_token,picture{url}&access_token=${userToken}`
  );
  if (!res.ok) throw new Error(`Facebook pages list failed: ${await res.text()}`);
  const json = (await res.json()) as {
    data?: Array<{
      id: string;
      name: string;
      access_token: string;
      picture?: { data?: { url?: string } };
    }>;
  };
  return (json.data ?? []).map((p) => ({
    pageId: p.id,
    name: p.name,
    pageToken: p.access_token,
    avatarUrl: p.picture?.data?.url ?? null,
  }));
}

async function fbPost(
  path: string,
  pageToken: string,
  body: Record<string, string>
): Promise<Record<string, unknown>> {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...body, access_token: pageToken }),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Facebook ${path} failed (${res.status}): ${text.slice(0, 400)}`);
  return JSON.parse(text) as Record<string, unknown>;
}

/** Post de texto no feed da página. */
export async function publishFacebookText(
  pageToken: string,
  pageId: string,
  message: string
): Promise<{ postId: string; url: string }> {
  const json = await fbPost(`${pageId}/feed`, pageToken, { message });
  const postId = String(json.id ?? "");
  if (!postId) throw new Error("Facebook feed: resposta sem id");
  return { postId, url: `https://www.facebook.com/${postId}` };
}

/**
 * Post com 1+ imagens. A imagem sobe como foto não publicada e o feed a
 * referencia por attached_media, que é o único jeito de juntar várias fotos
 * num post só. A Meta busca a imagem por URL pública, a mesma regra do
 * Instagram, então quem chama passa URLs já alcançáveis.
 */
export async function publishFacebookImagePost(
  pageToken: string,
  pageId: string,
  message: string,
  imageUrls: string[]
): Promise<{ postId: string; url: string }> {
  const mediaIds: string[] = [];
  for (const url of imageUrls) {
    const photo = await fbPost(`${pageId}/photos`, pageToken, {
      url,
      published: "false",
    });
    const id = String(photo.id ?? "");
    if (!id) throw new Error("Facebook photos: resposta sem id");
    mediaIds.push(id);
  }

  const body: Record<string, string> = { message };
  mediaIds.forEach((id, i) => {
    body[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id });
  });

  const json = await fbPost(`${pageId}/feed`, pageToken, body);
  const postId = String(json.id ?? "");
  if (!postId) throw new Error("Facebook feed: resposta sem id");
  return { postId, url: `https://www.facebook.com/${postId}` };
}
