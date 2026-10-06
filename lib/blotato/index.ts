import { conferirResposta, marcarChamadaOk } from "@/lib/fornecedores/aviso-de-saldo";
/**
 * CLIENTE DA API REST DO BLOTATO (v2), religado em 30/09.
 *
 * O Blotato saiu em agosto (integrações próprias com cada rede) e este arquivo
 * ficou parado, falando com o servidor MCP (mcp.blotato.com, JSON-RPC de
 * ferramenta para assistente de IA). Volta agora como ATALHO DO LANÇAMENTO:
 * enquanto Meta e TikTok não aprovam os apps, a rede que estiver ligada no
 * roteador (lib/publish/roteador.ts) publica por aqui. Quando todas aprovarem,
 * o Blotato desliga de novo tirando a chave do ambiente.
 *
 * Por que REST e não MCP: o MCP é a porta para assistentes, com esquema de
 * ferramenta que muda sem aviso e espera interna de 20 s; a REST tem contrato
 * publicado (https://help.blotato.com/rest-api-reference/publish-post) e é a
 * que a própria documentação manda usar em integração que faz HTTP.
 *
 * O que a API faz e o que NÃO faz (documentação lida em 30/09):
 *   . autentica pela chave no cabeçalho `blotato-api-key` (planos pagos; gerar
 *     a chave no teste grátis encerra o teste e começa a cobrança);
 *   . lista as contas ligadas no painel (GET /users/me/accounts) e as páginas
 *     de Facebook e LinkedIn e playlists do YouTube (subaccounts);
 *   . publica texto, imagem, carrossel, vídeo, thread do X e agenda
 *     (POST /posts), e responde só o número do envio: a publicação é
 *     assíncrona e o resultado vem em GET /posts/:id (published com publicUrl,
 *     failed com errorMessage);
 *   . NÃO conecta conta de rede: isso só acontece no painel deles
 *     (my.blotato.com/settings), com o dono da conta autorizando. Não existe
 *     link de convite para cliente.
 *   . NÃO tem chave de idempotência: repetir o POST /posts cria post repetido
 *     na rede. Por isso o envio não tem nova tentativa automática aqui.
 */

const BASE = (process.env.BLOTATO_API_BASE ?? "https://backend.blotato.com/v2").replace(/\/$/, "");

/** Erro da API com o status HTTP e o corpo, para quem chama decidir. */
export class ErroDoBlotato extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly corpo: string
  ) {
    super(message);
    this.name = "ErroDoBlotato";
  }
}

export function chaveDoBlotato(): string | null {
  const k = process.env.BLOTATO_API_KEY?.trim();
  return k ? k : null;
}

async function chamar<T>(caminho: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const chave = chaveDoBlotato();
  if (!chave) {
    throw new ErroDoBlotato("A publicação pelo Blotato está desligada: falta BLOTATO_API_KEY no ambiente.", 0, "");
  }
  const res = await fetch(`${BASE}${caminho}`, {
    method: init.method ?? "GET",
    headers: {
      "blotato-api-key": chave,
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      Accept: "application/json",
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const texto = await res.text();
  if (!res.ok) {
    // Assinatura vencida ou pagamento recusado vira incidente e aviso ao admin (06/10).
    await conferirResposta("blotato", { status: res.status, corpo: texto }, "publicação pelo Blotato");
    // A mensagem da API vem em `message` (e às vezes em `error`); o corpo
    // inteiro fica no erro para o log, cortado para não vazar página HTML.
    let msg = texto.slice(0, 300);
    try {
      const j = JSON.parse(texto) as { message?: unknown; error?: unknown };
      const m = j.message ?? j.error;
      if (typeof m === "string") msg = m;
      else if (m) msg = JSON.stringify(m).slice(0, 300);
    } catch {
      // corpo não é JSON; fica o texto
    }
    // As causas que mudam a ação de quem lê, em português (a de pagamento e a
    // de chave são do Bruno, não do cliente).
    const prefixo =
      res.status === 401
        ? "Chave do Blotato recusada"
        : res.status === 403
          ? "O Blotato recusou pela assinatura (confira o plano em my.blotato.com/settings/billing)"
          : res.status === 429
            ? "Limite de chamadas do Blotato atingido"
            : `Blotato ${res.status}`;
    throw new ErroDoBlotato(`${prefixo}: ${msg}`, res.status, texto.slice(0, 2000));
  }
  marcarChamadaOk("blotato");
  return (texto ? JSON.parse(texto) : {}) as T;
}

/* ── Contas ─────────────────────────────────────────────────────────────── */

/** Os valores de rede da API, iguais em `content.platform` e `target.targetType`. */
export type RedeDoBlotato =
  | "twitter"
  | "linkedin"
  | "facebook"
  | "instagram"
  | "tiktok"
  | "youtube"
  | "pinterest"
  | "threads"
  | "bluesky";

export type ContaDoBlotato = { id: string; platform: RedeDoBlotato; fullname?: string; username?: string };
export type SubcontaDoBlotato = { id: string; accountId: string; name?: string };

export async function listarContas(rede?: RedeDoBlotato): Promise<ContaDoBlotato[]> {
  const q = rede ? `?platform=${encodeURIComponent(rede)}` : "";
  const r = await chamar<{ items?: ContaDoBlotato[] }>(`/users/me/accounts${q}`);
  return (r.items ?? []).map((c) => ({ ...c, id: String(c.id) }));
}

/** Páginas do Facebook, páginas de empresa do LinkedIn e playlists do YouTube. */
export async function listarSubcontas(contaId: string): Promise<SubcontaDoBlotato[]> {
  const r = await chamar<{ items?: SubcontaDoBlotato[] }>(
    `/users/me/accounts/${encodeURIComponent(contaId)}/subaccounts`
  );
  return (r.items ?? []).map((s) => ({ ...s, id: String(s.id), accountId: String(s.accountId) }));
}

/* ── Publicação ─────────────────────────────────────────────────────────── */

export type AlvoDoBlotato =
  | { targetType: "twitter" }
  | { targetType: "linkedin"; pageId?: string }
  | { targetType: "facebook"; pageId: string; mediaType?: "reel" | "story"; link?: string; firstComment?: string }
  | {
      targetType: "instagram";
      mediaType?: "reel" | "story";
      altText?: string;
      coverImageUrl?: string;
      shareToFeed?: boolean;
      firstComment?: string;
    }
  | {
      targetType: "tiktok";
      privacyLevel: "SELF_ONLY" | "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "FOLLOWER_OF_CREATOR";
      disabledComments: boolean;
      disabledDuet: boolean;
      disabledStitch: boolean;
      isBrandedContent: boolean;
      isYourBrand: boolean;
      isAiGenerated: boolean;
      title?: string;
      isDraft?: boolean;
    }
  | {
      targetType: "youtube";
      title: string;
      privacyStatus: "private" | "public" | "unlisted";
      shouldNotifySubscribers: boolean;
      isMadeForKids?: boolean;
      containsSyntheticMedia?: boolean;
      playlistIds?: string[];
      thumbnailUrl?: string;
    };

export type PedidoDePost = {
  post: {
    accountId: string;
    content: {
      text: string;
      mediaUrls: string[];
      platform: RedeDoBlotato;
      additionalPosts?: Array<{ text: string; mediaUrls: string[] }>;
    };
    target: AlvoDoBlotato;
  };
  /**
   * Agendamento do lado deles. Fica na RAIZ do corpo, irmão de `post`: dentro
   * de `post` a API ignora e publica na hora (aviso da própria documentação).
   * A Demandou não usa hoje (o cron é quem agenda, para a tela e a guarda de
   * texto continuarem valendo até o último minuto), mas o campo existe.
   */
  scheduledTime?: string;
};

export async function criarPost(pedido: PedidoDePost): Promise<{ postSubmissionId: string; scheduledTime?: string }> {
  const r = await chamar<{ postSubmissionId?: string; scheduledTime?: string }>("/posts", {
    method: "POST",
    body: pedido,
  });
  if (!r.postSubmissionId) throw new ErroDoBlotato("O Blotato aceitou o post mas não devolveu o número do envio.", 201, JSON.stringify(r));
  return { postSubmissionId: String(r.postSubmissionId), scheduledTime: r.scheduledTime };
}

export type StatusDoEnvio = {
  postSubmissionId: string;
  status: "in-progress" | "scheduled" | "published" | "failed";
  publicUrl?: string;
  errorMessage?: string;
  scheduledTime?: string;
};

export async function statusDoPost(postSubmissionId: string): Promise<StatusDoEnvio> {
  return chamar<StatusDoEnvio>(`/posts/${encodeURIComponent(postSubmissionId)}`);
}

/**
 * Espera o envio sair de "in-progress", respeitando o intervalo mínimo de 10 s
 * que a documentação pede (o limite é 60 consultas por minuto por chave, e o
 * cron publica vários posts em sequência).
 *
 * Devolve o último status visto quando o teto passa: quem chama decide o que
 * fazer com o envio ainda em andamento (o cron confere de novo depois).
 */
export async function esperarEnvio(
  postSubmissionId: string,
  opcoes: { tetoMs?: number; intervaloMs?: number; dormir?: (ms: number) => Promise<void> } = {}
): Promise<StatusDoEnvio> {
  const teto = opcoes.tetoMs ?? 120_000;
  const intervalo = Math.max(opcoes.intervaloMs ?? 10_000, 0);
  const dormir = opcoes.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const inicio = Date.now();
  let ultimo: StatusDoEnvio = { postSubmissionId, status: "in-progress" };
  for (let volta = 0; ; volta++) {
    await dormir(intervalo);
    try {
      ultimo = await statusDoPost(postSubmissionId);
    } catch (e) {
      // Falha de LEITURA pode tentar de novo: não cria nada na rede.
      console.warn(`[blotato] status do envio ${postSubmissionId} falhou (volta ${volta}):`, e);
    }
    if (ultimo.status !== "in-progress") return ultimo;
    if (Date.now() - inicio + intervalo > teto) return ultimo;
  }
}

/* ── Mídia ──────────────────────────────────────────────────────────────── */

/**
 * Sobe um arquivo para o armazenamento do Blotato e devolve a URL pública dele.
 *
 * Só para o que NÃO tem URL pública: a arte gravada como data URL no banco e o
 * acervo antigo no Blob privado. A rota assinada que a Meta usa
 * (/api/media/ig/[token]) não serve aqui: ela não tem extensão no endereço, e
 * o Blotato decide o tipo da mídia pelo nome do arquivo.
 *
 * Dois passos, como a documentação manda: pede a URL de envio
 * (POST /media/uploads com o nome e a extensão) e faz PUT dos bytes crus nela.
 */
export async function enviarArquivo(nome: string, bytes: Buffer, mimeType: string): Promise<string> {
  const r = await chamar<{ presignedUrl?: string; publicUrl?: string }>("/media/uploads", {
    method: "POST",
    body: { filename: nome },
  });
  if (!r.presignedUrl || !r.publicUrl) {
    throw new ErroDoBlotato("O Blotato não devolveu o endereço de envio da mídia.", 201, JSON.stringify(r).slice(0, 500));
  }
  const put = await fetch(r.presignedUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType, "Content-Length": String(bytes.byteLength) },
    body: new Uint8Array(bytes),
    signal: AbortSignal.timeout(300_000),
  });
  if (!put.ok) {
    const corpo = await put.text().catch(() => "");
    throw new ErroDoBlotato(`O envio da mídia ao Blotato falhou (${put.status}).`, put.status, corpo.slice(0, 500));
  }
  return r.publicUrl;
}

export const PLATFORM_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  twitter: "X (Twitter)",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
};
