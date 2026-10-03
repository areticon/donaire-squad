/**
 * O CLOUDFLARE TURNSTILE, PRONTO E DESLIGADO (01/10). Só servidor.
 *
 * É o captcha invisível e gratuito da Cloudflare: na maior parte das visitas
 * ninguém clica em nada, e o navegador recebe um token que o servidor confere.
 * Não exige mudar o DNS nem passar o site pela Cloudflare.
 *
 * LIGA SOZINHO quando as DUAS chaves existem no ambiente:
 *   NEXT_PUBLIC_TURNSTILE_SITE_KEY  (a pública, vai para a tela)
 *   TURNSTILE_SECRET_KEY            (a secreta, só aqui)
 * Com uma só, fica desligado: chave pública sem a secreta desenharia o widget
 * sem ninguém conferir, e a secreta sem a pública recusaria todo mundo.
 *
 * SE A CLOUDFLARE CAIR, O ENVIO PASSA. As outras camadas (isca, tempo mínimo,
 * limite, domínio e nome) continuam valendo, e trancar o cadastro inteiro
 * porque um terceiro piscou é trocar um problema pequeno por um grande.
 */

export function turnstileLigado(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

export type VereditoDoTurnstile = { ok: true; conferido: boolean } | { ok: false };

export async function conferirTurnstile(token: unknown, ip: string | null): Promise<VereditoDoTurnstile> {
  if (!turnstileLigado()) return { ok: true, conferido: false };
  if (typeof token !== "string" || !token || token.length > 4096) return { ok: false };
  try {
    const corpo = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY!, response: token });
    if (ip && ip !== "desconhecido") corpo.set("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: corpo,
      signal: AbortSignal.timeout(5_000),
    });
    const d = (await r.json()) as { success?: boolean };
    return d.success ? { ok: true, conferido: true } : { ok: false };
  } catch (e) {
    console.warn("[anti-robo] Turnstile não respondeu; o envio segue pelas outras camadas", e instanceof Error ? e.message : e);
    return { ok: true, conferido: false };
  }
}
