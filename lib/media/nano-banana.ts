import { gravarCustoDeImagem, precoDaImagem, type ContextoMidia } from "@/lib/media/usage";
import {
  FICHAS,
  RecuoParaOGoogle,
  ehDaHiggsfield,
  ehDaOpenAI,
  gerarNaHiggsfield,
  geradorDoTipo,
  tipoDaOperacao,
  type ImagemGerada,
  type TipoDeImagem,
} from "@/lib/media/imagem-higgsfield";
import { ehSemSaldoDaOpenAI, gerarImagemOpenAIComCusto, temChaveDaOpenAI, type QualidadeDaOpenAI } from "@/lib/media/gpt-image";
/**
 * Geração de imagem. Desde 01/10 a PRIMEIRA opção é a Higgsfield, com o
 * modelo escolhido por tipo de imagem (lib/media/imagem-higgsfield.ts: GPT
 * Image 2.5 baixa para colagem, arte e fundo; Recraft V4.1 para elemento;
 * Grok Imagine 2.0 para editar o cenário), aprovada pelo Bruno depois da prova
 * de 30/09. O que está abaixo virou o RECUO, na mesma ordem de antes:
 * 1. Imagen 3 via Gemini API key
 * 2. Gemini Nano Banana (generateContent com IMAGE)
 * 3. Vertex AI Imagen 3 (service account)
 * 4. Pollinations.ai (grátis, último recurso)
 */

import { getGCPCredentials, getGCPProjectId, getGCPLocation, getVertexAccessToken } from "./google-auth";
import { formatoDaPeca } from "./formatos-das-redes";

export type AspectRatio =
  | "16:9"   // Twitter/X landscape, LinkedIn video, YouTube thumb — 1600x900
  | "9:16"   // Reels/Stories — 1080x1920
  | "4:5"    // Feed do Instagram e carrossel — 1080x1350
  | "4:3"    // Generic — 1024x768
  | "3:4"    // Portrait — 768x1024
  | "1:1"    // Square (Instagram/Twitter) — 1080x1080
  | "linkedin-landscape"  // LinkedIn recommended image — 1200x628
  | "twitter-landscape";  // Twitter/X recommended image — 1600x900

export type ImageQuality = "standard" | "hd";

/**
 * A proporção recomendada para uma rede.
 *
 * Desde 19/09 a resposta sai de `lib/media/formatos-das-redes.ts`, que é a
 * tabela única do projeto. Esta função continua existindo porque chamadas
 * antigas dependem dela, mas ela não decide mais nada por conta própria: a
 * decisão de formato ter dois donos foi parte do defeito que fez toda imagem
 * sair 1376x768.
 */
export function getPlatformAspectRatio(platform: string, contentType?: string): AspectRatio {
  return formatoDaPeca(platform, contentType).proporcao;
}

export function getImageCreditCost(): number {
  return 0;
}

const ASPECT_DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  "16:9":               { width: 1600, height: 900  },
  "9:16":               { width: 1080, height: 1920 },
  "4:5":                { width: 1080, height: 1350 },
  "4:3":                { width: 1024, height: 768  },
  "3:4":                { width: 768,  height: 1024 },
  "1:1":                { width: 1080, height: 1080 },
  "linkedin-landscape": { width: 1200, height: 628  },
  "twitter-landscape":  { width: 1600, height: 900  },
};

/**
 * O nome INTERNO do formato traduzido para o que a API do Google aceita.
 *
 * Vale para os DOIS caminhos, e isso mudou em 10/09. O Imagen já traduzia; o
 * Gemini mandava o nome interno cru, e "linkedin-landscape" não é um valor
 * válido para ninguém: a API devolvia **HTTP 400 nos três modelos**, a cascata
 * caía no Pollinations e o cliente recebia uma imagem sofrível, ou nenhuma.
 * Como `getPlatformAspectRatio` devolve "linkedin-landscape" para o LinkedIn e
 * também como padrão, isso valia para quase toda imagem de campanha.
 *
 * Achado no log da prova da fila, e não por alguém reclamar: os três 400
 * seguidos estavam ali em toda execução, e o fallback os escondia entregando
 * alguma coisa.
 *
 * `linkedin-landscape` é 1200x628, ou seja 1,91:1, que fica muito mais perto de
 * 16:9 (1,78) do que de 4:3 (1,33). O corte final para 1200x628 tira pouco de
 * uma imagem 16:9 e tirava um terço de uma 4:3.
 */
const ASPECTO_ACEITO: Record<AspectRatio, string> = {
  "16:9":               "16:9",
  "9:16":               "9:16",
  "4:5":                "4:5",
  "4:3":                "4:3",
  "3:4":                "3:4",
  "1:1":                "1:1",
  "linkedin-landscape": "16:9",
  "twitter-landscape":  "16:9",
};

/**
 * O preço REAL de uma imagem do Google (01/10). O código gravava US$ 0,039
 * para o Nano Banana 2, que é o preço do 2.5 em 1K; o 3.1 cobra US$ 0,067 em
 * 1K e US$ 0,101 em 2K, e "hd" pede 2K. O 2.5 só faz 1K, peça o que pedir. Na
 * edição soma a imagem de entrada (~US$ 0,002 no Pro), daí os 0,136 medidos.
 */
function precoDoGoogle(model: string, quality: ImageQuality, edicao = false): number {
  const entrada = edicao ? 0.002 : 0;
  if (model === "gemini-3.1-flash-image-preview") return (quality === "hd" ? 0.101 : 0.067) + entrada;
  return (precoDaImagem(model) ?? 0.134) + entrada;
}

/**
 * Imagen 3 via Gemini API key — accessed through generativelanguage.googleapis.com.
 * Same quality as Vertex AI but only requires GEMINI_API_KEY, no service account.
 * Models tried: imagen-3.0-generate-001 → imagen-3.0-fast-generate-001
 */
async function tryImagen3ViaApiKey(prompt: string, aspectRatio: AspectRatio, apiKey: string, ctx?: ContextoMidia): Promise<ImagemGerada | null> {
  const models = ["imagen-3.0-generate-001", "imagen-3.0-fast-generate-001"];
  const aspectParam = ASPECTO_ACEITO[aspectRatio] ?? "4:3";

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
        const custoUsd = precoDoGoogle(model, "standard");
        if (ctx) gravarCustoDeImagem(model, custoUsd, ctx);
        return { dataUrl: `data:image/jpeg;base64,${base64}`, modelo: model, custoUsd };
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
async function tryGeminiFlashImage(
  prompt: string,
  apiKey: string,
  ctx?: ContextoMidia,
  aspectRatio?: AspectRatio,
  quality: ImageQuality = "standard"
): Promise<ImagemGerada | null> {
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
            generationConfig: {
              responseModalities: ["IMAGE", "TEXT"],
              // Sem `imageConfig` o modelo devolve o tamanho padrao, que medido
              // em 24/08 e 768x1376. Para um corte de 1080x1920 isso e ampliar
              // 1,4 vezes, e ampliacao amolece a imagem: foi parte do "amador
              // demais, sem qualidade" que o Bruno reprovou.
              //
              // Medido no mesmo dia, mesmo prompt: 2K devolve 1536x2752 em
              // 13,6s com 2,4 MB, e 4K devolve 3072x5504 em 22,8s com 7,6 MB.
              // Depois de reduzir para 1080 de largura os dois ficam iguais aos
              // olhos, entao 4K seria pagar tres vezes a transferencia por
              // nada. 2K e o menor tamanho que dispensa ampliacao.
              ...(aspectRatio || quality === "hd"
                ? {
                    imageConfig: {
                      // Traduzido, nunca cru: o nome interno derrubava a
                      // chamada com 400 nos tres modelos.
                      ...(aspectRatio ? { aspectRatio: ASPECTO_ACEITO[aspectRatio] ?? "16:9" } : {}),
                      ...(quality === "hd" ? { imageSize: "2K" } : {}),
                    },
                  }
                : {}),
            },
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
        const custoUsd = precoDoGoogle(model, quality);
        if (ctx) gravarCustoDeImagem(model, custoUsd, ctx);
        return { dataUrl: `data:${mimeType ?? "image/jpeg"};base64,${b64}`, modelo: model, custoUsd };
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
async function tryVertexImagen3(prompt: string, aspectRatio: AspectRatio, ctx?: ContextoMidia): Promise<ImagemGerada | null> {
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
              aspectRatio: ASPECTO_ACEITO[aspectRatio] ?? "4:3",
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
          const custoUsd = precoDoGoogle(model, "standard");
          if (ctx) gravarCustoDeImagem(model, custoUsd, ctx);
          return { dataUrl: `data:image/jpeg;base64,${base64}`, modelo: model, custoUsd };
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
): Promise<ImagemGerada | null> {
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
        return { dataUrl: `data:${contentType.split(";")[0]};base64,${base64}`, modelo: `pollinations-${model}`, custoUsd: 0 };
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

export type OpcoesDaImagem = {
  /** O tipo de imagem, quando a operação não diz (ver `tipoDaOperacao`). */
  tipo?: TipoDeImagem;
  /**
   * Epoch em ms: depois disto não se espera a Higgsfield, vai direto ao
   * Google. A montagem passa o fim da janela dela (o passo tem prazo).
   */
  higgsfieldAte?: number;
  /**
   * Pula o modelo principal do tipo e vai direto ao recuo (01/10). É o
   * "desenharAlternativo" da arte por rede: quando o revisor reprova por
   * texto desenhado, refazer no MESMO modelo repete o defeito.
   */
  outroModelo?: boolean;
};

/**
 * PESSOA DESENHADA É SEMPRE ANÔNIMA (01/10). Na prova lado a lado das artes, o
 * "recorte de foto de uma pessoa discursando" saiu com o rosto de uma política
 * conhecida, nos três modelos. Arte de cliente com rosto de figura pública é
 * risco de imagem e de direito de imagem, e os termos proíbem. A frase entra em
 * toda geração a partir de texto; a edição sobre a foto do próprio cliente não
 * passa por aqui. Vai no fim para não brigar com a direção de arte.
 */
// Figura histórica ou bíblica pedida pelo cliente (02/10: "Jesus falando com
// a multidão, com roupas da época") é permitida, com respeito; o que continua
// proibido é a pessoa REAL CONTEMPORÂNEA identificável. Uma frase curta
// (02/10, prova A/B): o muro de negativas não barrava nada e tirava a cara de
// foto; quem barra é a conferência por visão. Prompt que já traz a guarda
// (montagem, arte sem texto) não ganha outra.
const PESSOA_ANONIMA = " Any person shown is fictional or historical, modestly dressed, never a real public figure.";
function comPessoaAnonima(prompt: string): string {
  return /real (contemporary person|public figure)|no people in frame/i.test(prompt) ? prompt : prompt.trimEnd() + PESSOA_ANONIMA;
}

/**
 * Gera a imagem e diz QUEM gerou e QUANTO custou (01/10). A montagem precisa
 * do custo real no extrato do corte, e com a Higgsfield na frente ele varia de
 * US$ 0,025 a 0,101 conforme quem respondeu.
 */
export async function gerarImagem(
  prompt: string,
  aspectRatio: AspectRatio = "4:3",
  quality: ImageQuality = "standard",
  ctx?: ContextoMidia,
  opcoes: OpcoesDaImagem = {}
): Promise<ImagemGerada> {
  // Sem contexto o custo também é gravado (01/10): o chat do card e o
  // "refazer peça" chamavam sem ctx, e essas imagens não apareciam no extrato.
  const contexto: ContextoMidia = ctx ?? { operation: "imagem_sem_contexto" };
  prompt = comPessoaAnonima(prompt);
  const tipo = opcoes.tipo ?? tipoDaOperacao(contexto.operation);
  const gerador = geradorDoTipo(tipo);
  if (!opcoes.outroModelo && ehDaHiggsfield(gerador)) {
    try {
      return await gerarNaHiggsfield({
        gerador,
        prompt,
        proporcao: aspectRatio,
        fundoVerde: tipo === "elemento",
        ctx: contexto,
        ate: opcoes.higgsfieldAte,
      });
    } catch (e) {
      avisarRecuo(tipo, gerador, e);
    }
  }
  if (!opcoes.outroModelo && ehDaOpenAI(gerador)) {
    const r = await tentarOpenAI(prompt, aspectRatio, contexto, gerador === "openai-gpt-image-2-low" ? "low" : "medium");
    if (r) return r;
    // OpenAI na frente e fora do ar (01/10): o próximo mais barato é o GPT
    // Image 2.5 na Higgsfield (US$ 0,025), não o Google (US$ 0,101).
    try {
      return await gerarNaHiggsfield({ gerador: "higgsfield-gpt-image-2.5-low", prompt, proporcao: aspectRatio, ctx: contexto, ate: opcoes.higgsfieldAte });
    } catch (e) {
      avisarRecuo(tipo, "higgsfield-gpt-image-2.5-low", e);
    }
  }
  // O recuo da ARTE passa pela OpenAI em qualidade baixa antes do Google
  // (01/10): US$ 0,0064 medido contra US$ 0,101 do Nano Banana 2 em 2K. Só na arte,
  // que foi o que o Bruno pediu; colagem e fundo não passaram por prova nele.
  if (tipo === "arte" && gerador !== "google" && gerador !== "openai-gpt-image-2-low") {
    const r = await tentarOpenAI(prompt, aspectRatio, contexto, "low");
    if (r) return r;
  }
  return gerarNoGoogle(prompt, aspectRatio, quality, contexto);
}

/** A proporção da OpenAI, que só aceita retrato, paisagem e quadrado. */
function proporcaoDaOpenAI(a: AspectRatio): "4:5" | "16:9" | "1:1" {
  if (a === "1:1") return "1:1";
  return a === "9:16" || a === "4:5" || a === "3:4" ? "4:5" : "16:9";
}

/** Sem saldo na OpenAI não melhora sozinho: 15 min sem tentar, neste processo. */
let openAISemSaldoAte = 0;

async function tentarOpenAI(prompt: string, aspectRatio: AspectRatio, ctx: ContextoMidia, qualidade: QualidadeDaOpenAI): Promise<ImagemGerada | null> {
  if (!temChaveDaOpenAI() || Date.now() < openAISemSaldoAte) return null;
  try {
    return await gerarImagemOpenAIComCusto(prompt, proporcaoDaOpenAI(aspectRatio), ctx, qualidade);
  } catch (e) {
    if (ehSemSaldoDaOpenAI(e)) {
      openAISemSaldoAte = Date.now() + 15 * 60_000;
      console.error("[imagem] OpenAI SEM SALDO: a arte vai ao Google por 15 min. Saldo em platform.openai.com/settings/organization/billing.");
    } else {
      console.warn(`[imagem] OpenAI ${qualidade} falhou, sigo para o Google: ${e instanceof Error ? e.message : e}`);
    }
    return null;
  }
}

/**
 * Qualquer motivo (vaga, fila, prazo, saldo, recusa) vira Google: a imagem
 * sai, e o motivo fica no log para o Bruno, nunca para o cliente.
 */
function avisarRecuo(tipo: TipoDeImagem, gerador: string, e: unknown): void {
  const motivo = e instanceof Error ? e.message : String(e);
  console.warn(`[imagem] ${tipo} pelo Google em vez de ${gerador}: ${motivo}${e instanceof RecuoParaOGoogle ? "" : " (erro inesperado)"}`);
}

export async function generateImage(
  prompt: string,
  aspectRatio: AspectRatio = "4:3",
  quality: ImageQuality = "standard",
  /**
   * Sem isto, o custo de imagem fica invisível. E como isto aqui é uma cascata
   * de fallback, o que precisa ser gravado é o modelo que **respondeu**, não o
   * que foi pedido: entre o GPT Image 2.5 da Higgsfield a US$ 0,025 e o Nano
   * Banana Pro a US$ 0,134 há cinco vezes de diferença, e nada no retorno
   * denuncia qual rodou.
   */
  ctx?: ContextoMidia,
  opcoes?: OpcoesDaImagem
): Promise<string> {
  return (await gerarImagem(prompt, aspectRatio, quality, ctx, opcoes)).dataUrl;
}

/** A cascata do Google: o recuo desde 01/10, na mesma ordem de antes. */
export async function gerarNoGoogle(prompt: string, aspectRatio: AspectRatio, quality: ImageQuality, ctx: ContextoMidia): Promise<ImagemGerada> {
  const apiKey = process.env.GEMINI_API_KEY;

  // ── 1. Imagen 3 via Gemini API key (melhor qualidade, só precisa da API key) ──
  if (apiKey) {
    const imagen3Result = await tryImagen3ViaApiKey(prompt, aspectRatio, apiKey, ctx);
    if (imagen3Result) return imagen3Result;
  }

  // ── 2. Gemini 2.0 Flash image generation (também via API key) ────────────────
  if (apiKey) {
    const flashResult = await tryGeminiFlashImage(prompt, apiKey, ctx, aspectRatio, quality);
    if (flashResult) return flashResult;
  }

  // ── 3. Vertex AI Imagen 3 (service account — alternativa corporativa) ─────────
  const vertexResult = await tryVertexImagen3(prompt, aspectRatio, ctx);
  if (vertexResult) return vertexResult;

  // ── 4. Pollinations.ai (último recurso, sem chave) ────────────────────────────
  console.warn("[generateImage] Tentando Pollinations.ai como último recurso...");
  const pollinationsResult = await tryPollinationsAI(prompt, aspectRatio, quality);
  if (pollinationsResult) return pollinationsResult;

  throw new Error(
    "Não foi possível gerar a imagem agora. Use o chat do card para descrever a imagem desejada e a Diana vai gerá-la."
  );
}

/**
 * Compõe uma imagem NOVA em cima de uma que já existe.
 *
 * Diferente de `generateImage`, que cria do zero: aqui a imagem de entrada vai
 * junto do texto, e o modelo edita em vez de inventar. É o que a capa do vídeo
 * exige (decisão do Bruno em 23/08, opção A): o quadro real da gravação
 * continua ali, com quem fala no enquadramento, e o modelo só acrescenta
 * título, contraste e acabamento.
 *
 * O motivo de não gerar do zero é de resultado, não de custo: capa sem o rosto
 * de quem fala rende menos em canal pessoal, e o rosto já está no quadro.
 *
 * Só a cascata do Nano Banana serve para isto. O Imagen 3 e o Pollinations
 * geram a partir de texto e ignoram a imagem de entrada, então incluí-los como
 * fallback devolveria uma arte bonita e SEM o cliente dentro, que é exatamente
 * o que a decisão descartou. Falhar e manter o quadro real é melhor.
 *
 * Desde 01/10 o primeiro a tentar é o Grok Imagine 2.0 da Higgsfield, que
 * EDITA (recebe o quadro em `image_urls`); o Nano Banana virou o recuo. A
 * regra acima continua: nenhum modelo que só gera a partir de texto entra aqui.
 */
export async function comporSobreImagem(
  prompt: string,
  imagemBase64: string,
  mimeType: string,
  ctx?: ContextoMidia,
  /** Proporção da imagem de saída (ex.: "9:16" para capa de corte vertical). */
  aspectRatio?: string,
  opcoes?: OpcoesDaEdicao
): Promise<string | null> {
  return (await comporSobreImagemComCusto(prompt, imagemBase64, mimeType, ctx, aspectRatio, opcoes))?.dataUrl ?? null;
}

export type OpcoesDaEdicao = OpcoesDaImagem & {
  /**
   * A mesma imagem de entrada como URL pública. A Higgsfield só recebe imagem
   * por URL; sem ela, a edição vai direto ao Google.
   */
  imagemUrl?: string | null;
};

/**
 * A edição com quem respondeu e quanto custou (01/10). Primeiro o modelo do
 * tipo "cenario" na Higgsfield (Grok Imagine 2.0, US$ 0,08), quando há URL da
 * imagem e o modelo escolhido edita; senão, ou se ele recusar, estourar o
 * prazo ou faltar saldo, a cascata do Nano Banana de sempre.
 */
export async function comporSobreImagemComCusto(
  prompt: string,
  imagemBase64: string,
  mimeType: string,
  ctx?: ContextoMidia,
  aspectRatio?: string,
  opcoes: OpcoesDaEdicao = {}
): Promise<ImagemGerada | null> {
  const contexto: ContextoMidia = ctx ?? { operation: "imagem_sem_contexto" };
  const tipo = opcoes.tipo ?? "cenario";
  const gerador = geradorDoTipo(tipo);
  if (ehDaHiggsfield(gerador) && opcoes.imagemUrl && FICHAS[gerador].edita) {
    try {
      return await gerarNaHiggsfield({
        gerador,
        prompt,
        proporcao: aspectRatio ?? "9:16",
        imagemUrl: opcoes.imagemUrl,
        ctx: contexto,
        ate: opcoes.higgsfieldAte,
      });
    } catch (e) {
      avisarRecuo(tipo, gerador, e);
    }
  }
  return comporNoGoogle(prompt, imagemBase64, mimeType, contexto, aspectRatio);
}

/** A edição pelo Nano Banana: o recuo desde 01/10. */
export async function comporNoGoogle(
  prompt: string,
  imagemBase64: string,
  mimeType: string,
  ctx: ContextoMidia,
  aspectRatio?: string
): Promise<ImagemGerada | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const models = [
    "gemini-3-pro-image-preview",        // Nano Banana Pro: melhor acabamento
    "gemini-3.1-flash-image-preview",    // Nano Banana 2
    "gemini-2.5-flash-image",            // Nano Banana estável
  ];

  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  // A imagem ANTES do texto: a ordem importa para o modelo
                  // tratar o texto como instrução sobre a imagem, e não como
                  // descrição de uma cena nova.
                  { inlineData: { mimeType, data: imagemBase64 } },
                  { text: prompt },
                ],
              },
            ],
            generationConfig: {
              responseModalities: ["IMAGE", "TEXT"],
              ...(aspectRatio ? { imageConfig: { aspectRatio } } : {}),
            },
          }),
          // Composição em cima de imagem demora mais que geração pura, e o Pro
          // é o mais lento dos três.
          signal: AbortSignal.timeout(90_000),
        }
      );

      if (!res.ok) {
        if (res.status === 404 || res.status === 429) continue;
        console.warn(`[comporSobreImagem][${model}] HTTP ${res.status}`);
        continue;
      }

      const data = (await res.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ inlineData?: { data: string; mimeType: string } }> };
        }>;
      };
      const parte = (data.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data);
      if (parte?.inlineData) {
        // Sem imageSize a edição sai no tamanho padrão (1K): preço do 1K mais
        // a imagem de entrada.
        const custoUsd = precoDoGoogle(model, "standard", true);
        gravarCustoDeImagem(model, custoUsd, ctx);
        return { dataUrl: `data:${parte.inlineData.mimeType ?? "image/jpeg"};base64,${parte.inlineData.data}`, modelo: model, custoUsd };
      }
    } catch (e) {
      console.warn(`[comporSobreImagem][${model}] erro:`, e);
    }
  }
  return null;
}

/** Extract raw base64 bytes from a data URL for uploading to social APIs */
export function dataUrlToBuffer(dataUrl: string): Buffer {
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
  return Buffer.from(base64, "base64");
}
