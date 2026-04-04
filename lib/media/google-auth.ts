/**
 * Google Cloud authentication using Service Account credentials.
 * Uses pure Node.js crypto — no external dependencies needed.
 */

import { createSign } from "crypto";

interface ServiceAccountCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  token_uri: string;
}

// Simple in-memory cache to avoid requesting a new token on every call
let cachedToken: { token: string; expiresAt: number } | null = null;

export function getGCPCredentials(): ServiceAccountCredentials | null {
  const credJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!credJson) return null;
  try {
    return JSON.parse(credJson) as ServiceAccountCredentials;
  } catch (e) {
    console.error("[google-auth] Falha ao fazer parse de GOOGLE_APPLICATION_CREDENTIALS_JSON:", e);
    return null;
  }
}

export function getGCPProjectId(): string {
  const creds = getGCPCredentials();
  if (creds?.project_id) return creds.project_id;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  if (!projectId) throw new Error("GOOGLE_CLOUD_PROJECT_ID não está definido");
  return projectId;
}

export function getGCPLocation(): string {
  return process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1";
}

export async function getVertexAccessToken(): Promise<string> {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cachedToken.token;
  }

  const creds = getGCPCredentials();
  if (!creds) throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON não está definido ou é inválido");

  const now = Math.floor(Date.now() / 1000);
  const tokenUri = creds.token_uri ?? "https://oauth2.googleapis.com/token";

  const payload = {
    iss: creds.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: tokenUri,
    exp: now + 3600,
    iat: now,
  };

  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const unsigned = `${header}.${body}`;

  const sign = createSign("RSA-SHA256");
  sign.update(unsigned);
  const signature = sign.sign(creds.private_key, "base64url");
  const jwt = `${unsigned}.${signature}`;

  const tokenRes = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Falha ao obter token Google: ${err.slice(0, 300)}`);
  }

  const data = await tokenRes.json() as { access_token: string; expires_in?: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}
