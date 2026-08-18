import { get } from "@vercel/blob";

/**
 * Transcrição de vídeo com marcação de tempo por palavra.
 *
 * Por que os bytes passam pelo nosso servidor em vez de mandarmos a URL:
 * o Blob store é privado, então o arquivo devolve 403 para qualquer um sem
 * token, inclusive para a Deepgram. O SDK do Blob não emite URL assinada
 * (v2.3.2), então a leitura é sempre server-side. Lemos o blob como stream e
 * repassamos o stream adiante, sem carregar o vídeo na memória.
 */

const DEEPGRAM_URL = "https://api.deepgram.com/v1/listen";

export type Word = {
  word: string;
  start: number;
  end: number;
  confidence: number;
};

export type TranscriptResult = {
  text: string;
  durationSec: number;
  language: string;
  words: Word[];
  /** Blocos de fala já agrupados, úteis para o agente escolher trechos. */
  paragraphs: Array<{ text: string; start: number; end: number }>;
};

type DeepgramResponse = {
  metadata?: { duration?: number };
  results?: {
    channels?: Array<{
      detected_language?: string;
      alternatives?: Array<{
        transcript?: string;
        words?: Array<{
          word: string;
          punctuated_word?: string;
          start: number;
          end: number;
          confidence: number;
        }>;
        paragraphs?: {
          paragraphs?: Array<{
            sentences?: Array<{ text: string; start: number; end: number }>;
            start?: number;
            end?: number;
          }>;
        };
      }>;
    }>;
  };
};

export async function transcribeBlob(
  blobUrl: string,
  options?: { language?: string; contentType?: string }
): Promise<TranscriptResult> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error("DEEPGRAM_API_KEY não configurada");

  const blob = await get(blobUrl, {
    access: "private",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  if (!blob) throw new Error("Vídeo não encontrado no storage");

  const params = new URLSearchParams({
    model: "nova-3",
    language: options?.language ?? "pt-BR",
    // Precisamos de tempo por palavra para cortar no ponto exato. Sem isso o
    // corte cai no meio de uma palavra.
    punctuate: "true",
    smart_format: "true",
    paragraphs: "true",
    utterances: "true",
  });

  const res = await fetch(`${DEEPGRAM_URL}?${params}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": options?.contentType ?? "video/mp4",
    },
    body: blob.stream as unknown as BodyInit,
    // Exigido pelo fetch do Node quando o corpo é um stream.
    // @ts-expect-error duplex não está nos tipos do DOM, mas o Node exige.
    duplex: "half",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Deepgram respondeu ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as DeepgramResponse;
  const alt = data.results?.channels?.[0]?.alternatives?.[0];
  if (!alt) throw new Error("Deepgram não devolveu transcrição");

  const words: Word[] = (alt.words ?? []).map((w) => ({
    // punctuated_word traz a palavra já com pontuação e maiúscula, que é o
    // que queremos mostrar ao usuário e mandar para o agente.
    word: w.punctuated_word ?? w.word,
    start: w.start,
    end: w.end,
    confidence: w.confidence,
  }));

  const paragraphs = (alt.paragraphs?.paragraphs ?? []).map((p) => ({
    text: (p.sentences ?? []).map((s) => s.text).join(" "),
    start: p.start ?? p.sentences?.[0]?.start ?? 0,
    end: p.end ?? p.sentences?.[p.sentences.length - 1]?.end ?? 0,
  }));

  return {
    text: alt.transcript ?? "",
    durationSec: Math.round(data.metadata?.duration ?? 0),
    language: data.results?.channels?.[0]?.detected_language ?? options?.language ?? "pt-BR",
    words,
    paragraphs,
  };
}

/** Custo estimado em dólar. Nova-3 pré-gravado custa por minuto de áudio. */
export function estimateTranscriptionCostUsd(durationSec: number): number {
  const PER_MINUTE = 0.0043;
  return (durationSec / 60) * PER_MINUTE;
}
