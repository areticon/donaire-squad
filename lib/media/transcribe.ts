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
  /** Confiança média das palavras, de 0 a 1. Útil na tela de aprovação. */
  meanConfidence: number;
  /** Palavras por minuto. Fala normal fica entre 100 e 160. */
  wordsPerMinute: number;
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

  const res0 = await get(blobUrl, {
    access: "private",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  if (!res0) throw new Error("Vídeo não encontrado no storage");
  // O retorno do get é união discriminada: 304 vem sem corpo. Sem esta guarda o
  // stream nulo viraria um POST de corpo vazio e a Deepgram devolveria 200 com
  // transcrição vazia, que é o pior desfecho possível (erro que parece sucesso).
  if (res0.statusCode !== 200 || !res0.stream) {
    throw new Error(`Storage devolveu ${res0.statusCode} sem corpo para o vídeo`);
  }

  const params = new URLSearchParams({
    model: "nova-3",
    language: options?.language ?? "pt-BR",
    // Precisamos de tempo por palavra para cortar no ponto exato. Sem isso o
    // corte cai no meio de uma palavra.
    punctuate: "true",
    // smart_format DESLIGADO de propósito, decisão medida em 18/08/2026.
    // Em pt-BR ele converte o artigo indefinido em algarismo: "uma indústria"
    // vira "1 indústria" e "um resumo de uma linha" vira "1 resumo de 1 linha".
    // Ligado, ganha-se "18 meses" no lugar de "dezoito meses"; desligado,
    // perde-se só a formatação do numeral e o texto fica correto. Verificado
    // que os parágrafos vêm idênticos nas duas configurações (mesmos 9 blocos,
    // mesmos limites de tempo), então desligar não custa estrutura. Transcript
    // corrompido é pior que numeral por extenso: é o que o cliente lê na tela
    // de aprovação e é a matéria-prima dos agentes, que normalizam número
    // sozinhos ao escrever o post.
    smart_format: "false",
    paragraphs: "true",
    utterances: "true",
  });

  const dgRes = await fetch(`${DEEPGRAM_URL}?${params}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      // O content type vem do próprio storage, que guardou o que o navegador
      // enviou. Chutar "video/mp4" quebraria .mov, .mkv e .webm, que o upload
      // aceita.
      "Content-Type":
        options?.contentType ?? res0.blob.contentType ?? "video/mp4",
    },
    body: res0.stream as unknown as BodyInit,
    // Exigido pelo fetch do Node quando o corpo é um stream.
    // @ts-expect-error duplex não está nos tipos do DOM, mas o Node exige.
    duplex: "half",
  });

  if (!dgRes.ok) {
    const detail = await dgRes.text().catch(() => "");
    throw new Error(
      `Deepgram respondeu ${dgRes.status}: ${detail.slice(0, 300)}`
    );
  }

  const data = (await dgRes.json()) as DeepgramResponse;
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

  const text = alt.transcript ?? "";

  const durationSec = Math.round(data.metadata?.duration ?? 0);
  const meanConfidence =
    words.length > 0
      ? words.reduce((acc, w) => acc + w.confidence, 0) / words.length
      : 0;
  const wordsPerMinute = durationSec > 0 ? words.length / (durationSec / 60) : 0;

  // Guardas contra o fracasso que se disfarça de sucesso, ambas medidas em
  // 18/08/2026 contra a API real. A Deepgram nunca sinaliza falha de
  // reconhecimento: ela responde 200 e deixa o problema passar.
  //
  // Caso 1, vazio: áudio que o modelo não entende de jeito nenhum (idioma
  // diferente do pedido, vídeo mudo, faixa de áudio ausente) devolve 200 com
  // transcript vazio.
  if (!text.trim() || words.length === 0) {
    throw new Error(
      "Deepgram devolveu transcrição vazia. Verifique se o vídeo tem faixa de " +
        "áudio audível e se o idioma da fala é o mesmo pedido."
    );
  }

  // Caso 2, lixo: o mais perigoso, porque tem texto dentro. Pedindo japonês
  // para um áudio em português a resposta veio com 63 palavras de sequências
  // sem sentido. O sinal que separa é a fração de palavras com confiança baixa:
  // 0,2% na transcrição boa contra 69,8% no lixo. A confiança média também
  // separa (0,994 contra 0,459), mas a fração é mais robusta porque não é
  // diluída por um trecho bom no meio do ruim. Palavras por minuto foi
  // descartada de propósito: cliente que grava 20 minutos e fala pouco, com
  // pausas longas, cairia no falso positivo.
  //
  // ATENÇÃO: o limite de 40% foi calibrado com áudio sintético, que é limpo
  // demais (0,2% de palavras ruins). Gravação humana com ruído de sala vai
  // ficar mais alta que isso. Recalibrar quando houver gravação real.
  const LIMITE_PALAVRAS_RUINS = 0.4;
  const fracaoRuim =
    words.filter((w) => w.confidence < 0.6).length / words.length;
  if (fracaoRuim > LIMITE_PALAVRAS_RUINS) {
    throw new Error(
      `Transcrição não confiável: ${Math.round(fracaoRuim * 100)}% das ` +
        `palavras vieram com confiança baixa (confiança média ` +
        `${meanConfidence.toFixed(2)}). O áudio provavelmente está ruidoso, ` +
        `inaudível, ou em idioma diferente do pedido.`
    );
  }

  const paragraphs = (alt.paragraphs?.paragraphs ?? []).map((p) => ({
    text: (p.sentences ?? []).map((s) => s.text).join(" "),
    start: p.start ?? p.sentences?.[0]?.start ?? 0,
    end: p.end ?? p.sentences?.[p.sentences.length - 1]?.end ?? 0,
  }));

  return {
    text,
    durationSec,
    language:
      data.results?.channels?.[0]?.detected_language ??
      options?.language ??
      "pt-BR",
    words,
    paragraphs,
    meanConfidence,
    wordsPerMinute,
  };
}

/** Custo estimado em dólar. Nova-3 pré-gravado custa por minuto de áudio. */
export function estimateTranscriptionCostUsd(durationSec: number): number {
  const PER_MINUTE = 0.0043;
  return (durationSec / 60) * PER_MINUTE;
}
