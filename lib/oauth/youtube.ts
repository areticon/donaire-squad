/**
 * YouTube pela Data API v3, com OAuth próprio do Google.
 *
 * Não reusa o cliente OAuth do login: o escopo de envio
 * (youtube.upload) é sensível e verificado separadamente pelo Google, e
 * misturar os dois faria a tela de login pedir permissão de canal a quem só
 * quer entrar. Projeto e credenciais separados no Google Cloud.
 *
 * O refresh token só vem com access_type=offline e prompt=consent, e o
 * Google só o entrega NA PRIMEIRA autorização: reconexão sem prompt=consent
 * volta sem refresh token e a conexão morre em 1 hora. Por isso o consent
 * forçado aqui, mesmo custando uma tela a mais.
 *
 * Cota (verificada em 21/08/2026): desde junho de 2026 o envio tem cota
 * própria de 100 vídeos/dia por projeto, fora do pool de 10.000 unidades.
 * Com 30 clientes a 1 vídeo/semana são ~4/dia. Não é gargalo.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD = "https://www.googleapis.com/upload/youtube/v3/videos";

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
].join(" ");

export function youtubeConfigured(): boolean {
  return Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET);
}

export function getYouTubeAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: YOUTUBE_SCOPES,
    state,
    access_type: "offline",
    prompt: "consent",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeYouTubeCode(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    }),
  });
  if (!res.ok) throw new Error(`YouTube token exchange failed: ${await res.text()}`);
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  if (!json.refresh_token) {
    // Sem refresh token a conexão morre em 1h. Melhor falhar aqui, com o
    // usuário na frente da tela, do que na primeira publicação agendada.
    throw new Error(
      "YouTube não devolveu refresh token. Desconecte o app em myaccount.google.com/permissions e conecte de novo."
    );
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
  };
}

export async function refreshYouTubeToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: Date }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`YouTube token refresh failed: ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  return {
    accessToken: json.access_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
  };
}

export async function getYouTubeChannel(accessToken: string): Promise<{
  channelId: string;
  title: string;
  avatarUrl: string | null;
}> {
  const res = await fetch(`${API}/channels?part=snippet&mine=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`YouTube channel failed: ${await res.text()}`);
  const json = (await res.json()) as {
    items?: Array<{
      id: string;
      snippet?: { title?: string; thumbnails?: { default?: { url?: string } } };
    }>;
  };
  const ch = json.items?.[0];
  if (!ch) {
    throw new Error(
      "Esta conta do Google não tem canal no YouTube. Crie o canal antes de conectar."
    );
  }
  return {
    channelId: ch.id,
    title: ch.snippet?.title ?? "Canal",
    avatarUrl: ch.snippet?.thumbnails?.default?.url ?? null,
  };
}

/**
 * Envia um vídeo. Upload resumable em duas pernas: abre a sessão com os
 * metadados, envia os bytes na URL que ela devolve. É o caminho que a doc
 * recomenda e o único que sobrevive a vídeo grande.
 *
 * `privacyStatus` nasce "public". Até 02/09 nascia "unlisted", com a premissa
 * de que o Google forçaria "private" em app não verificado e o valor seria só
 * intenção. Os dois primeiros vídeos publicados pelo Bruno derrubaram isso:
 * saíram exatamente como mandamos, não listados, e ele procurou o vídeo no
 * canal e não achou. O botão diz "Publicar"; publicar é público.
 *
 * O corpo aceita FLUXO, e não só bytes na memória, porque a gravação de um
 * cliente é grande de verdade: a do Bruno tem 850 MB, e carregar isso num
 * ArrayBuffer derruba a função por memória antes de qualquer byte subir. Com
 * fluxo, o arquivo atravessa sem nunca existir inteiro na memória.
 *
 * `contentLength` é obrigatório e não sai do fluxo: o upload resumable exige
 * saber o tamanho na abertura da sessão, então quem chama precisa ter medido
 * antes (no cabeçalho da resposta do storage, ou no tamanho do buffer).
 */
export async function publishYouTubeVideo(
  accessToken: string,
  video: {
    body: ReadableStream<Uint8Array> | ArrayBuffer;
    contentLength: number;
    mimeType: string;
  },
  meta: { title: string; description: string; privacyStatus?: "public" | "unlisted" | "private" }
): Promise<{ videoId: string; url: string }> {
  const start = await fetch(`${UPLOAD}?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": video.mimeType,
      "X-Upload-Content-Length": String(video.contentLength),
    },
    body: JSON.stringify({
      snippet: {
        // O título aceita no máximo 100 caracteres e recusa "<" e ">".
        title: meta.title.replace(/[<>]/g, "").slice(0, 100),
        description: meta.description.slice(0, 5000),
      },
      status: { privacyStatus: meta.privacyStatus ?? "public" },
    }),
  });
  if (!start.ok) throw new Error(`YouTube upload start failed: ${await start.text()}`);
  const sessionUrl = start.headers.get("location");
  if (!sessionUrl) throw new Error("YouTube upload: sessão sem URL de envio");

  const up = await fetch(sessionUrl, {
    method: "PUT",
    headers: {
      "Content-Type": video.mimeType,
      // Obrigatório quando o corpo é fluxo: sem isto o fetch tentaria
      // "chunked", que o endpoint resumable do Google recusa.
      "Content-Length": String(video.contentLength),
    },
    body: video.body,
    // `duplex` é exigido pelo fetch do Node sempre que o corpo é um fluxo.
    // Sem ele a chamada falha na hora, com erro que não menciona vídeo nenhum.
    ...(video.body instanceof ArrayBuffer ? {} : { duplex: "half" }),
    // Vídeo de cliente pode ser grande; o timeout cobre o upload inteiro.
    signal: AbortSignal.timeout(600_000),
  } as RequestInit);
  const text = await up.text();
  if (!up.ok) throw new Error(`YouTube upload failed (${up.status}): ${text.slice(0, 400)}`);
  const json = JSON.parse(text) as { id?: string };
  if (!json.id) throw new Error(`YouTube upload: resposta sem id (${text.slice(0, 300)})`);
  return { videoId: json.id, url: `https://www.youtube.com/watch?v=${json.id}` };
}

/**
 * Define a capa (thumbnail) de um vídeo já enviado.
 *
 * Existe desde 02/09: até então o completo subia SEM capa, e o YouTube
 * escolhia um quadro qualquer. Vale para vídeo recém-enviado e para vídeo
 * já publicado, então serve tanto na publicação quanto quando o cliente troca
 * a capa depois.
 *
 * O YouTube só aceita capa personalizada em canal VERIFICADO por telefone.
 * Canal sem verificação responde 403 com "forbidden", e isso não é falha da
 * publicação: o vídeo está no ar, só ficou sem a capa escolhida. Quem chama
 * trata como aviso, nunca como erro.
 *
 * Limites da API: JPEG ou PNG, até 2 MB, 16:9 com 1280x720 recomendado.
 */
export async function setYouTubeThumbnail(
  accessToken: string,
  videoId: string,
  imagem: { bytes: Buffer; mimeType: string }
): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": imagem.mimeType,
        "Content-Length": String(imagem.bytes.byteLength),
      },
      body: new Uint8Array(imagem.bytes),
      signal: AbortSignal.timeout(60_000),
    }
  );
  if (!res.ok) {
    const texto = await res.text();
    if (res.status === 403) {
      throw new Error(
        "O YouTube só aceita capa personalizada em canal verificado por telefone (youtube.com/verify). O vídeo está no ar sem a capa escolhida."
      );
    }
    throw new Error(`YouTube thumbnail failed (${res.status}): ${texto.slice(0, 300)}`);
  }
}
