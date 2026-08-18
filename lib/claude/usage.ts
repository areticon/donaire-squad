import { prisma } from "@/lib/db/prisma";

/**
 * Preço por milhão de tokens, em dólar, conforme a tabela pública da Anthropic.
 * Cache de escrita custa 1,25x o preço de entrada; cache de leitura custa 0,1x.
 * Fonte: platform.claude.com/docs/en/build-with-claude/prompt-caching
 */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-5": { input: 3, output: 15 },
  // Preço de tabela. O Sonnet 5 está em intro de US$ 2 / US$ 10 até 31/08/2026,
  // mas manter o preço cheio aqui é deliberado: superestimar o custo é seguro,
  // subestimar é o que quebra projeção. Quando a intro acabar, este número já
  // está certo e ninguém precisa lembrar de mexer.
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-opus-4-8": { input: 5, output: 25 },
};

const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

export type UsageContext = {
  projectId?: string;
  runId?: string;
  agentId?: string;
  /** O que gerou a chamada: "agent", "assist", "topics", "insight", etc. */
  operation: string;
};

type AnthropicUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

export function computeCostUsd(model: string, usage: AnthropicUsage): number {
  const price = PRICING[model] ?? PRICING["claude-sonnet-5"];
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;

  const inputCost = (usage.input_tokens * price.input) / 1_000_000;
  const writeCost = (cacheWrite * price.input * CACHE_WRITE_MULTIPLIER) / 1_000_000;
  const readCost = (cacheRead * price.input * CACHE_READ_MULTIPLIER) / 1_000_000;
  const outputCost = (usage.output_tokens * price.output) / 1_000_000;

  return inputCost + writeCost + readCost + outputCost;
}

/**
 * Grava o consumo de uma chamada. Nunca lança: instrumentação não pode
 * derrubar o pipeline. Chamada com `void`, sem await, para não somar latência.
 */
export async function recordUsage(
  model: string,
  usage: AnthropicUsage,
  context?: UsageContext
): Promise<void> {
  if (!context) return;

  try {
    await prisma.aiUsage.create({
      data: {
        projectId: context.projectId ?? null,
        runId: context.runId ?? null,
        agentId: context.agentId ?? null,
        operation: context.operation,
        model,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
        cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
        costUsd: computeCostUsd(model, usage),
      },
    });
  } catch (err) {
    console.error("[usage] falha ao gravar consumo (ignorado):", err);
  }
}
