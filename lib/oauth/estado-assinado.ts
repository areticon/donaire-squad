import crypto from "crypto";

/**
 * O `state` DO OAUTH QUE SE SUSTENTA SOZINHO (04/10).
 *
 * Achado do teste do dono com uma conta nova: o login do Instagram passou e a
 * pessoa FICOU DENTRO DO INSTAGRAM. No celular, o link de autorização da Meta
 * é capturado pelo app do Instagram (ou do Facebook), e quando o app devolve
 * para a Demandou ele abre o callback no NAVEGADOR DE DENTRO DO APP. Lá não
 * existe o cookie da sessão nem os cookies `oauth_*` gravados no navegador de
 * verdade: o callback antigo via `state !== savedState` e mandava para o
 * /sign-in, e a jornada morria ali dentro.
 *
 * O conserto é o `state` carregar, assinado, o que antes só existia no
 * cookie: quem pediu, para qual projeto e para onde voltar. A assinatura usa o
 * segredo do servidor, então ninguém forja um `state` para o projeto alheio;
 * o prazo curto limita a reutilização. Com ele, o callback grava a conta em
 * qualquer navegador, e a aba original (que consulta as contas de tempos em
 * tempos) avança sozinha.
 */
export type EstadoDoOAuth = {
  /** id de quem iniciou a conexão (logado no connect). */
  u: string;
  /** projeto que recebe a conta. */
  p: string;
  /** caminho de volta, já validado por returnToSeguro no connect. */
  r: string;
  /** expira em (ms desde 1970). */
  e: number;
  /** aleatório, para dois pedidos iguais não darem o mesmo state. */
  n: string;
};

const PRAZO_MS = 15 * 60 * 1000;

function segredo(): string {
  const s = process.env.OAUTH_STATE_SEGREDO || process.env.BETTER_AUTH_SECRET;
  if (!s) throw new Error("Sem BETTER_AUTH_SECRET para assinar o state do OAuth");
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function assinatura(corpo: string): string {
  return b64url(crypto.createHmac("sha256", segredo()).update(`oauth-state:${corpo}`).digest());
}

export function assinarEstado(dados: { userId: string; projectId: string; returnTo: string }): string {
  const estado: EstadoDoOAuth = {
    u: dados.userId,
    p: dados.projectId,
    r: dados.returnTo,
    e: Date.now() + PRAZO_MS,
    n: b64url(crypto.randomBytes(9)),
  };
  const corpo = b64url(Buffer.from(JSON.stringify(estado), "utf8"));
  return `${corpo}.${assinatura(corpo)}`;
}

/** Devolve o estado se a assinatura confere e o prazo não venceu; senão null. */
export function lerEstado(state: string | null | undefined, agora = Date.now()): EstadoDoOAuth | null {
  if (!state || !state.includes(".")) return null;
  const [corpo, sig] = state.split(".", 2);
  if (!corpo || !sig) return null;
  let esperado: string;
  try {
    esperado = assinatura(corpo);
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const e = JSON.parse(Buffer.from(corpo.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as EstadoDoOAuth;
    if (typeof e.u !== "string" || typeof e.p !== "string" || typeof e.r !== "string" || typeof e.e !== "number") return null;
    if (e.e < agora) return null;
    return e;
  } catch {
    return null;
  }
}
