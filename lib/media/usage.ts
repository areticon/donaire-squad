import { prisma } from "@/lib/db/prisma";
import { marcarChamadaOk } from "@/lib/fornecedores/aviso-de-saldo";
import { fornecedorDoModeloGravado } from "@/lib/fornecedores/saldo";

/**
 * Instrumentação de custo de mídia: Gemini, Veo e Deepgram.
 *
 * Por que isto precisou existir: até 18/08/2026 só as chamadas do Claude
 * gravavam em `ai_usage`. Nas operações de imagem e de vídeo o Claude é a
 * **menor** parte do custo, então a instrumentação cobria justamente o pedaço
 * que menos importa, e o dominante era invisível.
 *
 * O caso que provou o risco: a cascata de fallback do Veo tentava o modelo
 * rápido a US$ 0,10 por segundo e caía para o standard a US$ 0,40, quadruplicando
 * o custo de uma operação sem deixar rastro. Ninguém saberia até a fatura.
 *
 * Por isso o parâmetro `model` aqui é o modelo que **realmente rodou**, e não o
 * que foi pedido. Em cascata de fallback, essa distinção é o dado inteiro.
 */

/** Preços verificados na documentação oficial em 18/08/2026, em dólar. */
const PRECOS = {
  /** Por imagem gerada. */
  imagem: {
    "gemini-2.5-flash-image": 0.039,
    // O Nano Banana 2 NÃO custa 0,039 (01/10): esse é o preço do 2.5 em 1K, e
    // foi copiado para o 3.1. O 3.1 cobra por tamanho: US$ 0,067 em 1K e
    // US$ 0,101 em 2K, e quase toda chamada nossa pede 2K ("hd"). O extrato
    // mostrava 40% do custo real da imagem; o estudo de custo de 30/09 achou a
    // diferença. Quem sabe o tamanho é `nano-banana.ts`, que grava pelo
    // `gravarCustoDeImagem`; esta linha é o 1K, quando o tamanho não veio.
    "gemini-3.1-flash-image-preview": 0.067,
    "gemini-3.1-flash-image-preview-2k": 0.101,
    "gemini-3-pro-image-preview": 0.134,
    // Imagen 3 pela chave do Gemini e pela Vertex (01/10): primeiro da cascata
    // do Google e fora desta tabela, então caía no 0,134 do "sem preço".
    "imagen-3.0-generate-001": 0.04,
    "imagen-3.0-fast-generate-001": 0.02,
    // GPT Image 2, levantado em 18/09/2026 para o carrossel premium: US$ 0,165
    // por imagem em alta qualidade no retrato (1024x1536) ou na paisagem
    // (1536x1024), e US$ 0,211 no quadrado. A tabela guarda o retrato, que e o
    // formato do carrossel; o quadrado entra como chave propria para o custo
    // nao sair subestimado se alguem o usar.
    "gpt-image-2": 0.165,
    "gpt-image-2-square": 0.211,
    "gpt-image-1.5": 0.167,
    // Só quando a resposta vem sem `usage` (01/10); o normal é gravar pelos
    // tokens. Estimativa pelo retrato em qualidade baixa.
    "gpt-image-2-low": 0.015,
  } as Record<string, number>,
  /** Por minuto de áudio. */
  transcricao: {
    "nova-3": 0.0043,
    "nova-3-multi": 0.0052,
  } as Record<string, number>,
} as const;

export type ContextoMidia = {
  projectId?: string;
  runId?: string;
  operation: string;
};

async function gravar(
  model: string,
  costUsd: number,
  ctx: ContextoMidia
): Promise<void> {
  // A chamada passou: fecha o incidente de saldo do fornecedor, se havia.
  marcarChamadaOk(fornecedorDoModeloGravado(model));
  try {
    await prisma.aiUsage.create({
      data: {
        projectId: ctx.projectId ?? null,
        runId: ctx.runId ?? null,
        operation: ctx.operation,
        model,
        // Mídia não tem token. Os campos ficam em zero de propósito, e o custo
        // é o que importa: misturar unidades na mesma coluna daria número
        // errado em qualquer soma futura.
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
        costUsd,
      },
    });
  } catch (err) {
    // Instrumentação nunca derruba pipeline.
    console.error("[usage-midia] falha ao gravar (ignorado):", err);
  }
}

/** Grava o custo de uma imagem gerada. `model` é o que de fato respondeu. */
export function recordImagem(
  model: string,
  quantidade: number,
  ctx: ContextoMidia
): void {
  const preco = PRECOS.imagem[model];
  if (preco === undefined) {
    console.error(`[usage-midia] modelo de imagem sem preço na tabela: ${model}`);
  }
  void gravar(model, (preco ?? 0.134) * quantidade, ctx);
}

/**
 * O USO QUE A API DEVOLVEU, e não uma constante.
 *
 * Achado em 20/09: `recordImagem` gravava US$ 0,165 por imagem do GPT Image 2
 * fosse qual fosse a qualidade, porque era o preço de tabela da qualidade
 * alta. Quando a esteira passou para média (um quarto do custo), o extrato
 * continuou dizendo 0,165 e a campanha de prova pareceu MAIS cara na arte. O
 * preço da OpenAI é por token (texto de entrada US$ 5/M, imagem de entrada
 * US$ 8/M, saída US$ 30/M), e a resposta traz os tokens: é isso que se grava.
 */
export type UsoDaImagem = {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { text_tokens?: number; image_tokens?: number };
};

export function custoDaImagemPorTokens(uso: UsoDaImagem): number {
  const texto = uso.input_tokens_details?.text_tokens ?? uso.input_tokens ?? 0;
  const imagem = uso.input_tokens_details?.image_tokens ?? 0;
  const saida = uso.output_tokens ?? 0;
  return (texto * 5 + imagem * 8 + saida * 30) / 1_000_000;
}

/** Grava a imagem pelo uso real. Sem `usage` na resposta, cai na tabela. */
export function recordImagemPorTokens(model: string, uso: UsoDaImagem | undefined, ctx: ContextoMidia): void {
  if (!uso || (!uso.output_tokens && !uso.input_tokens)) {
    recordImagem(model, 1, ctx);
    return;
  }
  const custo = custoDaImagemPorTokens(uso);
  marcarChamadaOk(fornecedorDoModeloGravado(model));
  void (async () => {
    try {
      await prisma.aiUsage.create({
        data: {
          projectId: ctx.projectId ?? null,
          runId: ctx.runId ?? null,
          operation: ctx.operation,
          model,
          inputTokens: uso.input_tokens ?? 0,
          outputTokens: uso.output_tokens ?? 0,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          costUsd: custo,
        },
      });
    } catch (err) {
      console.error("[usage-midia] falha ao gravar (ignorado):", err);
    }
  })();
}

/**
 * Grava uma imagem cujo preço quem chama já sabe (01/10): a Higgsfield cobra
 * em dólar fixo por modelo e qualidade (lib/media/imagem-higgsfield.ts), e o
 * Google cobra por tamanho. Uma tabela só por nome de modelo não distingue o
 * 1K do 2K do mesmo modelo, que foi o erro do 0,039. `model` é o que RESPONDEU.
 */
export function gravarCustoDeImagem(model: string, custoUsd: number, ctx: ContextoMidia): void {
  void gravar(model, custoUsd, ctx);
}

/** O preço de tabela de um modelo de imagem, ou null quando não está na tabela. */
export function precoDaImagem(model: string): number | null {
  return PRECOS.imagem[model] ?? null;
}

/** Grava o custo de uma transcrição, cobrada por minuto de áudio. */
export function recordTranscricao(
  model: string,
  duracaoSegundos: number,
  ctx: ContextoMidia
): void {
  const preco = PRECOS.transcricao[model] ?? PRECOS.transcricao["nova-3-multi"];
  void gravar(model, (duracaoSegundos / 60) * preco, ctx);
}

/**
 * Grava o custo de um VIDEO gerado por IA.
 *
 * Existe separado de `recordImagem` porque video nao tem preco por peca: o Veo
 * cobra POR SEGUNDO, e o preco por segundo muda com a qualidade (US$ 0,15 no
 * rapido, ate US$ 0,40 no cheio). Uma tabela de preco por modelo nao daria
 * conta disso, e foi justamente a variacao entre rapido e cheio que escondeu
 * 80% de prejuizo por operacao em agosto.
 *
 * Quem chama ja calculou o dolar, porque quem chama sabe quantos segundos
 * pediu. `model` e o modelo que RESPONDEU.
 */
export function gravarCustoDeVideo(model: string, custoUsd: number, ctx: ContextoMidia): void {
  void gravar(model, custoUsd, ctx);
}
