import { randomBytes } from "crypto";

/**
 * LinkedIn "article" posts via API = link card (source URL + title + description + thumbnail),
 * not the in-app Article editor. We host the full text at /a/[token].
 */

export const LINKEDIN_ARTICLE_TITLE_MAX = 200;
export const LINKEDIN_ARTICLE_DESCRIPTION_MAX = 400;
export const LINKEDIN_ARTICLE_COMMENTARY_MAX = 3000;
export const LINKEDIN_ARTICLE_BODY_MAX = 25_000;

export interface ParsedLinkedInArticle {
  title: string;
  teaser: string;
  body: string;
}

export function parseLinkedInArticleContent(raw: string): ParsedLinkedInArticle {
  const titleMatch = raw.match(/^\s*T[IÍ]TULO:\s*(.+)$/im);
  const title = (titleMatch?.[1] ?? "").trim().slice(0, LINKEDIN_ARTICLE_TITLE_MAX);

  const teaserMatch = raw.match(/^\s*RESUMO_CARD:\s*(.+)$/im);
  let teaser = (teaserMatch?.[1] ?? "").trim();
  if (!teaser) {
    const bodyEarly = extractBody(raw);
    teaser = bodyEarly.replace(/\s+/g, " ").trim().slice(0, 280);
  }
  if (teaser.length > LINKEDIN_ARTICLE_DESCRIPTION_MAX) {
    teaser = teaser.slice(0, LINKEDIN_ARTICLE_DESCRIPTION_MAX - 1) + "…";
  }

  let body = extractBody(raw);
  if (!body.trim()) body = raw.trim();
  if (body.length > LINKEDIN_ARTICLE_BODY_MAX) {
    body = body.slice(0, LINKEDIN_ARTICLE_BODY_MAX - 1) + "…";
  }

  return {
    title: title || "Artigo",
    teaser,
    body,
  };
}

function extractBody(raw: string): string {
  const idx = raw.search(/^\s*CORPO:\s*$/im);
  if (idx === -1) return raw;
  const after = raw.slice(idx).replace(/^\s*CORPO:\s*/i, "");
  return after.trim();
}

export function buildArticlePublicUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return `${base}/a/${token}`;
}

export function newArticlePublicToken(): string {
  return randomBytes(24).toString("hex");
}
