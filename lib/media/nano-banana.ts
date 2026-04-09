/**
 * Image generation — priority order:
 * 1. Imagen 3 via Gemini API key (generativelanguage.googleapis.com — best quality, API key only)
 * 2. Gemini 2.0 Flash image generation (generateContent with IMAGE modality)
 * 3. Vertex AI Imagen 3 (Google Cloud service account — enterprise alternative)
 * 4. Pollinations.ai (free, no key — last resort fallback)
 */

import { getGCPCredentials, getGCPProjectId, getGCPLocation, getVertexAccessToken } from "./google-auth";

export type AspectRatio =
  | "16:9"   // Twitter/X landscape, LinkedIn video, YouTube thumb — 1600x900
  | "9:16"   // Reels/Stories — 720x1280
  | "4:3"    // Generic — 1024x768
  | "3:4"    // Portrait — 768x1024
  | "1:1"    // Square (Instagram/Twitter) — 1080x1080
  | "linkedin-landscape"  // LinkedIn recommended image — 1200x628
  | "twitter-landscape";  // Twitter/X recommended image — 1600x900

export type ImageQuality = "standard" | "hd";

/** Map platform+contentType to the recommended aspect ratio */
export function getPlatformAspectRatio(platform: string, contentType?: string): AspectRatio {
  if (contentType === "video" || contentType === "reels" || contentType === "stories") return "9:16";
  if (platform === "linkedin") return "linkedin-landscape";
  if (platform === "twitter" || platform === "x") return "twitter-landscape";
  return "linkedin-landscape"; // safe default
}

export function getImageCreditCost(): number {
  return 0;
}

const ASPECT_DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  "16:9":               { width: 1600, height: 900  },
  "9:16":               { width: 720,  height: 1280 },
  "4:3":                { width: 1024, height: 768  },
  "3:4":                { width: 768,  height: 1024 },
  "1:1":                { width: 1080, height: 1080 },
  "linkedin-landscape": { width: 1200, height: 628  },
  "twitter-landscape":  { width: 1600, height: 900  },
};

/** Aspect ratios supported by Imagen 3 (:predict endpoint) */
const IMAGEN_ASPECT_MAP: Record<AspectRatio, string> = {
  "16:9":               "16:9",
  "9:16":               "9:16",
  "4:3":                "4:3",
  "3:4":                "3:4",
  "1:1":                "1:1",
  "linkedin-landscape": "4:3",   // closest supported
  "twitter-landscape":  "16:9",
};

/**
 * Imagen 3 via Gemini API key — accessed through generativelanguage.googleapis.com.
 * Same quality as Vertex AI but only requires GEMINI_API_KEY, no service account.
 * Models tried: imagen-3.0-generate-001 → imagen-3.0-fast-generate-001
 */
async function tryImagen3ViaApiKey(prompt: string, aspectRatio: AspectRatio, apiKey: string): Promise<string | null> {
  const models = ["imagen-3.0-generate-001", "imagen-3.0-fast-generate-001"];
  const aspectParam = IMAGEN_ASPECT_MAP[aspectRatio] ?? "4:3";

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio: aspectParam,
            outputMimeType: "image/jpeg",
            addWatermark: false,
          },
        }),
        signal: AbortSignal.timeout(35_000),
      });

      if (!res.ok) {
        const errText = await res.text();
        if (res.status === 404) {
          console.warn(`[Imagen3 API][${model}] 404 — modelo não disponível, tentando próximo`);
          continue;
        }
        if (res.status === 429) {
          console.warn(`[Imagen3 API][${model}] 429 — quota excedida`);
          return null;
        }
        console.warn(`[Imagen3 API][${model}] HTTP ${res.status}: ${errText.slice(0, 150)}`);
        continue;
      }

      const data = await res.json() as { predictions?: Array<{ bytesBase64Encoded?: string }> };
      const base64 = data.predictions?.[0]?.bytesBase64Encoded;
      if (base64) {
        console.log(`[Imagen3 API] ✓ Imagem gerada com ${model}`);
        return `data:image/jpeg;base64,${base64}`;
      }

      console.warn(`[Imagen3 API][${model}] Resposta sem dados de imagem`);
    } catch (e) {
      console.warn(`[Imagen3 API][${model}] Erro:`, e);
    }
  }
  return null;
}

/**
 * Gemini Nano Banana — geração de imagem via generateContent com modality IMAGE.
 * Usa os modelos mais recentes: Nano Banana 2 → Nano Banana → Nano Banana Pro.
 */
async function tryGeminiFlashImage(prompt: string, apiKey: string): Promise<string | null> {
  const models = [
    "gemini-3.1-flash-image-preview",   // Nano Banana 2 — rápido, 4K
    "gemini-2.5-flash-image",           // Nano Banana — estável
    "gemini-3-pro-image-preview",       // Nano Banana Pro — mais lento mas melhor qualidade
  ];

  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
          }),
          signal: AbortSignal.timeout(25_000),
        }
      );

      if (!res.ok) {
        if (res.status === 404) { console.warn(`[Gemini Flash Image][${model}] 404 — pulando`); continue; }
        if (res.status === 429) { console.warn(`[Gemini Flash Image][${model}] 429 — quota`); return null; }
        console.warn(`[Gemini Flash Image][${model}] HTTP ${res.status}`);
        continue;
      }

      const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data: string; mimeType: string } }> } }> };
      const imgPart = (data.candidates?.[0]?.content?.parts ?? []).find(p => p.inlineData?.data);
      if (imgPart?.inlineData) {
        const { data: b64, mimeType } = imgPart.inlineData;
        console.log(`[Gemini Flash Image] ✓ Gerada com ${model}`);
        return `data:${mimeType ?? "image/jpeg"};base64,${b64}`;
      }
    } catch (e) {
      console.warn(`[Gemini Flash Image][${model}] Erro:`, e);
    }
  }
  return null;
}

/**
 * Vertex AI Imagen 3 — usa Service Account (GCP credentials).
 * Alternativa corporativa quando não se usa AI Studio key.
 */
async function tryVertexImagen3(prompt: string, aspectRatio: AspectRatio): Promise<string | null> {
  const creds = getGCPCredentials();
  if (!creds) return null;

  try {
    const accessToken = await getVertexAccessToken();
    const projectId = getGCPProjectId();
    const location = getGCPLocation();
    const models = ["imagen-3.0-generate-001", "imagen-3.0-fast-generate-001"];

    for (const model of models) {
      try {
        const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            instances: [{ prompt }],
            parameters: {
              sampleCount: 1,
              aspectRatio: IMAGEN_ASPECT_MAP[aspectRatio] ?? "4:3",
              outputMimeType: "image/jpeg",
              addWatermark: false,
            },
          }),
          signal: AbortSignal.timeout(35_000),
        });

        if (!res.ok) {
          const errText = await res.text();
          if (res.status === 404) { console.warn(`[Vertex Imagen][${model}] 404`); continue; }
          if (res.status === 403) { console.warn(`[Vertex Imagen][${model}] 403 — permissão negada`); return null; }
          if (res.status === 429) { console.warn(`[Vertex Imagen][${model}] 429 — quota`); return null; }
          throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
        }

        const data = await res.json() as { predictions?: Array<{ bytesBase64Encoded?: string }> };
        const base64 = data.predictions?.[0]?.bytesBase64Encoded;
        if (base64) {
          console.log(`[Vertex Imagen] ✓ Imagem gerada com ${model}`);
          return `data:image/jpeg;base64,${base64}`;
        }
      } catch (modelErr) {
        console.warn(`[Vertex Imagen][${model}] Erro:`, modelErr);
      }
    }
  } catch (authErr) {
    console.warn("[Vertex Imagen] Erro de autenticação:", authErr);
  }
  return null;
}

/**
 * Pollinations.ai — último recurso, sem API key.
 * Tenta flux-pro → flux → turbo; retenta 1x em erros de rede.
 */
async function tryPollinationsAI(
  prompt: string,
  aspectRatio: AspectRatio,
  quality: ImageQuality
): Promise<string | null> {
  const { width, height } = ASPECT_DIMENSIONS[aspectRatio] ?? { width: 1024, height: 768 };
  const models = quality === "hd" ? ["flux-pro", "flux", "turbo"] : ["flux", "turbo", "flux-pro"];
  const encodedPrompt = encodeURIComponent(prompt.slice(0, 800));

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const seed = Math.floor(Math.random() * 1_000_000);
      const url =
        `https://image.pollinations.ai/prompt/${encodedPrompt}` +
        `?width=${width}&height=${height}&model=${model}&nologo=true&enhance=true&seed=${seed}`;

      try {
        console.log(`[Pollinations] ${model} ${width}x${height} tentativa ${attempt + 1}...`);
        const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(25_000) });

        if (!res.ok) { console.warn(`[Pollinations] ${model} HTTP ${res.status}`); break; }

        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.startsWith("image/")) { console.warn(`[Pollinations] ${model} content-type inesperado: ${contentType}`); break; }

        const buffer = await res.arrayBuffer();
        if (buffer.byteLength < 2000) {
          console.warn(`[Pollinations] ${model} resposta pequena (${buffer.byteLength}b)`);
          continue;
        }

        const base64 = Buffer.from(buffer).toString("base64");
        console.log(`[Pollinations] ✓ ${model} (${Math.round(buffer.byteLength / 1024)}KB)`);
        return `data:${contentType.split(";")[0]};base64,${base64}`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isRetryable = msg.includes("fetch failed") || msg.includes("ECONNRESET") || msg.includes("timeout") || msg.includes("abort");
        console.warn(`[Pollinations] ${model} tentativa ${attempt + 1} erro: ${msg}`);
        if (!isRetryable) break;
        if (attempt === 0) await new Promise<void>((r) => setTimeout(r, 3000));
      }
    }
  }
  return null;
}

export async function generateImage(
  prompt: string,
  aspectRatio: AspectRatio = "4:3",
  quality: ImageQuality = "standard"
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;

  // ── 1. Imagen 3 via Gemini API key (melhor qualidade, só precisa da API key) ──
  if (apiKey) {
    const imagen3Result = await tryImagen3ViaApiKey(prompt, aspectRatio, apiKey);
    if (imagen3Result) return imagen3Result;
  }

  // ── 2. Gemini 2.0 Flash image generation (também via API key) ────────────────
  if (apiKey) {
    const flashResult = await tryGeminiFlashImage(prompt, apiKey);
    if (flashResult) return flashResult;
  }

  // ── 3. Vertex AI Imagen 3 (service account — alternativa corporativa) ─────────
  const vertexResult = await tryVertexImagen3(prompt, aspectRatio);
  if (vertexResult) return vertexResult;

  // ── 4. Pollinations.ai (último recurso, sem chave) ────────────────────────────
  console.warn("[generateImage] Tentando Pollinations.ai como último recurso...");
  const pollinationsResult = await tryPollinationsAI(prompt, aspectRatio, quality);
  if (pollinationsResult) return pollinationsResult;

  throw new Error(
    "Não foi possível gerar a imagem agora. Use o chat do card para descrever a imagem desejada e a Diana vai gerá-la."
  );
}

/** Extract raw base64 bytes from a data URL for uploading to social APIs */
export function dataUrlToBuffer(dataUrl: string): Buffer {
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
  return Buffer.from(base64, "base64");
}
