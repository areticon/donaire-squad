import { prisma } from "@/lib/db/prisma";

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
    "gemini-3.1-flash-image-preview": 0.039,
    "gemini-3-pro-image-preview": 0.134,
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

/** Grava o custo de uma transcrição, cobrada por minuto de áudio. */
export function recordTranscricao(
  model: string,
  duracaoSegundos: number,
  ctx: ContextoMidia
): void {
  const preco = PRECOS.transcricao[model] ?? PRECOS.transcricao["nova-3-multi"];
  void gravar(model, (duracaoSegundos / 60) * preco, ctx);
}
