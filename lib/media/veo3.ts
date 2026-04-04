/**
 * Video generation using Google Veo via Vertex AI.
 *
 * Model priority (all GA — no special access needed):
 *   1. veo-3.0-generate-001  (Veo 3 GA, best quality)
 *   2. veo-2.0-generate-001  (Veo 2 GA, reliable fallback)
 *
 * Output: videos are stored in GCS and returned as public HTTPS URLs.
 * Requires GOOGLE_CLOUD_STORAGE_BUCKET env variable pointing to a public bucket.
 *
 * Polling uses the correct POST /fetchPredictOperation endpoint (not GET).
 */

import { getGCPCredentials, getGCPProjectId, getGCPLocation, getVertexAccessToken } from "./google-auth";

export type VideoAspectRatio = "16:9" | "9:16";
export type VideoResolution = "720p" | "1080p";

export function getVideoCreditCost(): number {
  return 0;
}

/** Thrown when Veo is not accessible or times out */
export class VeoUnavailableError extends Error {
  constructor(reason: string) {
    super(`Veo indisponível: ${reason}`);
    this.name = "VeoUnavailableError";
  }
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/** Convert gs://bucket/path/file.mp4 → https://storage.googleapis.com/bucket/path/file.mp4 */
function gcsToHttps(gcsUri: string): string {
  if (gcsUri.startsWith("gs://")) {
    return gcsUri.replace("gs://", "https://storage.googleapis.com/");
  }
  return gcsUri;
}

/**
 * Generate video using Veo on Vertex AI.
 * Uses the correct predictLongRunning + fetchPredictOperation flow.
 * Videos are stored in the GCS bucket and returned as public HTTPS URLs.
 */
async function generateVideoViaVertexAI(
  prompt: string,
  aspectRatio: VideoAspectRatio,
  modelId: string,
  timeoutMs: number,
  durationSeconds: number,
  allowPeople: boolean,
  generateAudio: boolean
): Promise<string | null> {
  const creds = getGCPCredentials();
  if (!creds) {
    console.warn("[Veo] GOOGLE_APPLICATION_CREDENTIALS_JSON não configurado");
    return null;
  }

  const bucket = process.env.GOOGLE_CLOUD_STORAGE_BUCKET;
  if (!bucket) {
    console.warn("[Veo] GOOGLE_CLOUD_STORAGE_BUCKET não configurado — vídeos requerem um bucket GCS");
    return null;
  }

  const deadline = Date.now() + timeoutMs;

  try {
    const accessToken = await getVertexAccessToken();
    const projectId = getGCPProjectId();
    const location = getGCPLocation();

    // Output path in GCS: gs://bucket/videos/{timestamp}/
    const outputPrefix = `videos/${Date.now()}`;
    const storageUri = `gs://${bucket}/${outputPrefix}`;

    const submitUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelId}:predictLongRunning`;

    console.log(`[Veo] Enviando job com modelo ${modelId}...`);

    const submitRes = await fetch(submitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          storageUri,
          aspectRatio,
          durationSeconds,
          sampleCount: 1,
          personGeneration: (allowPeople || generateAudio) ? "allow_adult" : "disallow",
          generateAudio,
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text();
      if (submitRes.status === 403 || submitRes.status === 404) {
        console.warn(`[Veo] ${modelId} — ${submitRes.status}: modelo não disponível nesta conta`);
        return null;
      }
      if (submitRes.status === 429) {
        console.warn(`[Veo] ${modelId} — 429: quota excedida`);
        return null;
      }
      throw new VeoUnavailableError(`Submit HTTP ${submitRes.status}: ${errText.slice(0, 200)}`);
    }

    const submitData = await submitRes.json() as { name?: string };
    const operationName = submitData.name;
    if (!operationName) throw new VeoUnavailableError("resposta do submit sem nome de operação");

    console.log(`[Veo] Job enviado: ${operationName} — aguardando (limite: ${Math.round(timeoutMs / 1000)}s)...`);

    // Correct polling endpoint: POST .../fetchPredictOperation
    const fetchOpUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelId}:fetchPredictOperation`;
    const interval = 10_000; // poll every 10s

    while (Date.now() < deadline) {
      await sleep(interval);
      if (Date.now() >= deadline) break;

      let pollData: {
        done?: boolean;
        error?: { message: string };
        response?: {
          videos?: Array<{ gcsUri?: string; mimeType?: string }>;
          raiMediaFilteredCount?: number;
        };
      };

      try {
        const pollRes = await fetch(fetchOpUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ operationName }),
          signal: AbortSignal.timeout(20_000),
        });

        if (!pollRes.ok) {
          console.warn(`[Veo] Poll HTTP ${pollRes.status} — continuando...`);
          continue;
        }
        pollData = await pollRes.json();
      } catch {
        continue;
      }

      if (!pollData.done) continue;

      if (pollData.error) throw new VeoUnavailableError(`Job falhou: ${pollData.error.message}`);

      const videos = pollData.response?.videos;
      if (!videos?.length) throw new VeoUnavailableError("sem vídeos na resposta");

      const gcsUri = videos[0].gcsUri;
      if (!gcsUri) throw new VeoUnavailableError("gcsUri ausente na resposta");

      const publicUrl = gcsToHttps(gcsUri);
      console.log(`[Veo] ✅ Vídeo gerado: ${publicUrl}`);
      return publicUrl;
    }

    throw new VeoUnavailableError(`timeout após ${Math.round(timeoutMs / 1000)}s`);

  } catch (e) {
    if (e instanceof VeoUnavailableError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[Veo] Erro inesperado com ${modelId}: ${msg}`);
    return null;
  }
}

/**
 * Generate video with Veo (tries GA models in order).
 * @param timeoutMs Max time per model attempt (default 150s to fit in 5-min pipeline budget)
 * @param durationSeconds Length of generated video (5, 6, or 8 seconds)
 * @param allowPeople Whether to allow people/faces in the video (default false for B-roll)
 * @throws VeoUnavailableError if all models fail or bucket is not configured
 */
export async function generateVideo(
  prompt: string,
  aspectRatio: VideoAspectRatio = "9:16",
  _resolution: VideoResolution = "720p",
  timeoutMs = 150_000,
  durationSeconds: 5 | 6 | 8 = 8,
  allowPeople = false,
  generateAudio = false
): Promise<string> {
  if (!process.env.GOOGLE_CLOUD_STORAGE_BUCKET) {
    throw new VeoUnavailableError(
      "GOOGLE_CLOUD_STORAGE_BUCKET não configurado. Crie um bucket GCS público e adicione a variável ao .env.local"
    );
  }

  // Model order: cheapest first, then quality fallbacks
  // Veo 3 Fast: $0.10/s video, $0.15/s with audio
  // Veo 3:      $0.20/s video, $0.40/s with audio
  // Veo 2:      $0.50/s (last resort)
  const modelsToTry = ["veo-3.0-fast-generate-001", "veo-3.0-generate-001", "veo-2.0-generate-001"] as const;

  for (const modelId of modelsToTry) {
    try {
      const result = await generateVideoViaVertexAI(prompt, aspectRatio, modelId, timeoutMs, durationSeconds, allowPeople, generateAudio);
      if (result) return result;
    } catch (e) {
      if (e instanceof VeoUnavailableError) {
        const msg = e.message;
        if (!msg.includes("não disponível") && !msg.includes("quota")) throw e;
        console.warn(`[Veo] ${modelId} indisponível, tentando próximo modelo...`);
      }
    }
  }

  throw new VeoUnavailableError(
    "Nenhum modelo Veo disponível. Verifique se o Vertex AI API está habilitado em console.cloud.google.com e se o bucket GCS está configurado."
  );
}
