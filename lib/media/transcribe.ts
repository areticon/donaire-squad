import { get } from "@vercel/blob";
import { MAX_KEYTERMS } from "./keyterms";
import { recordTranscricao, type ContextoMidia } from "./usage";

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

/**
 * Parâmetros da chamada, compartilhados pelo modo direto e pelo assíncrono.
 *
 * Ficam juntos porque cada decisão aqui foi medida contra a API real, e ter
 * duas cópias garantiria que uma delas ficaria para trás na próxima mudança.
 */
function montarParametros(options?: {
  language?: string;
  keyterms?: string[];
}): URLSearchParams {
  const params = new URLSearchParams({
    model: "nova-3",
    // multi, e não pt-BR, decisão medida contra gravação humana em 18/08/2026.
    //
    // O nova-3 em pt-BR APAGA jargão em inglês, sem erro e sem rastro. Numa
    // gravação de teste o cliente disse "payback, budget" e o transcript
    // deixou um buraco de 3,68 s no lugar, contra 1,04 s do segundo maior
    // buraco da gravação inteira. Palavra isolada some sem deixar nem buraco:
    // o modelo estica as palavras vizinhas para cobrir o áudio descartado.
    // Isso é fatal para o ICP, que fala payback, budget, deadline, board, ROI,
    // insight, benchmark e framework o tempo todo.
    //
    // O multi recupera o inglês sem precisar saber nada de antemão. O preço é
    // que ele come o artigo indefinido ("vou fazer vídeo curto" no lugar de
    // "vou fazer um vídeo curto") e erra nome próprio, que o keyterm conserta.
    //
    // O critério da escolha: perder palavra funcional é ruído gramatical que o
    // agente redator conserta sozinho ao escrever o post. Perder palavra de
    // conteúdo apaga o assunto da frase e deixa a referência seguinte sem
    // antecedente, o que faz o agente do Passo 3 escolher trecho incoerente.
    language: options?.language ?? "multi",
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

  // Nomes próprios do cliente. Limitado a MAX_KEYTERMS porque o keyterm satura:
  // ver a explicação medida em lib/media/keyterms.ts.
  for (const termo of (options?.keyterms ?? []).slice(0, MAX_KEYTERMS)) {
    params.append("keyterm", termo);
  }
  return params;
}

export async function transcribeBlob(
  blobUrl: string,
  options?: {
    language?: string;
    contentType?: string;
    keyterms?: string[];
    /** Sem isto o custo da transcrição não aparece em lugar nenhum. */
    usage?: ContextoMidia;
  }
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

  const params = montarParametros(options);

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
  const resultado = interpretarResposta(data, options?.language);

  if (options?.usage) {
    const usado = (options?.language ?? "multi") === "multi" ? "nova-3-multi" : "nova-3";
    recordTranscricao(usado, resultado.durationSec, options.usage);
  }

  return resultado;
}

/**
 * Interpreta a resposta da Deepgram e aplica as guardas.
 *
 * Vive separado porque o modo assíncrono recebe exatamente o mesmo corpo, só
 * que por webhook em vez de resposta direta. Duplicar as guardas seria garantir
 * que uma das duas cópias ficaria para trás.
 */
export function interpretarResposta(
  data: DeepgramResponse,
  idiomaPedido?: string
): TranscriptResult {
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
      data.results?.channels?.[0]?.detected_language ?? idiomaPedido ?? "multi",
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

/**
 * Modo assíncrono: a Deepgram devolve na hora e avisa por webhook quando termina.
 *
 * Por que isto existe: no modo direto a função fica segurando a requisição
 * enquanto o áudio inteiro atravessa o nosso servidor duas vezes, e vídeo longo
 * esbarra no `maxDuration` da Vercel. Pior, medido em 18/08: transcrever um
 * arquivo de 92 MB direto do blob estourou com `SocketError: other side closed`
 * depois de 28 MB, por contrapressão, porque a perna de saída era mais lenta
 * que a de entrada e o CDN derrubou a conexão ociosa.
 *
 * A restrição que define o desenho: **o callback precisa alcançar um endereço
 * público.** Em desenvolvimento a Deepgram não enxerga o localhost, então quem
 * chama precisa decidir entre os dois modos, e é por isso que
 * `suportaCallback()` existe.
 */
export async function transcribeBlobAsync(
  blobUrl: string,
  callbackUrl: string,
  options?: { language?: string; contentType?: string; keyterms?: string[] }
): Promise<{ requestId: string }> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error("DEEPGRAM_API_KEY não configurada");

  const res0 = await get(blobUrl, {
    access: "private",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  if (!res0 || res0.statusCode !== 200 || !res0.stream) {
    throw new Error("Vídeo não encontrado ou sem corpo no storage");
  }

  const params = montarParametros(options);
  params.set("callback", callbackUrl);
  params.set("callback_method", "post");

  const dgRes = await fetch(`${DEEPGRAM_URL}?${params}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type":
        options?.contentType ?? res0.blob.contentType ?? "video/mp4",
    },
    body: res0.stream as unknown as BodyInit,
    // @ts-expect-error duplex não está nos tipos do DOM, mas o Node exige.
    duplex: "half",
  });

  if (!dgRes.ok) {
    const detail = await dgRes.text().catch(() => "");
    throw new Error(
      `Deepgram respondeu ${dgRes.status}: ${detail.slice(0, 300)}`
    );
  }

  const data = (await dgRes.json()) as { request_id?: string };
  if (!data.request_id) {
    throw new Error("Deepgram não devolveu request_id no modo assíncrono");
  }
  return { requestId: data.request_id };
}

/**
 * O callback só serve se a Deepgram conseguir chegar até nós. Em localhost ela
 * não chega, e mandar um callback para um endereço inalcançável faria o
 * trabalho sumir em silêncio: a Deepgram transcreveria, cobraria, e o resultado
 * não voltaria para lugar nenhum.
 */
export function suportaCallback(): boolean {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return /^https:\/\//.test(base) && !base.includes("localhost");
}
