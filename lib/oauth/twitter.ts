import crypto from "crypto";

const AUTH_URL = "https://twitter.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.twitter.com/2/oauth2/token";
const USERINFO_URL = "https://api.twitter.com/2/users/me";
const TWEETS_URL = "https://api.twitter.com/2/tweets";
const MEDIA_UPLOAD_URL = "https://upload.twitter.com/1/media/upload.json";

export function generatePKCE() {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}

export function getTwitterAuthUrl(
  redirectUri: string,
  state: string,
  codeChallenge: string
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.TWITTER_CLIENT_ID!,
    redirect_uri: redirectUri,
    scope: "tweet.write tweet.read users.read offline.access",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeTwitterCode(
  code: string,
  codeVerifier: string,
  redirectUri: string
) {
  const credentials = Buffer.from(
    `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Twitter token exchange failed: ${err}`);
  }
  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type: string;
  }>;
}

export async function refreshTwitterToken(refreshToken: string) {
  const credentials = Buffer.from(
    `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) throw new Error("Failed to refresh Twitter token");
  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  }>;
}

export async function getTwitterProfile(accessToken: string) {
  const res = await fetch(
    `${USERINFO_URL}?user.fields=name,username,profile_image_url`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error("Failed to get Twitter profile");
  const json = await res.json() as { data: { id: string; name: string; username: string } };
  return json.data;
}

/** Erros JSON da API v2 (ex.: CreditsDepleted) → mensagem legível em PT. */
function throwTwitterWriteFailure(rawBody: string, fallbackPrefix: string): never {
  try {
    const j = JSON.parse(rawBody) as { title?: string; detail?: string; type?: string };
    const isCredits =
      j.title === "CreditsDepleted" ||
      (typeof j.type === "string" && j.type.toLowerCase().includes("credit"));
    if (isCredits) {
      throw new Error(
        "X (Twitter): sem créditos de API para publicar. Em https://developer.x.com abre o projeto da app → Billing / Usage (ou plano API v2), compra créditos ou faz upgrade. Cada publicação consome créditos neste modelo."
      );
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("X (Twitter):")) throw e;
  }
  throw new Error(`${fallbackPrefix}: ${rawBody}`);
}

/**
 * Upload an image to Twitter and return the media_id_string.
 * Uses the v1.1 media upload endpoint with OAuth 2.0 User Context (PKCE token).
 * imageInput: data URL (base64) ou URL https.
 */
export async function uploadTwitterMedia(
  accessToken: string,
  imageInput: string
): Promise<string> {
  let base64Data: string;
  let mimeType: string;

  if (imageInput.startsWith("https://") || imageInput.startsWith("http://")) {
    const res = await fetch(imageInput, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`Twitter media: falha ao baixar imagem (${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
    if (!mimeType.startsWith("image/")) throw new Error("Twitter media: URL não é uma imagem");
    base64Data = buf.toString("base64");
  } else {
    const comma = imageInput.indexOf(",");
    if (comma === -1 || !imageInput.startsWith("data:")) {
      throw new Error("Twitter media: esperado data URL base64 ou URL https");
    }
    mimeType = imageInput.slice(0, comma).replace("data:", "").replace(";base64", "");
    base64Data = imageInput.slice(comma + 1);
  }

  // Use multipart/form-data with binary data (not base64 URL-encoded).
  // The base64 form (media_data + x-www-form-urlencoded) can fail silently
  // for images > ~1MB because the encoded payload hits server size limits.
  const buffer = Buffer.from(base64Data, "base64");
  const blob = new Blob([buffer], { type: mimeType });
  const formData = new FormData();
  formData.append("media", blob, `upload.${mimeType.split("/")[1] ?? "jpg"}`);

  const res = await fetch(MEDIA_UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      // Content-Type is set automatically by fetch with the correct multipart boundary
    },
    body: formData,
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Twitter media upload failed (${res.status}): ${err.slice(0, 300)}`);
  }

  const json = (await res.json()) as { media_id_string?: string };
  if (!json.media_id_string) {
    throw new Error("Twitter media upload: resposta sem media_id_string");
  }
  return json.media_id_string;
}

export async function publishToTwitter(
  accessToken: string,
  text: string,
  mediaIds?: string[]
): Promise<{ tweetId: string; url: string }> {
  const tweetBody: Record<string, unknown> = { text };
  if (mediaIds && mediaIds.length > 0) {
    tweetBody.media = { media_ids: mediaIds };
  }

  const res = await fetch(TWEETS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(tweetBody),
  });

  if (!res.ok) {
    const error = await res.text();
    throwTwitterWriteFailure(error, "Twitter publish failed");
  }

  const json = (await res.json()) as { data?: { id?: string; text?: string }; errors?: unknown };
  const tid = json.data?.id;
  if (!tid) {
    throw new Error(
      `Twitter publish failed: resposta sem data.id (${JSON.stringify(json).slice(0, 400)})`
    );
  }
  return {
    tweetId: tid,
    url: `https://twitter.com/i/web/status/${tid}`,
  };
}

/**
 * Publish a thread on X.
 * Each string in `tweets` becomes one tweet, chained as replies.
 * Returns the URL of the first tweet.
 */
export async function publishTwitterThread(
  accessToken: string,
  tweets: string[],
  firstTweetMediaIds?: string[]
): Promise<{ firstTweetId: string; url: string; tweetIds: string[] }> {
  if (tweets.length === 0) throw new Error("Thread requires at least one tweet");

  // Ensure each tweet is within 280 chars
  const sanitized = tweets.map((t) => t.trim().slice(0, 280)).filter(Boolean);

  const tweetIds: string[] = [];
  let replyToId: string | null = null;

  for (const text of sanitized) {
    const body: Record<string, unknown> = { text };
    if (replyToId) {
      body.reply = { in_reply_to_tweet_id: replyToId };
    }
    // Attach media only to the first tweet
    if (tweetIds.length === 0 && firstTweetMediaIds && firstTweetMediaIds.length > 0) {
      body.media = { media_ids: firstTweetMediaIds };
    }

    const res = await fetch(TWEETS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const error = await res.text();
      throwTwitterWriteFailure(error, `Twitter thread failed at tweet ${tweetIds.length + 1}`);
    }

    const json = (await res.json()) as { data?: { id?: string } };
    const tid = json.data?.id;
    if (!tid) {
      throw new Error(
        `Twitter thread tweet ${tweetIds.length + 1}: resposta sem id (${JSON.stringify(json).slice(0, 300)})`
      );
    }
    tweetIds.push(tid);
    replyToId = tid;

    // Small delay between tweets to avoid rate limits
    if (sanitized.indexOf(text) < sanitized.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return {
    firstTweetId: tweetIds[0],
    url: `https://twitter.com/i/web/status/${tweetIds[0]}`,
    tweetIds,
  };
}

/**
 * Parse a thread from a text where each tweet starts with "N/" or "N. "
 * Returns an array of tweet strings.
 */
export function parseTwitterThread(content: string): string[] {
  // Try splitting by numbered patterns: "1/", "1.", "1 -" at start of segments
  const segments = content
    .split(/\n(?=\d+[\/\.\)]\s)/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length >= 2) {
    // Strip the numbering prefix from each segment
    return segments.map((s) => s.replace(/^\d+[\/\.\)]\s*/, "").trim());
  }

  // Fallback: split by double newlines, each paragraph is a tweet
  const paragraphs = content.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
  if (paragraphs.length >= 2) return paragraphs;

  // Last resort: split long content into 280-char chunks
  const words = content.split(" ");
  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length <= 270) {
      current = (current + " " + word).trim();
    } else {
      if (current) chunks.push(current);
      current = word;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
