/**
 * TikTok pelo Login Kit (web) e pela Content Posting API, modo Direct Post.
 *
 * Sexta rede, entrou em 28/09/2026 na virada enterprise: o TikTok só recebe
 * vídeo, então ele é oferecido para a peça que já é vídeo vertical (corte de
 * gravação e vídeo por IA em 9:16), e nunca para texto ou imagem.
 *
 * Três decisões que não são óbvias:
 *
 * 1. ENVIO EM PEDAÇOS (FILE_UPLOAD), e não PULL_FROM_URL. O pull é mais simples
 *    (o TikTok busca o arquivo), mas exige verificar a posse do domínio da URL
 *    no portal do desenvolvedor. Nossos vídeos moram no Vercel Blob
 *    (*.public.blob.vercel-storage.com), domínio que não é nosso e não se
 *    verifica. Servir por uma rota nossa daria para verificar demandou.com,
 *    mas amarraria a publicação a mais um cadastro no portal; o envio em
 *    pedaços funciona desde o primeiro dia.
 *
 * 2. AS OPÇÕES DA PUBLICAÇÃO SÃO DA PESSOA, não do produto. As regras de
 *    interface do TikTok (conferidas na auditoria) exigem que quem publica
 *    escolha a privacidade numa lista SEM valor padrão, ligue comentário,
 *    dueto e costura por conta própria (desligados de início) e declare se é
 *    conteúdo comercial. Por isso `publicarVideoNoTikTok` recebe essas opções
 *    prontas, e elas vêm gravadas no post (metadata.tiktok) na hora da
 *    aprovação. Sem elas o post não sai: ver `opcoesDoTikTokNoPost`.
 *
 * 3. ANTES DA AUDITORIA, TUDO SAI PRIVADO. App não auditado só publica como
 *    SELF_ONLY ("somente eu"), e em conta privada. Não é defeito nosso; o erro
 *    `unaudited_client_can_only_post_to_private_accounts` vira mensagem clara.
 *
 * Tokens: o de acesso dura 24 horas, o de renovação 365 dias. Renovar o de
 * acesso devolve um de renovação novo, que precisa ser gravado.
 */

import { createHash, randomBytes } from "crypto";

const AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const API = "https://open.tiktokapis.com/v2";

// Os mesmos três escopos cadastrados no sandbox e declarados no App review:
// user.info.basic para mostrar nome e foto da conta conectada, video.upload
// para enviar o arquivo e video.publish para o Direct Post. Pedir escopo que
// não está cadastrado no app faz o TikTok recusar a autorização.
export const TIKTOK_SCOPES = ["user.info.basic", "video.upload", "video.publish"].join(",");

/**
 * Qual app do portal responde: o sandbox ou o de produção.
 *
 * Antes da auditoria só o sandbox funciona (com os usuários de teste
 * cadastrados nele), e depois da aprovação troca-se para o de produção sem
 * mexer no código: TIKTOK_AMBIENTE=production na Vercel. Sem a variável, vale
 * o sandbox quando as chaves dele existem, porque é o único que funciona
 * hoje. Tokens de um app não valem no outro: trocar de ambiente exige
 * reconectar as contas.
 */
function chaves(): { clientKey: string; clientSecret: string; ambiente: "sandbox" | "production" } | null {
  const pedido = (process.env.TIKTOK_AMBIENTE ?? "").toLowerCase();
  const temSandbox = Boolean(process.env.TIKTOK_SANDBOX_CLIENT_KEY && process.env.TIKTOK_SANDBOX_CLIENT_SECRET);
  const ambiente = pedido === "production" || (pedido !== "sandbox" && !temSandbox) ? "production" : "sandbox";
  const clientKey = ambiente === "sandbox" ? process.env.TIKTOK_SANDBOX_CLIENT_KEY : process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = ambiente === "sandbox" ? process.env.TIKTOK_SANDBOX_CLIENT_SECRET : process.env.TIKTOK_CLIENT_SECRET;
  return clientKey && clientSecret ? { clientKey, clientSecret, ambiente } : null;
}

export function tiktokConfigured(): boolean {
  return chaves() !== null;
}

export function ambienteDoTikTok(): "sandbox" | "production" | null {
  return chaves()?.ambiente ?? null;
}

/**
 * O par do PKCE. O verificador fica num cookie curto e volta na troca do
 * código; sem ele, um código interceptado no caminho não vira token. O
 * TikTok calcula o desafio como SHA-256 do verificador em HEXADECIMAL (não
 * em base64url, que é o padrão do OAuth), então é assim que ele sai daqui.
 */
export function novoPkce(): { verificador: string; desafio: string } {
  // 64 caracteres do alfabeto permitido (letras, números, - . _ ~).
  const verificador = randomBytes(48).toString("base64url").slice(0, 64);
  const desafio = createHash("sha256").update(verificador).digest("hex");
  return { verificador, desafio };
}

export function getTikTokAuthUrl(redirectUri: string, state: string, desafio: string): string {
  const params = new URLSearchParams({
    client_key: chaves()!.clientKey,
    scope: TIKTOK_SCOPES,
    response_type: "code",
    redirect_uri: redirectUri,
    state,
    code_challenge: desafio,
    code_challenge_method: "S256",
    // Mostra a tela de permissões SEMPRE, mesmo para quem já autorizou. Sem
    // isto, reconectar pulava direto de volta (visto em 28/09 ao gravar o
    // vídeo da auditoria), e a pessoa não vê o que está liberando.
    disable_auto_auth: "1",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

type RespostaDeToken = {
  access_token?: string;
  expires_in?: number;
  open_id?: string;
  refresh_token?: string;
  refresh_expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

export type TokensDoTikTok = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  refreshExpiresAt: Date;
  openId: string;
  escopos: string[];
};

function lerTokens(json: RespostaDeToken, contexto: string): TokensDoTikTok {
  // O TikTok responde 200 com `error` no corpo quando o código não vale; o
  // status HTTP sozinho não diz se deu certo.
  if (json.error || !json.access_token || !json.refresh_token || !json.open_id) {
    throw new Error(
      `TikTok ${contexto} falhou: ${json.error ?? "sem token"} ${json.error_description ?? ""}`.trim()
    );
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + (json.expires_in ?? 86400) * 1000),
    refreshExpiresAt: new Date(Date.now() + (json.refresh_expires_in ?? 31536000) * 1000),
    openId: json.open_id,
    escopos: (json.scope ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  };
}

export async function exchangeTikTokCode(
  code: string,
  redirectUri: string,
  verificador: string
): Promise<TokensDoTikTok> {
  const k = chaves()!;
  const res = await fetch(`${API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body: new URLSearchParams({
      client_key: k.clientKey,
      client_secret: k.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code_verifier: verificador,
    }),
  });
  const tokens = lerTokens((await res.json().catch(() => ({}))) as RespostaDeToken, "troca do código");
  // A pessoa pode desmarcar a permissão de publicar na tela do TikTok. Aceitar
  // a conexão assim deixaria uma conta que "está conectada" e nunca publica;
  // melhor dizer agora, com ela na frente da tela.
  if (!tokens.escopos.includes("video.publish")) {
    throw new Error(
      "A permissão de publicar vídeos não foi concedida. Conecte de novo e deixe marcada a opção de publicar."
    );
  }
  return tokens;
}

export async function refreshTikTokToken(refreshToken: string): Promise<TokensDoTikTok> {
  const k = chaves();
  if (!k) throw new Error("TikTok renovação do token falhou: chaves do app ausentes");
  const res = await fetch(`${API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body: new URLSearchParams({
      client_key: k.clientKey,
      client_secret: k.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  return lerTokens((await res.json().catch(() => ({}))) as RespostaDeToken, "renovação do token");
}

/**
 * Revoga o acesso da Demandou na conta do TikTok. Chamado quando a pessoa
 * desconecta: apagar só do nosso lado deixaria o app autorizado no TikTok,
 * e a promessa (termos e App review) é que desconectar encerra o acesso.
 * Falha aqui não impede a desconexão; quem chama só registra.
 */
export async function revokeTikTokToken(accessToken: string): Promise<void> {
  const k = chaves();
  if (!k) return;
  const res = await fetch(`${API}/oauth/revoke/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body: new URLSearchParams({ client_key: k.clientKey, client_secret: k.clientSecret, token: accessToken }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`TikTok revoke falhou (${res.status}): ${(await res.text()).slice(0, 200)}`);
}

type RespostaDaApi<T> = { data?: T; error?: { code?: string; message?: string; log_id?: string } };

/** Toda resposta da API v2 traz `error.code`, que é "ok" quando deu certo. */
async function chamar<T>(caminho: string, accessToken: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${caminho}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      ...(init.headers ?? {}),
    },
    signal: init.signal ?? AbortSignal.timeout(30_000),
  });
  const json = (await res.json().catch(() => ({}))) as RespostaDaApi<T>;
  const codigo = json.error?.code ?? (res.ok ? "ok" : `http_${res.status}`);
  if (codigo !== "ok") {
    throw new ErroDoTikTok(codigo, json.error?.message ?? "", json.error?.log_id);
  }
  return json.data as T;
}

export class ErroDoTikTok extends Error {
  constructor(
    public codigo: string,
    public detalhe: string,
    public logId?: string
  ) {
    super(mensagemDoErro(codigo, detalhe));
    this.name = "ErroDoTikTok";
  }
}

/**
 * A frase que a pessoa lê. Os códigos que têm conserto do lado dela viram
 * instrução; o resto sai com o código, para o suporte achar no log do TikTok.
 */
function mensagemDoErro(codigo: string, detalhe: string): string {
  switch (codigo) {
    case "access_token_invalid":
    case "scope_not_authorized":
      return `A conexão com o TikTok não vale mais. Reconecte a conta nas configurações do projeto (${codigo}).`;
    case "unaudited_client_can_only_post_to_private_accounts":
      // Visto em 28/09 no primeiro teste real: o Bruno escolheu "Somente eu" e
      // achou que já estava privado. A trava é da CONTA, não do vídeo, e a frase
      // precisa dizer onde se muda.
      return "Enquanto o app da Demandou não passa pela auditoria do TikTok, ele só publica em CONTA privada (não basta o vídeo ser \"somente eu\"). No app do TikTok: Perfil > menu > Configurações e privacidade > Privacidade > Conta privada. Depois publique de novo.";
    case "spam_risk_too_many_posts":
    case "spam_risk_user_banned_from_posting":
    case "reached_active_user_cap":
      return "O TikTok não deixou esta conta publicar agora (limite de postagens do dia). Tente de novo mais tarde.";
    case "privacy_level_option_mismatch":
      return "A privacidade escolhida não está disponível para esta conta do TikTok. Abra a peça e escolha outra.";
    case "rate_limit_exceeded":
      return "O TikTok pediu para esperar um pouco antes de publicar de novo.";
    default:
      return `O TikTok recusou a publicação (${codigo}${detalhe ? `: ${detalhe}` : ""}).`;
  }
}

export async function getTikTokUser(accessToken: string): Promise<{
  openId: string;
  nome: string;
  avatarUrl: string | null;
}> {
  const data = await chamar<{ user?: { open_id?: string; display_name?: string; avatar_url?: string } }>(
    "/user/info/?fields=open_id,display_name,avatar_url",
    accessToken,
    { method: "GET" }
  );
  const u = data?.user;
  if (!u?.open_id) throw new Error("O TikTok não devolveu os dados da conta.");
  return { openId: u.open_id, nome: u.display_name || "TikTok", avatarUrl: u.avatar_url ?? null };
}

export type PrivacidadeDoTikTok =
  | "PUBLIC_TO_EVERYONE"
  | "MUTUAL_FOLLOW_FRIENDS"
  | "FOLLOWER_OF_CREATOR"
  | "SELF_ONLY";

export type InfoDoCriador = {
  nome: string;
  usuario: string;
  avatarUrl: string | null;
  privacidades: PrivacidadeDoTikTok[];
  comentarioDesligado: boolean;
  duetoDesligado: boolean;
  costuraDesligada: boolean;
  duracaoMaximaSeg: number;
};

/**
 * O que ESTA conta pode fazer agora. As regras do TikTok pedem que a tela de
 * publicar consulte isto toda vez que abre (a lista de privacidades e o teto de
 * duração mudam por conta), e que a publicação pare se a conta não puder
 * postar no momento; a própria API responde erro nesse caso.
 */
export async function lerInfoDoCriador(accessToken: string): Promise<InfoDoCriador> {
  const d = await chamar<{
    creator_nickname?: string;
    creator_username?: string;
    creator_avatar_url?: string;
    privacy_level_options?: PrivacidadeDoTikTok[];
    comment_disabled?: boolean;
    duet_disabled?: boolean;
    stitch_disabled?: boolean;
    max_video_post_duration_sec?: number;
  }>("/post/publish/creator_info/query/", accessToken, { method: "POST", body: "{}" });
  return {
    nome: d.creator_nickname ?? "",
    usuario: d.creator_username ?? "",
    avatarUrl: d.creator_avatar_url ?? null,
    privacidades: d.privacy_level_options ?? [],
    comentarioDesligado: Boolean(d.comment_disabled),
    duetoDesligado: Boolean(d.duet_disabled),
    costuraDesligada: Boolean(d.stitch_disabled),
    duracaoMaximaSeg: d.max_video_post_duration_sec ?? 60,
  };
}

/** As escolhas da pessoa, gravadas no post na aprovação (metadata.tiktok). */
export type OpcoesDoTikTok = {
  privacidade: PrivacidadeDoTikTok;
  permitirComentario: boolean;
  permitirDueto: boolean;
  permitirCostura: boolean;
  /** "Sua marca": promove o próprio negócio. Rótulo "Conteúdo promocional". */
  suaMarca: boolean;
  /** "Conteúdo de marca": parceria paga com terceiro. Rótulo "Parceria paga". */
  conteudoDeMarca: boolean;
};

/**
 * Tamanho de cada pedaço. As regras: pedaço entre 5 e 64 MB, o último pode ir
 * até 128 MB, total_chunk_count é o tamanho dividido pelo pedaço arredondado
 * para baixo, e vídeo abaixo de 5 MB vai inteiro num pedaço só.
 */
export function planoDeEnvio(tamanho: number): { chunkSize: number; totalChunks: number } {
  const MB = 1024 * 1024;
  if (tamanho < 5 * MB) return { chunkSize: tamanho, totalChunks: 1 };
  // 10 MB: um corte de rede (5 a 30 MB) sobe em até 3 pedaços, e a sobra
  // sempre cabe no último, que aceita até 128 MB.
  const chunkSize = 10 * MB;
  return { chunkSize, totalChunks: Math.max(1, Math.floor(tamanho / chunkSize)) };
}

/**
 * Publica um vídeo direto no perfil (Direct Post) e espera o TikTok terminar.
 *
 * Três pernas: abre a publicação com as opções e o plano de pedaços, sobe os
 * pedaços na URL que ela devolve, e consulta o status até sair do
 * processamento. Devolve o id da publicação; a URL pública só existe quando o
 * post é público E passou pela moderação, então pode vir vazia.
 */
export async function publicarVideoNoTikTok(
  accessToken: string,
  video: { buffer: Buffer; mimeType: string },
  legenda: string,
  opcoes: OpcoesDoTikTok,
  usuario: string | null,
  geradoPorIa: boolean
): Promise<{ publishId: string; url: string | null; status: string }> {
  const tamanho = video.buffer.byteLength;
  const { chunkSize, totalChunks } = planoDeEnvio(tamanho);

  const init = await chamar<{ publish_id: string; upload_url: string }>(
    "/post/publish/video/init/",
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        post_info: {
          // Até 2.200 caracteres (contados em UTF-16, que é o .length do JS).
          title: legenda.slice(0, 2200),
          privacy_level: opcoes.privacidade,
          disable_comment: !opcoes.permitirComentario,
          disable_duet: !opcoes.permitirDueto,
          disable_stitch: !opcoes.permitirCostura,
          brand_organic_toggle: opcoes.suaMarca,
          brand_content_toggle: opcoes.conteudoDeMarca,
          // O TikTok pede o rótulo de conteúdo gerado por IA quando a cena é
          // sintética. Corte de gravação é a pessoa falando, então não leva;
          // vídeo do Veo leva. Quem sabe a origem é quem chama (oauth-post).
          is_aigc: geradoPorIa,
        },
        source_info: {
          source: "FILE_UPLOAD",
          video_size: tamanho,
          chunk_size: chunkSize,
          total_chunk_count: totalChunks,
        },
      }),
    }
  );

  for (let i = 0; i < totalChunks; i++) {
    const inicio = i * chunkSize;
    // O último pedaço leva a sobra inteira.
    const fim = i === totalChunks - 1 ? tamanho - 1 : inicio + chunkSize - 1;
    const pedaco = video.buffer.subarray(inicio, fim + 1);
    const up = await fetch(init.upload_url, {
      method: "PUT",
      headers: {
        "Content-Type": video.mimeType === "video/quicktime" || video.mimeType === "video/webm" ? video.mimeType : "video/mp4",
        "Content-Length": String(pedaco.byteLength),
        "Content-Range": `bytes ${inicio}-${fim}/${tamanho}`,
      },
      body: new Uint8Array(pedaco),
      signal: AbortSignal.timeout(300_000),
    });
    // 206 nos pedaços do meio, 201 no último.
    if (up.status !== 206 && up.status !== 201 && !up.ok) {
      throw new Error(`TikTok: o envio do pedaço ${i + 1} de ${totalChunks} falhou (${up.status}): ${(await up.text()).slice(0, 300)}`);
    }
  }

  // O status é consultado até sair do processamento, com teto de ~2 minutos:
  // um corte de rede processa em segundos. Se passar disso, a publicação já
  // está com o TikTok e segue sozinha; o post fica publicado com o aviso.
  let status = "PROCESSING_UPLOAD";
  let postIds: string[] = [];
  for (let t = 0; t < 24; t++) {
    await new Promise((r) => setTimeout(r, 5_000));
    const s = await chamar<{ status: string; fail_reason?: string; publicaly_available_post_id?: Array<string | number> }>(
      "/post/publish/status/fetch/",
      accessToken,
      { method: "POST", body: JSON.stringify({ publish_id: init.publish_id }) }
    );
    status = s.status;
    postIds = (s.publicaly_available_post_id ?? []).map(String);
    if (status === "FAILED") {
      throw new Error(`O TikTok não conseguiu processar o vídeo (${s.fail_reason ?? "sem motivo"}).`);
    }
    if (status === "PUBLISH_COMPLETE") break;
  }

  const url = postIds[0] && usuario ? `https://www.tiktok.com/@${usuario}/video/${postIds[0]}` : null;
  return { publishId: init.publish_id, url, status };
}

/**
 * Lê as opções gravadas no post, e recusa quando faltam.
 *
 * Recusar é o comportamento certo: publicar no TikTok sem a pessoa ter
 * escolhido a privacidade é exatamente o que a auditoria reprova, e inventar um
 * padrão aqui seria escolher por ela.
 */
export function opcoesDoTikTokNoPost(metadata: Record<string, unknown> | null): OpcoesDoTikTok {
  const o = (metadata?.tiktok ?? null) as Partial<OpcoesDoTikTok> | null;
  if (!o?.privacidade) {
    throw new Error(
      "Falta escolher como este vídeo sai no TikTok (quem pode ver, comentários e se é conteúdo comercial). Abra a peça e publique pelo botão do TikTok."
    );
  }
  return {
    privacidade: o.privacidade,
    permitirComentario: Boolean(o.permitirComentario),
    permitirDueto: Boolean(o.permitirDueto),
    permitirCostura: Boolean(o.permitirCostura),
    suaMarca: Boolean(o.suaMarca),
    conteudoDeMarca: Boolean(o.conteudoDeMarca),
  };
}
