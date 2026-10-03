/**
 * Os pixels de anúncio das plataformas onde a Demandou vai comprar tráfego.
 *
 * Três decisões que este módulo carrega, e as três são de risco e não de gosto:
 *
 * 1. **Id por variável de ambiente, nunca no código.** Pixel colado no código
 *    vaza para o repositório e, pior, não dá para desligar sem deploy. Se a
 *    variável não existe, o pixel simplesmente não carrega, que é o
 *    comportamento certo em desenvolvimento e em pré-visualização.
 *
 * 2. **Nada carrega antes do consentimento.** A política de privacidade diz que
 *    a base legal do marketing é consentimento (LGPD art. 7, I). Carregar o
 *    pixel da Meta no primeiro byte e escrever "pedimos consentimento" na
 *    política é contradição que o revisor da Meta e o da ANPD leem no mesmo
 *    lugar: a aba de rede do navegador.
 *
 * 3. **O que é medição própria continua rodando.** O funil da Demandou é medido
 *    no BANCO (lib/funil/eventos), não em pixel de terceiro, então recusar
 *    cookie de marketing não cega o negócio. É por isso que dá para respeitar
 *    o "não" sem discutir.
 */

export type Pixels = {
  /** Meta Pixel, para Facebook e Instagram Ads. Só o número. */
  meta: string | null;
  /** Google, tanto GA4 (G-XXXX) quanto Google Ads (AW-XXXX). */
  google: string | null;
  /** LinkedIn Insight Tag: o Partner ID numérico. */
  linkedin: string | null;
  /** TikTok Pixel. */
  tiktok: string | null;
};

/**
 * Lido no SERVIDOR e passado pronto para o componente. As variáveis são
 * `NEXT_PUBLIC_` porque o valor chega ao navegador de qualquer forma: um id de
 * pixel é público por natureza, qualquer visitante o lê no HTML.
 */
export function pixelsConfigurados(): Pixels {
  const limpa = (v: string | undefined) => {
    const s = (v ?? "").trim();
    return s.length ? s : null;
  };
  return {
    meta: limpa(process.env.NEXT_PUBLIC_META_PIXEL_ID),
    google: limpa(process.env.NEXT_PUBLIC_GOOGLE_TAG_ID),
    linkedin: limpa(process.env.NEXT_PUBLIC_LINKEDIN_PARTNER_ID),
    tiktok: limpa(process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID),
  };
}

export function algumPixelConfigurado(p: Pixels): boolean {
  return Boolean(p.meta || p.google || p.linkedin || p.tiktok);
}

/** A chave do consentimento no navegador, e a versão dela. */
export const CHAVE_DE_CONSENTIMENTO = "demandou.consentimento.v1";

export type Consentimento = "aceito" | "recusado" | null;

export function lerConsentimento(): Consentimento {
  try {
    const v = localStorage.getItem(CHAVE_DE_CONSENTIMENTO);
    return v === "aceito" || v === "recusado" ? v : null;
  } catch {
    // Navegador com armazenamento bloqueado: trata como ainda não respondido,
    // e sem resposta nada carrega. Falhar para o lado que não rastreia.
    return null;
  }
}
