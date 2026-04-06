const AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
const POSTS_URL = "https://api.linkedin.com/rest/posts";
const IMAGES_URL = "https://api.linkedin.com/rest/images";
const VIDEOS_URL = "https://api.linkedin.com/rest/videos";

// Ordem: mais recente primeiro. 426 NONEXISTENT_VERSION → usar próximo em tryLinkedInRestPost.
const LINKEDIN_VERSION_CANDIDATES = [
  "202504", "202503", "202502", "202501",
  "202412", "202411", "202410", "202407",
  "202404", "202401",
  "202312", "202310", "202307", "202304",
];

/** REST default: vídeos, organizationAcls — alinhado ao candidato mais recente. */
const ACTIVE_VERSION = LINKEDIN_VERSION_CANDIDATES[0];

const LINKEDIN_RETRY_STATUSES = new Set([404, 405, 426, 429]);

// ── OAuth ────────────────────────────────────────────────────────────────────

/**
 * Build the LinkedIn OAuth URL.
 * Scopes depend on which products are enabled on the LinkedIn app:
 *
 * App pessoal (LINKEDIN_CLIENT_ID):
 *   - "Share on LinkedIn"       → w_member_social
 *   - "Sign In with LinkedIn"   → openid profile email
 *
 * App pages (LINKEDIN_PAGES_CLIENT_ID — app separada com Community Management API):
 *   - "Community Management API" → w_organization_social r_organization_admin
 *
 * The `forPages` flag selects which app credentials to use.
 */
export function getLinkedInAuthUrl(
  redirectUri: string,
  state: string,
  forPages = false
): string {
  const clientId = forPages
    ? (process.env.LINKEDIN_PAGES_CLIENT_ID ?? process.env.LINKEDIN_CLIENT_ID!)
    : process.env.LINKEDIN_CLIENT_ID!;

  const scope = forPages
    ? "openid profile email w_organization_social r_organization_admin"
    : "openid profile email w_member_social";

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeLinkedInCodeForPages(code: string, redirectUri: string) {
  const clientId = process.env.LINKEDIN_PAGES_CLIENT_ID ?? process.env.LINKEDIN_CLIENT_ID!;
  const clientSecret = process.env.LINKEDIN_PAGES_CLIENT_SECRET ?? process.env.LINKEDIN_CLIENT_SECRET!;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LinkedIn pages token exchange failed: ${err}`);
  }
  return res.json() as Promise<{
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  }>;
}

export async function exchangeLinkedInCode(code: string, redirectUri: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LinkedIn token exchange failed: ${err}`);
  }
  return res.json() as Promise<{
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
  }>;
}

export async function getLinkedInProfile(accessToken: string) {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to get LinkedIn profile");
  return res.json() as Promise<{
    sub: string;
    name: string;
    given_name: string;
    family_name: string;
    email: string;
    picture?: string;
  }>;
}

export interface LinkedInOrgPage {
  organizationId: string;
  name: string;
  vanityName?: string;
}

export async function getLinkedInAdminPages(accessToken: string): Promise<LinkedInOrgPage[]> {
  const aclRes = await fetch(
    "https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "LinkedIn-Version": ACTIVE_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
      },
    }
  );

  if (!aclRes.ok) {
    console.warn(`[LinkedIn] Could not fetch org pages (${aclRes.status})`);
    return [];
  }

  const aclData = await aclRes.json() as { elements?: Array<{ organization: string }> };
  const orgUrns = (aclData.elements ?? []).map((e) => e.organization);
  if (orgUrns.length === 0) return [];

  const pages: LinkedInOrgPage[] = [];
  await Promise.allSettled(
    orgUrns.map(async (urn) => {
      const orgId = urn.replace("urn:li:organization:", "");
      const orgRes = await fetch(`https://api.linkedin.com/rest/organizations/${orgId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "LinkedIn-Version": ACTIVE_VERSION,
          "X-Restli-Protocol-Version": "2.0.0",
        },
      });
      if (!orgRes.ok) return;
      const org = await orgRes.json() as {
        vanityName?: string;
        localizedName?: string;
        name?: { localized?: Record<string, string> };
      };
      const orgName =
        org.localizedName ??
        (org.name?.localized ? Object.values(org.name.localized)[0] : undefined) ??
        `Organização ${orgId}`;
      pages.push({ organizationId: orgId, name: orgName, vanityName: org.vanityName });
    })
  );
  return pages;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildHeaders(accessToken: string, version = ACTIVE_VERSION) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "LinkedIn-Version": version,
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

/** Evita `urn:li:person:urn:li:person:...` se o ID já vier com prefixo da API. */
function stripLinkedInUrnId(raw: string, kind: "person" | "organization"): string {
  const u = raw.trim();
  const prefix = kind === "person" ? "urn:li:person:" : "urn:li:organization:";
  return u.startsWith(prefix) ? u.slice(prefix.length) : u;
}

function authorUrn(platformUserId: string, accountType: "personal" | "organization") {
  if (accountType === "organization") {
    const id = stripLinkedInUrnId(platformUserId, "organization");
    return `urn:li:organization:${id}`;
  }
  const id = stripLinkedInUrnId(platformUserId, "person");
  return `urn:li:person:${id}`;
}

const BASE_DISTRIBUTION = {
  feedDistribution: "MAIN_FEED",
  targetEntities: [],
  thirdPartyDistributionChannels: [],
};

/**
 * Convert a base64 data URL to a Buffer + mime type.
 * Input: "data:image/jpeg;base64,/9j/4AA..."
 */
function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; mimeType: string } {
  const comma = dataUrl.indexOf(",");
  if (comma === -1 || !dataUrl.startsWith("data:")) {
    throw new Error("Imagem inválida: esperado data URL base64 (data:image/...;base64,...).");
  }
  const header = dataUrl.slice(0, comma);
  const b64 = dataUrl.slice(comma + 1);
  const mimeType = header.replace("data:", "").replace(";base64", "");
  return { buffer: Buffer.from(b64, "base64"), mimeType };
}

// ── Image upload ─────────────────────────────────────────────────────────────

/**
 * Upload an image to LinkedIn and return the image URN.
 * ownerUrn: e.g. "urn:li:person:XYZ" or "urn:li:organization:123"
 * imageInput: data URL base64 ou URL https (carrosséis / CDN) — convertida antes do upload.
 */
export async function uploadLinkedInImage(
  accessToken: string,
  ownerUrn: string,
  imageInput: string
): Promise<string> {
  let dataUrl = imageInput.trim();
  if (dataUrl.startsWith("https://") || dataUrl.startsWith("http://")) {
    dataUrl = await fetchHttpsImageAsDataUrl(dataUrl);
  }

  // Step 1: Initialize upload (várias versões — 426 NONEXISTENT_VERSION se versão REST expirou)
  let uploadUrl: string | undefined;
  let imageUrn: string | undefined;
  let lastInitErr = "";

  for (const version of LINKEDIN_VERSION_CANDIDATES) {
    const initRes = await fetch(`${IMAGES_URL}?action=initializeUpload`, {
      method: "POST",
      headers: buildHeaders(accessToken, version),
      body: JSON.stringify({ initializeUploadRequest: { owner: ownerUrn } }),
    });

    const errText = initRes.ok ? "" : await initRes.text();
    if (!initRes.ok) {
      lastInitErr = errText;
      if (LINKEDIN_RETRY_STATUSES.has(initRes.status)) continue;
      throw new Error(`LinkedIn image init failed: ${errText}`);
    }

    const initData = (await initRes.json()) as {
      value?: { uploadUrl: string; image: string };
    };
    uploadUrl = initData.value?.uploadUrl;
    imageUrn = initData.value?.image;
    if (!uploadUrl || !imageUrn) {
      throw new Error(
        `LinkedIn image init: resposta sem uploadUrl/image. Corpo: ${JSON.stringify(initData).slice(0, 400)}`
      );
    }
    break;
  }

  if (!uploadUrl || !imageUrn) {
    throw new Error(
      `LinkedIn image init failed (todas as versões tentadas). Último erro: ${lastInitErr.slice(0, 500)}`
    );
  }

  // Step 2: Upload binary
  const { buffer, mimeType } = dataUrlToBuffer(dataUrl);
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: new Uint8Array(buffer),
  });

  if (!uploadRes.ok && uploadRes.status !== 201) {
    throw new Error(`LinkedIn image upload failed: ${uploadRes.status}`);
  }

  return imageUrn;
}

/**
 * Upload a video to LinkedIn and return the video URN.
 */
export async function uploadLinkedInVideo(
  accessToken: string,
  ownerUrn: string,
  videoDataUrl: string
): Promise<string> {
  const { buffer, mimeType } = dataUrlToBuffer(videoDataUrl);
  const fileSizeBytes = buffer.byteLength;

  const initRes = await fetch(`${VIDEOS_URL}?action=initializeUpload`, {
    method: "POST",
    headers: buildHeaders(accessToken),
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: ownerUrn,
        fileSizeBytes,
        uploadCaptions: false,
        uploadThumbnail: false,
      },
    }),
  });

  if (!initRes.ok) {
    const err = await initRes.text();
    throw new Error(`LinkedIn video init failed: ${err}`);
  }

  const initData = await initRes.json() as {
    value: { uploadInstructions: Array<{ uploadUrl: string; firstByte: number; lastByte: number }>; video: string };
  };
  const { uploadInstructions, video: videoUrn } = initData.value;

  // Upload in chunks as indicated
  for (const instruction of uploadInstructions) {
    const chunk = buffer.slice(instruction.firstByte, instruction.lastByte + 1);
    const uploadRes = await fetch(instruction.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": mimeType },
      body: new Uint8Array(chunk),
    });
    if (!uploadRes.ok) {
      throw new Error(`LinkedIn video chunk upload failed: ${uploadRes.status}`);
    }
  }

  // Finalize
  await fetch(`${VIDEOS_URL}?action=finalizeUpload`, {
    method: "POST",
    headers: buildHeaders(accessToken),
    body: JSON.stringify({
      finalizeUploadRequest: { video: videoUrn, uploadToken: "", uploadedPartIds: [] },
    }),
  });

  return videoUrn;
}

/**
 * Legacy fallback: POST to /v2/ugcPosts (deprecated but still widely functional).
 * Converts the new Posts API body format to the ugcPosts format.
 */
async function postToLinkedInLegacy(
  accessToken: string,
  body: Record<string, unknown>
): Promise<{ postId: string | null; url: string | null }> {
  const author = body.author as string;
  const text = body.commentary as string;

  const ugcBody = {
    author,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: "NONE",
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  console.log("[LinkedIn] Falling back to legacy v2/ugcPosts endpoint");
  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(ugcBody),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LinkedIn ugcPosts fallback failed (HTTP ${res.status}): ${err.slice(0, 300)}`);
  }

  const postId = res.headers.get("x-restli-id") ?? null;
  const url = postId ? `https://www.linkedin.com/feed/update/urn:li:ugcPost:${postId}` : null;
  console.log(`[LinkedIn] ✓ Published via legacy ugcPosts, postId=${postId}`);
  return { postId, url };
}

export const LINKEDIN_MAX_COMMENTARY_CHARS = 3000;

/** Try POST /rest/posts across API versions; returns null if all versions failed (caller may use legacy). */
async function tryLinkedInRestPost(
  accessToken: string,
  body: Record<string, unknown>
): Promise<{ postId: string | null; url: string | null } | null> {
  let lastStatus = 0;

  for (const version of LINKEDIN_VERSION_CANDIDATES) {
    let res: Response;
    try {
      res = await fetch(POSTS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "LinkedIn-Version": version,
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      console.warn(`[LinkedIn] fetch error for version ${version}:`, e);
      continue;
    }

    lastStatus = res.status;

    if (LINKEDIN_RETRY_STATUSES.has(res.status)) {
      console.warn(`[LinkedIn] version ${version} returned ${res.status} — trying next`);
      continue;
    }

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`LinkedIn publish failed (${version} / HTTP ${res.status}): ${error.slice(0, 300)}`);
    }

    const postId = res.headers.get("x-linkedin-id") ?? res.headers.get("x-restli-id") ?? null;
    const url = postId ? `https://www.linkedin.com/feed/update/urn:li:share:${postId}` : null;
    console.log(`[LinkedIn] ✓ Published with version ${version}, postId=${postId}`);
    return { postId, url };
  }

  console.warn(`[LinkedIn] All /rest/posts versions failed (last: ${lastStatus}).`);
  return null;
}

async function postToLinkedIn(
  accessToken: string,
  body: Record<string, unknown>
): Promise<{ postId: string | null; url: string | null }> {
  if (typeof body.commentary === "string" && body.commentary.length > LINKEDIN_MAX_COMMENTARY_CHARS) {
    throw new Error(
      `LinkedIn commentary has ${body.commentary.length} characters, but the limit is ${LINKEDIN_MAX_COMMENTARY_CHARS}. The post must be rewritten within the limit.`
    );
  }

  const rest = await tryLinkedInRestPost(accessToken, body);
  if (rest) return rest;

  console.warn(`[LinkedIn] Trying ugcPosts legacy fallback.`);
  return postToLinkedInLegacy(accessToken, body);
}

/**
 * Fetch a public HTTPS image and return a data URL for LinkedIn Images API upload.
 */
export async function fetchHttpsImageAsDataUrl(imageUrl: string): Promise<string> {
  const res = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Failed to download image: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ct = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  if (!ct.startsWith("image/")) throw new Error("URL is not an image");
  return `data:${ct};base64,${buf.toString("base64")}`;
}

const LINKEDIN_ARTICLE_TITLE_MAX = 200;
const LINKEDIN_ARTICLE_DESC_MAX = 400;

/**
 * Article-style post: link card pointing to a public URL (full text hosted by us).
 * See: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
 */
export async function publishLinkedInArticleLinkPost(
  accessToken: string,
  platformUserId: string,
  params: {
    commentary: string;
    articleUrl: string;
    title: string;
    description: string;
    thumbnailDataUrl?: string | null;
    thumbnailHttpsUrl?: string | null;
  },
  accountType: "personal" | "organization" = "personal"
): Promise<{ postId: string | null; url: string | null }> {
  const { commentary, articleUrl, title, description, thumbnailDataUrl, thumbnailHttpsUrl } = params;
  if (commentary.length > LINKEDIN_MAX_COMMENTARY_CHARS) {
    throw new Error(
      `LinkedIn commentary has ${commentary.length} characters (max ${LINKEDIN_MAX_COMMENTARY_CHARS}).`
    );
  }
  const safeTitle = title.slice(0, LINKEDIN_ARTICLE_TITLE_MAX);
  const safeDesc = description.slice(0, LINKEDIN_ARTICLE_DESC_MAX);
  const owner = authorUrn(platformUserId, accountType);

  let thumbnailUrn: string | undefined;
  if (thumbnailDataUrl?.startsWith("data:image")) {
    thumbnailUrn = await uploadLinkedInImage(accessToken, owner, thumbnailDataUrl);
  } else if (thumbnailHttpsUrl?.startsWith("https://")) {
    const dataUrl = await fetchHttpsImageAsDataUrl(thumbnailHttpsUrl);
    thumbnailUrn = await uploadLinkedInImage(accessToken, owner, dataUrl);
  }

  const articlePayload: Record<string, string> = {
    source: articleUrl,
    title: safeTitle,
    description: safeDesc,
  };
  if (thumbnailUrn) articlePayload.thumbnail = thumbnailUrn;

  const body: Record<string, unknown> = {
    author: owner,
    commentary,
    visibility: "PUBLIC",
    distribution: BASE_DISTRIBUTION,
    content: { article: articlePayload },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };

  const rest = await tryLinkedInRestPost(accessToken, body);
  if (!rest) {
    throw new Error(
      "LinkedIn não aceitou o post de artigo em nenhuma versão da API. Artigos não usam o fallback legado — verifique o produto Share on LinkedIn e permissões."
    );
  }
  return rest;
}

// ── Publish functions ─────────────────────────────────────────────────────────

/**
 * Publish a plain text post (no media).
 */
export async function publishToLinkedIn(
  accessToken: string,
  platformUserId: string,
  text: string,
  accountType: "personal" | "organization" = "personal"
): Promise<{ postId: string | null; url: string | null }> {
  return postToLinkedIn(accessToken, {
    author: authorUrn(platformUserId, accountType),
    commentary: text,
    visibility: "PUBLIC",
    distribution: BASE_DISTRIBUTION,
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  });
}

/**
 * Publish a post with a single image.
 * imageDataUrl: base64 data URL. If null, falls back to text-only post.
 */
export async function publishLinkedInImagePost(
  accessToken: string,
  platformUserId: string,
  text: string,
  imageDataUrl: string,
  accountType: "personal" | "organization" = "personal"
): Promise<{ postId: string | null; url: string | null }> {
  const owner = authorUrn(platformUserId, accountType);
  const imageUrn = await uploadLinkedInImage(accessToken, owner, imageDataUrl);

  return postToLinkedIn(accessToken, {
    author: owner,
    commentary: text,
    visibility: "PUBLIC",
    distribution: BASE_DISTRIBUTION,
    content: { media: { title: "", id: imageUrn } },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  });
}

/**
 * Publish a post with a video.
 * videoDataUrl: base64 data URL.
 */
export async function publishLinkedInVideoPost(
  accessToken: string,
  platformUserId: string,
  text: string,
  videoDataUrl: string,
  accountType: "personal" | "organization" = "personal"
): Promise<{ postId: string | null; url: string | null }> {
  const owner = authorUrn(platformUserId, accountType);
  const videoUrn = await uploadLinkedInVideo(accessToken, owner, videoDataUrl);

  return postToLinkedIn(accessToken, {
    author: owner,
    commentary: text,
    visibility: "PUBLIC",
    distribution: BASE_DISTRIBUTION,
    content: { media: { title: "", id: videoUrn } },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  });
}

/**
 * Publish a multi-image carousel post.
 * imageDataUrls: array of base64 data URLs (max 20, min 2).
 */
export async function publishLinkedInCarousel(
  accessToken: string,
  platformUserId: string,
  text: string,
  imageDataUrls: string[],
  accountType: "personal" | "organization" = "personal"
): Promise<{ postId: string | null; url: string | null }> {
  const owner = authorUrn(platformUserId, accountType);

  // Upload all images concurrently (max 5 for safety)
  const imageUrns = await Promise.all(
    imageDataUrls.slice(0, 9).map((url) => uploadLinkedInImage(accessToken, owner, url))
  );

  return postToLinkedIn(accessToken, {
    author: owner,
    commentary: text,
    visibility: "PUBLIC",
    distribution: BASE_DISTRIBUTION,
    content: {
      multiImage: {
        images: imageUrns.map((urn, i) => ({ altText: `Slide ${i + 1}`, id: urn })),
      },
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  });
}

export type PollDuration = "ONE_DAY" | "THREE_DAYS" | "ONE_WEEK" | "TWO_WEEKS";

/**
 * Publish a LinkedIn poll.
 * question: max 140 chars.
 * options: 2–4 strings, each max 30 chars.
 */
export async function publishLinkedInPoll(
  accessToken: string,
  platformUserId: string,
  commentaryText: string,
  question: string,
  options: string[],
  duration: PollDuration = "THREE_DAYS",
  accountType: "personal" | "organization" = "personal"
): Promise<{ postId: string | null; url: string | null }> {
  const sanitizedOptions = options.slice(0, 4).map((o) => ({ text: o.slice(0, 30) }));
  if (sanitizedOptions.length < 2) throw new Error("Poll needs at least 2 options");

  return postToLinkedIn(accessToken, {
    author: authorUrn(platformUserId, accountType),
    commentary: commentaryText,
    visibility: "PUBLIC",
    distribution: BASE_DISTRIBUTION,
    content: {
      poll: {
        question: question.slice(0, 140),
        options: sanitizedOptions,
        settings: { duration },
      },
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  });
}
