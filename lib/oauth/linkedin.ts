const AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
const POSTS_URL = "https://api.linkedin.com/rest/posts";
const IMAGES_URL = "https://api.linkedin.com/rest/images";
const VIDEOS_URL = "https://api.linkedin.com/rest/videos";

// Ordem: mais recente primeiro. 426 NONEXISTENT_VERSION → usar próximo.
//
// As versões de 2026 entraram em 12/09/2026, depois de `organizationAcls`
// responder 426 em produção: a lista começava em "202504", de abril de 2025, e
// o LinkedIn aposentou a linha de 2025 em 17/08/2026. Publicar continuava
// funcionando porque o publicador percorre esta lista quando toma 426, e a
// leitura de páginas não percorria: usava a versão fixa e desistia no primeiro
// erro. Mesmo defeito, dois comportamentos, porque só um dos caminhos tinha
// cascata.
//
// Versões futuras no topo são de graça: a que ainda não existe devolve 426 e a
// cascata segue. O que custa caro é a lista ficar velha em silêncio.
const LINKEDIN_VERSION_CANDIDATES = [
  "202609", "202608", "202607", "202606", "202605",
  "202604", "202603", "202602", "202601",
  "202512", "202511", "202510", "202509", "202508",
  "202504", "202503", "202502", "202501",
  "202412", "202411", "202410", "202407",
  "202404", "202401",
];

/** REST default para quem não percorre a lista. */
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
 *   - "Community Management API" → r_organization_social w_organization_social
 *     rw_organization_admin
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

  // O app de paginas NAO pede `openid profile email`. O LinkedIn nao deixa a
  // Community Management API conviver com o "Sign In with OpenID Connect" no
  // mesmo app (achado de 09/09, no formulario do Bruno: o botao de pedir a API
  // fica desabilitado enquanto houver outro produto), entao esse app so tem os
  // escopos de organizacao. O nome de quem conectou nao faz falta: o que se
  // grava e a PAGINA, e a pagina vem do organizationAcls.
  const scope = forPages
    // `rw_organization_admin`, e NAO `r_organization_admin`. O segundo nao
    // existe: o LinkedIn responde a tela generica "Bummer, something went
    // wrong", sem dizer qual escopo recusou, e a mensagem e identica a de
    // redirect_uri errado. Medido em 12/09 batendo no endpoint de autorizacao
    // um escopo por vez: os tres validos devolvem 303 para o login, e
    // `r_organization_admin` sozinho devolve 200 com a pagina de erro.
    ? "r_organization_social w_organization_social rw_organization_admin"
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

/**
 * GET no /rest do LinkedIn percorrendo as versões, igual o publicador faz.
 *
 * Existe porque em 12/09/2026 a leitura de páginas devolveu 426 em produção e o
 * código desistiu no primeiro erro, mostrando "0 páginas de empresa importada"
 * para quem acabara de autorizar. A tela não tinha como estar certa: o defeito
 * era de versão de API e a mensagem falava de permissão.
 *
 * Devolve a resposta boa, ou a última ruim para o chamador reportar direito.
 */
async function linkedinRestGet(url: string, accessToken: string): Promise<Response | null> {
  let ultima: Response | null = null;
  for (const version of LINKEDIN_VERSION_CANDIDATES) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "LinkedIn-Version": version,
          "X-Restli-Protocol-Version": "2.0.0",
        },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      console.warn(`[LinkedIn] GET erro de rede na versão ${version}:`, e);
      continue;
    }
    if (res.ok) {
      console.log(`[LinkedIn] GET ok com a versão ${version}: ${url}`);
      return res;
    }
    ultima = res;
    // 426 é "essa versão não existe mais". Qualquer outro erro é do pedido ou
    // da permissão, e trocar de versão não resolve: para aqui.
    if (res.status !== 426) return res;
    console.warn(`[LinkedIn] versão ${version} devolveu 426, tentando a próxima`);
  }
  return ultima;
}

export async function getLinkedInAdminPages(accessToken: string): Promise<LinkedInOrgPage[]> {
  const aclRes = await linkedinRestGet(
    "https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED",
    accessToken
  );

  if (!aclRes) {
    console.warn("[LinkedIn] organizationAcls: nenhuma versão da API respondeu");
    return [];
  }

  if (!aclRes.ok) {
    // O corpo junto do status, porque status sozinho não diz o que fazer: 403
    // é produto faltando no app, 426 é versão morta, 401 é token, e as três
    // vinham aparecendo como o mesmo "0 páginas" na tela.
    const corpo = await aclRes.text();
    console.warn(
      `[LinkedIn] organizationAcls falhou (${aclRes.status}): ${corpo.slice(0, 400)}`
    );
    return [];
  }

  const aclData = await aclRes.json() as { elements?: Array<{ organization: string }> };
  const orgUrns = (aclData.elements ?? []).map((e) => e.organization);
  if (orgUrns.length === 0) {
    console.warn(
      "[LinkedIn] organizationAcls respondeu OK e veio VAZIO: esta pessoa não é ADMINISTRATOR aprovado de nenhuma página."
    );
    return [];
  }

  const pages: LinkedInOrgPage[] = [];
  await Promise.allSettled(
    orgUrns.map(async (urn) => {
      const orgId = urn.replace("urn:li:organization:", "");
      const orgRes = await linkedinRestGet(
        `https://api.linkedin.com/rest/organizations/${orgId}`,
        accessToken
      );
      if (!orgRes?.ok) {
        // A página EXISTE e a pessoa administra: só o nome não veio. Entrar na
        // lista com o id no lugar do nome é melhor que sumir, porque sumir
        // devolve "0 páginas" para quem acabou de autorizar, que foi o defeito
        // de 12/09 um nível acima.
        console.warn(
          `[LinkedIn] nome da organização ${orgId} não veio (${orgRes?.status ?? "sem resposta"}), usando o id`
        );
        pages.push({ organizationId: orgId, name: `Página ${orgId}` });
        return;
      }
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
/**
 * O vídeo, aceito como data URL OU como bytes já lidos.
 *
 * A segunda forma existe desde 23/08, quando os cortes passaram a viver no
 * storage privado em vez de virem embutidos no banco. Antes só havia data URL,
 * e o ramo de vídeo do LinkedIn caía num `else` que postava a URL COMO TEXTO,
 * com um link privado que não abre para ninguém.
 *
 * Buffer e não fluxo porque o envio do LinkedIn é em pedaços e ele diz quais
 * bytes quer em cada um (`firstByte`, `lastByte`): sem acesso aleatório não dá
 * para atender. Para corte de rede isso é aceitável, porque um corte vertical
 * fica na casa de 5 a 10 MB.
 */
export type VideoParaEnvio = string | { buffer: Buffer; mimeType: string };

export async function uploadLinkedInVideo(
  accessToken: string,
  ownerUrn: string,
  video: VideoParaEnvio
): Promise<string> {
  const { buffer, mimeType } =
    typeof video === "string" ? dataUrlToBuffer(video) : video;
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
    value: {
      uploadInstructions: Array<{ uploadUrl: string; firstByte: number; lastByte: number }>;
      video: string;
      uploadToken?: string;
    };
  };
  const { uploadInstructions, video: videoUrn, uploadToken } = initData.value;

  /**
   * O UPLOAD É EM PARTES DE 4 MB, E O FINALIZE PRECISA DO ETAG DE CADA UMA.
   *
   * Medido em 21/09 na Areticon, e é o defeito por trás de "a plataforma
   * disse publicado e não tem nada no LinkedIn": o clipe de 19/09 tinha
   * 2,41 MB (uma parte só) e saiu; o de 21/09 tinha 4,08 MB, o LinkedIn
   * devolveu DUAS instruções de upload, e o `finalizeUpload` ia com
   * `uploadedPartIds: []` e a resposta nem era lida. Sem finalize o vídeo
   * nunca fica AVAILABLE; o post é criado (o LinkedIn devolve o URN) e nunca
   * aparece no feed. Um vídeo de 60 s tem perto de 20 MB, cinco partes: sem
   * isto nenhum vídeo longo sairia.
   *
   * A doc (Videos API): "Callers should get the IDs as ETags from the
   * response headers when they upload the videos", na mesma ordem das
   * instruções.
   */
  const etags: string[] = [];
  for (const instruction of uploadInstructions) {
    const chunk = buffer.subarray(instruction.firstByte, instruction.lastByte + 1);
    const uploadRes = await fetch(instruction.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: new Uint8Array(chunk),
      signal: AbortSignal.timeout(120_000),
    });
    if (!uploadRes.ok) {
      throw new Error(`LinkedIn video chunk upload failed: ${uploadRes.status}`);
    }
    const etag = uploadRes.headers.get("etag");
    if (!etag) throw new Error("LinkedIn video: a parte subiu sem ETag, e o finalize precisa dele.");
    etags.push(etag);
  }

  const fimRes = await fetch(`${VIDEOS_URL}?action=finalizeUpload`, {
    method: "POST",
    headers: buildHeaders(accessToken),
    body: JSON.stringify({
      finalizeUploadRequest: { video: videoUrn, uploadToken: uploadToken ?? "", uploadedPartIds: etags },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!fimRes.ok) {
    throw new Error(`LinkedIn video finalize failed (HTTP ${fimRes.status}): ${(await fimRes.text()).slice(0, 300)}`);
  }

  await esperarVideoDoLinkedIn(accessToken, videoUrn);
  return videoUrn;
}

/**
 * ESPERA O LINKEDIN PROCESSAR O VÍDEO antes de criar o post com ele.
 *
 * O status vem de GET /rest/videos/{urn}: WAITING_UPLOAD, PROCESSING,
 * AVAILABLE ou PROCESSING_FAILED. Criar o post antes de AVAILABLE é o que
 * deixa o LinkedIn devolver um URN de um post que nunca vai aparecer. Falha
 * de processamento vira erro com o motivo do LinkedIn, e o post fica como
 * FALHOU na nossa tela, que é a verdade; "publicado" sem post na rede é a
 * mentira que o Bruno pegou em 21/09.
 */
async function esperarVideoDoLinkedIn(accessToken: string, videoUrn: string): Promise<void> {
  const limite = Date.now() + 180_000;
  let ultimo = "";
  while (Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 5_000));
    const res = await fetch(`${VIDEOS_URL}/${encodeURIComponent(videoUrn)}`, {
      headers: buildHeaders(accessToken),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      // Consulta que falha não é vídeo que falhou: tenta de novo até o teto.
      ultimo = `consulta HTTP ${res.status}`;
      continue;
    }
    const dados = (await res.json()) as { status?: string; processingFailureReason?: string };
    ultimo = dados.status ?? "sem status";
    if (dados.status === "AVAILABLE") return;
    if (dados.status === "PROCESSING_FAILED") {
      throw new Error(`O LinkedIn não conseguiu processar o vídeo: ${dados.processingFailureReason ?? "sem motivo"}`);
    }
  }
  throw new Error(`O LinkedIn não terminou de processar o vídeo em 3 minutos (último estado: ${ultimo}). Publique de novo.`);
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
  const url = postId ? `https://www.linkedin.com/feed/update/${comPrefixoDeUrn(postId, "urn:li:ugcPost:")}` : null;
  console.log(`[LinkedIn] ✓ Published via legacy ugcPosts, postId=${postId}`);
  return { postId, url };
}

export const LINKEDIN_MAX_COMMENTARY_CHARS = 3000;

/**
 * O TEXTO DO POST E "LITTLE TEXT", E PARENTESE SEM ESCAPE COME O RESTO.
 *
 * Medido em 22/09 com tres posts do Bruno: o campo `commentary` da Posts API
 * nao e texto puro, e um formato com elementos (mencao, hashtag, template) que
 * reserva os caracteres  |  {  }  @  [  ]  (  )  <  >  #  *  _  ~  e a barra
 * invertida. A documentacao e explicita: "all reserved characters need to be
 * escaped with a backslash, EVEN IF those characters are not used in one of
 * the supported elements or templates". Quando nao vem escapado, o LinkedIn
 * nao recusa o post nem avisa: ele publica e DESCARTA o texto do caractere em
 * diante, em silencio.
 *
 * O que isso custou, lido do banco:
 *   • post de 22/09: 1.034 caracteres, primeiro "(" no 463, 55% perdido;
 *   • post de 19/09: 1.240 caracteres, primeiro "(" no 182, 85% perdido;
 *   • post de 19/09: 1.282 caracteres, primeiro "(" no 96, 93% perdido.
 * Sempre no mesmo lugar: a citacao da fonte entre parenteses, que e
 * justamente o que a Vera EXIGE em toda frase com numero. Ou seja, a regra de
 * qualidade do texto estava alimentando o defeito de publicacao.
 *
 * O card do calendario mostrava o texto inteiro porque ele le o nosso banco,
 * onde o texto sempre esteve inteiro. So a rede via o corte.
 *
 * O "#" fica de FORA da lista de proposito: `#palavra` e um HashtagElement
 * valido da gramatica, e escapa-lo transformaria a hashtag num "#" literal,
 * sem link e sem alcance. Escapamos so o "#" que nao forma hashtag.
 */
const RESERVADOS_DO_LINKEDIN = /[\\|{}@\[\]()<>*_~]/g;

export function escaparLittleText(texto: string): string {
  return texto
    .replace(RESERVADOS_DO_LINKEDIN, (c) => "\\" + c)
    // "#" so e reservado quando nao esta comecando uma hashtag de verdade.
    .replace(/#(?![\p{L}\p{N}])/gu, "\\#");
}

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
    const url = postId ? `https://www.linkedin.com/feed/update/${comPrefixoDeUrn(postId, "urn:li:share:")}` : null;
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

  /**
   * O ESCAPE VALE SO PARA A POSTS API.
   *
   * O caminho legado (`/v2/ugcPosts`, `shareCommentary.text`) e texto puro:
   * mandar escapado ali faria aparecer barra invertida na tela do leitor.
   * Por isso o corpo escapado e uma COPIA, e o `body` cru segue para o
   * fallback.
   */
  const corpoEscapado =
    typeof body.commentary === "string"
      ? { ...body, commentary: escaparLittleText(body.commentary) }
      : body;

  const rest = await tryLinkedInRestPost(accessToken, corpoEscapado);
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
/**
 * O cabecalho `x-restli-id` (ou `x-linkedin-id`) as vezes vem com o URN
 * inteiro ("urn:li:share:750...") e as vezes so com o numero. Visto em 09/09
 * no post publicado do Bruno: a URL saiu "feed/update/urn:li:share:urn:li:share:750...",
 * porque o prefixo era colado sem olhar se ja estava la.
 */
function comPrefixoDeUrn(id: string, prefixo: string): string {
  return id.startsWith("urn:li:") ? id : `${prefixo}${id}`;
}

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
  video: VideoParaEnvio,
  accountType: "personal" | "organization" = "personal"
): Promise<{ postId: string | null; url: string | null }> {
  const owner = authorUrn(platformUserId, accountType);
  const videoUrn = await uploadLinkedInVideo(accessToken, owner, video);

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
 * Publish a comment on a LinkedIn post (used for first comment with references).
 * postUrn: e.g. "urn:li:share:1234" or "urn:li:ugcPost:1234"
 */
/**
 * Apaga um post do LinkedIn, do perfil ou da página.
 *
 * Existe para o teste de ponta a ponta da publicação em página não deixar
 * entulho no perfil público do cliente. Provar que publica é metade: sem poder
 * limpar, cada prova custa um post de verdade na página de quem está vendendo.
 *
 * O `postUrn` é o mesmo que a publicação devolve (urn:li:share:... ou
 * urn:li:ugcPost:...). Devolve false em vez de lançar: falhar ao limpar não
 * pode derrubar o script que já provou o que importava.
 */
export async function deleteLinkedInPost(
  accessToken: string,
  postUrn: string
): Promise<boolean> {
  const encodedUrn = encodeURIComponent(postUrn);
  // Percorre as versões igual a leitura e a publicação. Em 13/09 este caminho
  // era o único sem cascata e tomou 426 ("Requested version 20260901 is not
  // active"), deixando um post de teste PUBLICADO na página da empresa. Apagar
  // é justamente o que não pode falhar: publicar errado se conserta apagando,
  // e apagar errado não se conserta com nada.
  for (const version of LINKEDIN_VERSION_CANDIDATES) {
    let res: Response;
    try {
      res = await fetch(`https://api.linkedin.com/rest/posts/${encodedUrn}`, {
        method: "DELETE",
        headers: buildHeaders(accessToken, version),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      console.warn(`[LinkedIn] delete: erro de rede na versão ${version}:`, e);
      continue;
    }
    if (res.ok || res.status === 204) {
      console.log(`[LinkedIn] post apagado com a versão ${version}`);
      return true;
    }
    if (res.status !== 426) {
      const err = await res.text();
      console.warn(`[LinkedIn] delete falhou (${res.status}): ${err.slice(0, 300)}`);
      return false;
    }
  }
  console.warn("[LinkedIn] delete: nenhuma versão da API aceitou");
  return false;
}

export async function publishLinkedInComment(
  accessToken: string,
  platformUserId: string,
  postUrn: string,
  text: string,
  accountType: "personal" | "organization" = "personal"
): Promise<boolean> {
  const actor = authorUrn(platformUserId, accountType);
  const encodedUrn = encodeURIComponent(postUrn);

  // Use the public v2 socialActions endpoint (requires w_member_social scope only).
  // The /rest/socialActions endpoint requires partnerApiSocialActions.CREATE (Partner API),
  // which is not available to standard apps. The v2 endpoint works with w_member_social.
  let res: Response;
  try {
    res = await fetch(
      `https://api.linkedin.com/v2/socialActions/${encodedUrn}/comments`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({ actor, message: { text } }),
        signal: AbortSignal.timeout(15_000),
      }
    );
  } catch (e) {
    console.warn("[LinkedIn] First comment: network error:", e);
    return false;
  }

  if (!res.ok) {
    const err = await res.text();
    console.warn(`[LinkedIn] comment failed (v2 / ${res.status}): ${err.slice(0, 300)}`);
    return false; // nao fatal: o post ja foi publicado
  }
  console.log("[LinkedIn] First comment published (v2)");
  return true;
}

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
