import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * O CARIMBO DE TEMPO DO FORMULÁRIO (01/10). Só servidor: usa o segredo.
 *
 * Quando a tela abre, o navegador pede um carimbo com a hora em que ele foi
 * emitido, assinado com o segredo da aplicação. O envio devolve o carimbo, e o
 * servidor confere duas coisas: que a assinatura é nossa (ninguém fabrica um
 * carimbo antigo para parecer que esperou) e que passou o tempo mínimo entre
 * abrir e enviar.
 *
 * Duas portas se fecham com isso:
 *
 * - o robô que chama a rota de API direto, sem abrir a tela, não tem carimbo;
 * - o robô que abre a tela e preenche tudo em menos de um segundo chega cedo
 *   demais.
 *
 * Gente não percebe nada: o formulário espera sozinho o que faltar do tempo
 * mínimo antes de enviar (ver components/anti-robo/use-anti-robo.tsx), então
 * o preenchimento automático do navegador não vira erro na tela.
 */

/** Menos que isto entre abrir a tela e enviar é robô. Gente leva 10 s ou mais. */
export const TEMPO_MINIMO_MS = 3_000;
/** Carimbo velho demais não vale: a tela que ficou aberta pede outro sozinha. */
export const VALIDADE_MS = 12 * 60 * 60 * 1000;

function segredo(): string {
  return process.env.BETTER_AUTH_SECRET ?? "demandou-anti-robo";
}

function assinar(t: number): string {
  return createHmac("sha256", segredo()).update(`anti-robo:${t}`).digest("base64url").slice(0, 32);
}

export function emitirCarimbo(agora = Date.now()): string {
  return `v1.${agora}.${assinar(agora)}`;
}

export type LeituraDoCarimbo =
  | { ok: true; idadeMs: number }
  | { ok: false; motivo: "sem_carimbo" | "carimbo_invalido" | "carimbo_vencido" };

export function lerCarimbo(carimbo: unknown, agora = Date.now()): LeituraDoCarimbo {
  if (typeof carimbo !== "string" || !carimbo) return { ok: false, motivo: "sem_carimbo" };
  const [versao, tTexto, assinatura] = carimbo.split(".");
  const t = Number(tTexto);
  if (versao !== "v1" || !Number.isFinite(t) || !assinatura) return { ok: false, motivo: "carimbo_invalido" };
  const esperado = Buffer.from(assinar(t));
  const recebido = Buffer.from(assinatura);
  // Comparação em tempo constante: a diferença de tempo não ensina a assinatura.
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) {
    return { ok: false, motivo: "carimbo_invalido" };
  }
  const idadeMs = agora - t;
  // Carimbo "do futuro" é forjado ou relógio torto; nos dois casos não vale.
  if (idadeMs < -5_000) return { ok: false, motivo: "carimbo_invalido" };
  if (idadeMs > VALIDADE_MS) return { ok: false, motivo: "carimbo_vencido" };
  return { ok: true, idadeMs };
}
