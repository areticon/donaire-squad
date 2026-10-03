import { gravarCustoDeVideo } from "@/lib/media/usage";
import type { ContextoMidia } from "@/lib/media/usage";

/**
 * VÍDEO POR IA, com o Veo 3.1.
 *
 * O Veo saiu do produto em 18/08/2026 (commit 6148d94) e volta em 19/09 com a
 * regra que faltava. Vale registrar POR QUE ele saiu, porque é a mesma armadilha
 * que se arma sozinha toda vez que alguém liga geração de vídeo:
 *
 *   a cascata de fallback tentava o modelo rápido a US$ 0,10 por segundo e caía
 *   para o padrão a US$ 0,40, levando um vídeo de 8 segundos de R$ 4,85 para
 *   R$ 18,05 contra R$ 10,00 de receita. Oitenta por cento de prejuízo por
 *   operação, invisível porque o Veo nunca gravava em `ai_usage`.
 *
 * As três decisões que impedem a repetição:
 *   1. NÃO EXISTE CASCATA. A qualidade é escolhida por quem chama e o modelo é
 *      exatamente esse. Trocar de modelo sozinho é trocar de preço sozinho;
 *   2. TODO VÍDEO GRAVA CUSTO em `ai_usage`, pelo modelo que de fato rodou;
 *   3. VÍDEO NÃO SAI DO SALDO DO PLANO. Sai da carteira de vídeo, comprada à
 *      parte (`lib/credits/video.ts`), porque no plano de entrada quatro vídeos
 *      cheios custam 108,6% do preço do plano.
 *
 * POR QUE VEO 3.1 E NÃO OUTRO, pesquisado em 18/09:
 *   • Sora 2 foi DEPRECIADO e a API desliga em 24/09/2026. Escolher por
 *     reputação teria escolhido um modelo morto na semana seguinte;
 *   • Seedance 2.0 lidera o ranking e NÃO TEM API oficial (a ByteDance adiou
 *     por disputa com estúdios);
 *   • Kling 3.0 sai por US$ 0,10 por segundo, mais barato, e NÃO TEM ÁUDIO
 *     NATIVO. Narração em português é requisito do produto, e o Kling exigiria
 *     uma segunda etapa de voz mais sincronia;
 *   • Veo 3.1 tem áudio nativo com diálogo e narração sincronizados e
 *     multilíngues. O que decide não é o preço, é o áudio.
 *
 * A EXTENSÃO entrou em 21/09 (o vídeo de até 1 minuto), e a escolha de ficar no
 * Veo foi do Bruno no mesmo dia: a chave já existe, o áudio em português é
 * nativo, e a extensão é da própria API, então continua um fornecedor e um
 * registro. Ver `estenderVideo`.
 */

export type QualidadeDoVideo = "rapido" | "cheio";

/**
 * A VOZ DO NARRADOR, escolhida pelo cliente (28/09).
 *
 * Pedido do Bruno: "nao tem a opcao de escolher a narracao do video?". Nao
 * tinha: o prompt dizia so "warm and professional", e o Veo sorteava homem ou
 * mulher a cada video. Como o Veo nao tem campo de voz, a escolha vira texto
 * do prompt, e ela vai IGUAL em todas as geracoes da cadeia: e o que segura a
 * mesma voz do primeiro ao ultimo trecho de um video de 60 s.
 */
export type GeneroDaVoz = "feminina" | "masculina";
export type TomDaVoz = "acolhedor" | "energico" | "serio";
export interface VozDoNarrador {
  genero: GeneroDaVoz;
  tom: TomDaVoz;
}
const GENERO_NO_PROMPT: Record<GeneroDaVoz, string> = {
  feminina: "adult female",
  masculina: "adult male",
};
const TOM_NO_PROMPT: Record<TomDaVoz, string> = {
  acolhedor: "warm, calm and professional",
  energico: "energetic, upbeat and confident",
  serio: "serious, authoritative and measured",
};

/** O modelo de cada qualidade. Um por um, sem fallback entre eles. */
const MODELO: Record<QualidadeDoVideo, string> = {
  rapido: "veo-3.1-fast-generate-preview",
  cheio: "veo-3.1-generate-preview",
};

/** Dólar por SEGUNDO de vídeo, com áudio. Levantado em 18/09/2026. */
export const DOLAR_POR_SEGUNDO: Record<QualidadeDoVideo, number> = {
  rapido: 0.15,
  cheio: 0.4,
};

const BASE = "https://generativelanguage.googleapis.com/v1beta";

function chaveDoGemini(): string {
  const chave = process.env.GEMINI_API_KEY;
  if (!chave) throw new Error("GEMINI_API_KEY não configurada: o vídeo por IA não pode ser gerado.");
  return chave;
}

/**
 * O prompt que vai para o Veo, com a narração DENTRO dele.
 *
 * É assim que o Veo faz áudio: não existe um campo separado de voz. Dizer
 * "Brazilian Portuguese" por extenso importa, porque o modelo é multilíngue e
 * escolhe pela pista do texto. Sem narração, o prompt pede som ambiente e
 * proíbe fala, senão o modelo inventa um diálogo.
 */
function promptComAudio(prompt: string, narracao: string | undefined, continuacao: boolean, voz?: VozDoNarrador): string {
  if (!narracao) {
    return `${prompt}\n\nAudio: ambient sound only. No speech, no narration, no text overlay, no subtitles.`;
  }
  // Sem escolha (pedido antigo), fica o que sempre foi: tom acolhedor, sem genero.
  const quem = voz ? `${GENERO_NO_PROMPT[voz.genero]} ` : "";
  const tom = voz ? TOM_NO_PROMPT[voz.tom] : "warm and professional";
  return [
    prompt,
    "",
    continuacao
      ? `Audio: the same single ${quem}Brazilian Portuguese voice-over narrator continues, with the same voice, and says exactly, and only, this line:`
      : `Audio: a single ${quem}Brazilian Portuguese voice-over narrator says exactly, and only, this line:`,
    `"${narracao}"`,
    `Voice-over in pt-BR, ${tom}. No on-camera dialogue, no visible lip-sync,`,
    `no text overlay, no subtitles. The narration must finish before the clip ends.`,
  ].join("\n");
}

export interface PedidoDeVideo {
  /** O prompt visual, em inglês, já com a cena e o fechamento da ideia. */
  prompt: string;
  /** O texto exato que o narrador diz, em português. Vazio faz vídeo mudo. */
  narracao?: string;
  /** Quem narra. Ausente mantém a voz padrão. */
  voz?: VozDoNarrador;
  segundos: 4 | 6 | 8;
  qualidade: QualidadeDoVideo;
  /** "16:9" ou "9:16". O Veo não aceita as outras. */
  proporcao: "16:9" | "9:16";
  ctx?: ContextoMidia;
}

/**
 * Pede o vídeo e devolve o nome da operação, que é assíncrona.
 *
 * O Veo leva de 60 a 300 segundos. Ele NÃO pode ser esperado dentro da
 * requisição do cliente, e é por isso que esta função só ABRE a operação: quem
 * espera é a fila. Foi exatamente esse teto de tempo que manteve o vídeo
 * desligado no pipeline mesmo antes do problema de custo.
 */
export async function pedirVideo(pedido: PedidoDeVideo): Promise<string> {
  const chave = chaveDoGemini();
  const modelo = MODELO[pedido.qualidade];
  const prompt = promptComAudio(pedido.prompt, pedido.narracao, false, pedido.voz);

  const res = await fetch(`${BASE}/models/${modelo}:predictLongRunning?key=${chave}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        aspectRatio: pedido.proporcao,
        durationSeconds: pedido.segundos,
        /**
         * `generateAudio` NAO EXISTE no Veo 3.1, e mandar derruba a chamada.
         *
         * Medido em 19/09, na primeira geracao de verdade: HTTP 400 com
         * "generateAudio isn't supported by this model". O parametro era do
         * Veo 3, em que o audio era opcional. No 3.1 o audio e NATIVO e vem
         * sempre, e e justamente por isso que ele foi escolhido no lugar do
         * Kling (que sai mais barato e exigiria uma segunda etapa de voz).
         *
         * O controle do audio passou a ser o PROMPT: com narracao, o prompt
         * manda a frase exata; sem, ele pede som ambiente e proibe fala.
         */
        /**
         * `personGeneration` TAMBEM NAO VAI, e pelo mesmo motivo do
         * `generateAudio` logo acima: e parametro do Veo 3 que o 3.1 nao
         * aceita mais.
         *
         * Medido em 19/09, na segunda recusa seguida:
         * "allow_adult for personGeneration is currently not supported."
         *
         * Duas recusas por adivinhacao de parametro foram o sinal de que a
         * doc nao acompanha o modelo, entao a terceira nao foi adivinhada:
         * scripts/tmp/sondar-veo-1909.mts mandou tres variantes de verdade,
         * da menor mudanca para a maior, e a PRIMEIRA passou. Sem o
         * parametro o Veo aceita, gera em cerca de 1 minuto e devolve o
         * clipe de 8 s com a narracao em portugues (2,41 MB, baixado e
         * conferido).
         *
         * A licao que fica: neste modelo, parametro que a doc do 3 tinha e
         * suspeito ate prova em contrario, e a prova e uma chamada.
         */
        sampleCount: 1,
      },
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const corpo = await res.text();
    throw new Error(`O Veo recusou o pedido (HTTP ${res.status}): ${corpo.slice(0, 240)}`);
  }

  const dados = (await res.json()) as { name?: string };
  if (!dados.name) throw new Error("O Veo respondeu sem o nome da operação.");
  return dados.name;
}

export interface PedidoDeExtensao {
  /**
   * O arquivo gerado pelo Veo que vai ser estendido, na forma
   * `https://generativelanguage.googleapis.com/v1beta/files/xxxx` (sem o
   * `:download`). É o `arquivoUri` que `olharOperacao` devolve.
   */
  videoUri: string;
  /** O que acontece nos próximos 7 segundos, em inglês, na MESMA cena. */
  prompt: string;
  /** A frase seguinte do narrador, em português. Vazio continua mudo. */
  narracao?: string;
  /** A mesma voz da primeira geração. */
  voz?: VozDoNarrador;
  qualidade: QualidadeDoVideo;
  proporcao: "16:9" | "9:16";
  ctx?: ContextoMidia;
}

/**
 * ESTENDE um vídeo gerado pelo Veo em 7 segundos, e devolve o nome da
 * operação. A resposta, quando termina, é o vídeo INTEIRO (o de entrada mais
 * os 7 s novos), e não só o pedaço novo.
 *
 * Medido em 21/09 (scripts/tmp/sondar-extensao-veo-2109.mts), porque a doc
 * só exemplifica com o modelo cheio e em base64:
 *
 *   • o modelo RÁPIDO aceita extensão, e foi a primeira candidata a passar;
 *   • o vídeo de entrada vai por `video: { uri }`, o URI do arquivo que o
 *     próprio Veo gerou (vivo por dois dias na Files API, e cada extensão
 *     zera o relógio). Em base64 um vídeo de 57 s passaria dos 20 MB de teto
 *     da requisição, então o caminho por uri não é preferência, é o único
 *     que chega ao fim da cadeia;
 *   • `durationSeconds` NÃO vai: a extensão é sempre de 7 s;
 *   • `resolution: "720p"` vai, porque é a única que a extensão aceita, e o
 *     vídeo de entrada precisa estar nela (a esteira já gera em 720p).
 *
 * Saída medida: 8 s de entrada viraram 15,00 s (1280x720, h264 e aac), em
 * 1 minuto, e a narração nova saiu em português, transcrita pela Deepgram.
 */
/**
 * ESPERA O GOOGLE TERMINAR DE PROCESSAR o trecho anterior (28/09).
 *
 * O vídeo refeito do dia 28 saiu com 8 s em vez de 29: a extensão foi pedida
 * no mesmo minuto em que o primeiro trecho ficou pronto, e o Veo recusou com
 * "Input video must be a video that was generated by VEO that has been
 * processed". O arquivo existia e ainda estava em PROCESSING na Files API.
 * Em 21/09 a cadeia funcionou por sorte de tempo. Agora se pergunta o estado
 * do arquivo antes de estender, até dois minutos; se não ficar pronto, o erro
 * sobe e a fila trata como engasgo (espera 1, 2, 3 minutos).
 */
async function esperarArquivoProcessado(uri: string, chave: string): Promise<void> {
  const limite = Date.now() + 120_000;
  while (Date.now() < limite) {
    const res = await fetch(`${uri}?key=${chave}`, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
    if (res?.ok) {
      const dados = (await res.json().catch(() => ({}))) as { state?: string };
      if (dados.state === "ACTIVE") return;
      if (dados.state === "FAILED") throw new Error("O Veo não conseguiu processar o trecho anterior (arquivo FAILED na Files API).");
      // Sem `state` (formato que não conhecemos): não trava a cadeia por isso.
      if (!dados.state) return;
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }
  throw new Error("O Veo ainda não terminou de processar o trecho anterior (has not been processed): tento de novo em instantes.");
}

export async function estenderVideo(pedido: PedidoDeExtensao): Promise<string> {
  const chave = chaveDoGemini();
  const modelo = MODELO[pedido.qualidade];
  const prompt = promptComAudio(pedido.prompt, pedido.narracao, true, pedido.voz);
  await esperarArquivoProcessado(pedido.videoUri, chave);

  const res = await fetch(`${BASE}/models/${modelo}:predictLongRunning?key=${chave}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [{ prompt, video: { uri: pedido.videoUri } }],
      parameters: { aspectRatio: pedido.proporcao, resolution: "720p", sampleCount: 1 },
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const corpo = await res.text();
    throw new Error(`O Veo recusou a extensão (HTTP ${res.status}): ${corpo.slice(0, 240)}`);
  }
  const dados = (await res.json()) as { name?: string };
  if (!dados.name) throw new Error("O Veo respondeu à extensão sem o nome da operação.");
  return dados.name;
}

export interface VideoPronto {
  /** A URL para baixar o arquivo no lado do Google. Precisa da chave. */
  uri: string;
  /** O arquivo na Files API (`.../files/xxxx`), que é o que a extensão recebe. */
  arquivoUri: string;
  modelo: string;
  /** Quantos segundos o arquivo devolvido tem, lidos da Files API. */
  segundos: number;
  /** Quantos segundos esta operação GEROU (o arquivo menos a entrada). */
  segundosGerados: number;
  custoUsd: number;
}

/**
 * Quantos segundos tem um arquivo gerado, pela Files API do Google.
 *
 * É a única medida que a resposta oferece: a operação devolve só o URI, e a
 * Files API devolve `videoMetadata.videoDuration` ("15s"). Ler daqui, e não
 * de uma constante, é a regra da casa desde a reprecificação das imagens em
 * 20/09: o custo que vale é o que a API entregou. `null` quando a leitura
 * falha, para quem chama cair na duração pedida em vez de derrubar o vídeo.
 */
export async function medirArquivoGerado(arquivoUri: string): Promise<number | null> {
  try {
    const res = await fetch(`${arquivoUri}?key=${chaveDoGemini()}`, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    const meta = (await res.json()) as { videoMetadata?: { videoDuration?: string } };
    const bruto = meta.videoMetadata?.videoDuration ?? "";
    const n = Number.parseFloat(bruto.replace(/s$/i, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * Pergunta se a operação terminou.
 *
 * Devolve `null` enquanto está rodando, e o vídeo quando termina. Quem chama
 * decide quantas vezes perguntar: aqui não existe laço de espera de propósito,
 * porque um laço escondido dentro de uma função é como um trabalho de 300
 * segundos vira um timeout de plataforma que ninguém consegue depurar.
 *
 * `segundosDeEntrada` é o tamanho do vídeo que entrou numa extensão (zero na
 * geração inicial): o custo é dos segundos GERADOS, e não do arquivo inteiro,
 * porque a extensão devolve entrada mais os 7 s novos.
 */
export async function olharOperacao(
  nomeDaOperacao: string,
  pedido: { segundos: number; qualidade: QualidadeDoVideo; ctx?: ContextoMidia; segundosDeEntrada?: number }
): Promise<VideoPronto | null> {
  const chave = chaveDoGemini();

  const res = await fetch(`${BASE}/${nomeDaOperacao}?key=${chave}`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Não consegui olhar a operação do Veo (HTTP ${res.status}).`);

  const dados = (await res.json()) as {
    done?: boolean;
    error?: { message?: string };
    response?: {
      generateVideoResponse?: { generatedSamples?: Array<{ video?: { uri?: string } }> };
    };
  };

  if (dados.error) throw new Error(`O Veo falhou: ${dados.error.message ?? "sem motivo"}`);
  if (!dados.done) return null;

  const uri = dados.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (!uri) throw new Error("O Veo terminou sem devolver vídeo.");

  const arquivoUri = uri.replace(/:download.*$/, "");
  const entrada = pedido.segundosDeEntrada ?? 0;
  // O tamanho vem da Files API; se ela não responder, vale o que foi pedido.
  const medido = await medirArquivoGerado(arquivoUri);
  const segundos = medido ?? entrada + pedido.segundos;
  const segundosGerados = Math.max(0, segundos - entrada);

  const modelo = MODELO[pedido.qualidade];
  const custoUsd = DOLAR_POR_SEGUNDO[pedido.qualidade] * segundosGerados;
  /**
   * O CUSTO É GRAVADO AQUI, e só aqui, quando o vídeo existe de verdade. É a
   * linha que não existia em agosto, e a ausência dela é o que escondeu 80% de
   * prejuízo por operação durante um mês.
   *
   * E é gravado SEMPRE, com ou sem contexto, desde 22/09. Era `if (ctx)`, e o
   * efeito só apareceu quando uma prova pagou duas gerações fora da esteira:
   * o Google contava 6 no dia e o `ai_usage` contava 4, ou seja o aviso de
   * cota da janela da campanha diria "cabe" para um vídeo que não cabe. A
   * cota é da PLATAFORMA, então toda geração paga na nossa chave conta, venha
   * de onde vier. Sem contexto, a linha fica sem projeto e sem execução, que
   * é a verdade: ninguém pediu, mas o Google cobrou.
   */
  gravarCustoDeVideo(modelo, custoUsd, pedido.ctx ?? { operation: "video_ia_avulso" });

  return { uri, arquivoUri, modelo, segundos, segundosGerados, custoUsd };
}

/** Baixa o vídeo pronto. A URI do Veo exige a chave no cabeçalho. */
export async function baixarVideo(uri: string): Promise<Buffer> {
  const chave = chaveDoGemini();
  const res = await fetch(uri, { headers: { "x-goog-api-key": chave }, signal: AbortSignal.timeout(180_000) });
  if (!res.ok) throw new Error(`Não consegui baixar o vídeo do Veo (HTTP ${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}
