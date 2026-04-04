/**
 * Reescreve .env.local mantendo só variáveis referenciadas no app (ou exigidas por Clerk/Stripe).
 * Uso: node scripts/prune-env-local.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";

const root = resolve(import.meta.dirname, "..");
const envPath = resolve(root, ".env.local");
const raw = readFileSync(envPath, "utf8");
const parsed = parse(raw);

const CLERK_RENAME = {
  CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: "NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL",
  CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: "NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL",
  CLERK_SIGN_IN_FORCE_REDIRECT_URL: "NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL",
  CLERK_SIGN_UP_FORCE_REDIRECT_URL: "NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL",
};

/** Chaves finais permitidas (valores vêm de `parsed` + renomes do Clerk). */
const ALLOW = new Set([
  "DATABASE_URL",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_SIGN_IN_URL",
  "NEXT_PUBLIC_CLERK_SIGN_UP_URL",
  "NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL",
  "NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL",
  "NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL",
  "NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_STARTER_PRICE_ID",
  "STRIPE_PRO_PRICE_ID",
  "ANTHROPIC_API_KEY",
  "NEXT_PUBLIC_APP_URL",
  "LINKEDIN_CLIENT_ID",
  "LINKEDIN_CLIENT_SECRET",
  "LINKEDIN_PAGES_CLIENT_ID",
  "LINKEDIN_PAGES_CLIENT_SECRET",
  "TWITTER_CLIENT_ID",
  "TWITTER_CLIENT_SECRET",
  "GEMINI_API_KEY",
  "CRON_SECRET",
  "GOOGLE_APPLICATION_CREDENTIALS_JSON",
  "GOOGLE_CLOUD_PROJECT_ID",
  "GOOGLE_CLOUD_LOCATION",
  "GOOGLE_CLOUD_STORAGE_BUCKET",
]);

const ORDER = [...ALLOW];

function escapeValue(v) {
  const s = String(v);
  if (/[\r\n"#$]/.test(s) || /^\s/.test(s) || /\s$/.test(s)) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n")}"`;
  }
  return s;
}

const out = {};
for (const [k, v] of Object.entries(parsed)) {
  const target = CLERK_RENAME[k] ?? k;
  if (!ALLOW.has(target)) continue;
  if (out[target] !== undefined && CLERK_RENAME[k] === undefined) continue;
  out[target] = v;
}

let body = `# Gerado por scripts/prune-env-local.mjs — só variáveis usadas no código.\n\n`;
for (const key of ORDER) {
  if (!(key in out)) continue;
  const val = out[key];
  if (val === "" || val === undefined) {
    body += `${key}=\n`;
    continue;
  }
  // JSON em uma linha: aspas externas quebram o parse do dotenv com \".
  if (key === "GOOGLE_APPLICATION_CREDENTIALS_JSON") {
    body += `${key}=${val}\n`;
    continue;
  }
  body += `${key}=${escapeValue(val)}\n`;
}

writeFileSync(envPath, body, "utf8");
console.log("OK: .env.local atualizado (" + Object.keys(out).length + " variáveis).");
