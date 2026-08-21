import Anthropic from "@anthropic-ai/sdk";
import { recordUsage, type UsageContext } from "@/lib/claude/usage";

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: 90_000, // 90s max per Claude call — 60s was too short for Roberto (Gemini 50s + Claude 70s)
    });
  }
  return _client;
}

/**
 * Migrado de claude-sonnet-4-5 para claude-sonnet-5 em 18/08/2026.
 *
 * Motivo imediato: o Sonnet 5 está com preço promocional de US$ 2,00 na entrada
 * e US$ 10,00 na saída até 31/08/2026, contra US$ 3,00 e US$ 15,00 do 4.5. Um
 * terço a menos no custo de texto enquanto durar, e depois iguala, então não há
 * cenário em que a troca fique mais cara.
 *
 * Verificado antes de trocar: nenhuma chamada nossa ao Claude usa temperature,
 * top_p, top_k, budget_tokens nem prefill de assistente, que são os parâmetros
 * que o Sonnet 5 rejeita com 400. Os temperature que existem no projeto são de
 * chamadas ao Gemini e ao Grok.
 *
 * Efeito colateral esperado: trocar de modelo invalida o cache de prompt, então
 * a primeira chamada de cada projeto reescreve o cache. É custo único.
 */
export const DEFAULT_MODEL = "claude-sonnet-5";

export type AskOptions = {
  maxTokens?: number;
  model?: string;
  /**
   * Bloco estável que vira o começo do system prompt e recebe o marcador de
   * cache. Precisa ser byte a byte idêntico entre as chamadas, senão o cache
   * não casa. Coisa que muda a cada chamada (tarefa, persona do agente) deve
   * ficar no systemPrompt normal ou na mensagem do usuário, nunca aqui.
   *
   * O mínimo cacheável no Sonnet 4.5 é 1024 tokens: prefixos menores são
   * ignorados silenciosamente pela API, sem erro.
   */
  cachedPrefix?: string;
  /** Metadados para registrar consumo e custo no banco. */
  usage?: UsageContext;
};

function buildSystem(
  systemPrompt: string,
  cachedPrefix?: string
): string | Anthropic.TextBlockParam[] {
  if (!cachedPrefix) return systemPrompt;
  return [
    {
      type: "text",
      text: cachedPrefix,
      cache_control: { type: "ephemeral" },
    },
    { type: "text", text: systemPrompt },
  ];
}

export async function askClaude(
  systemPrompt: string,
  userMessage: string,
  options?: AskOptions
): Promise<string> {
  const model = options?.model ?? DEFAULT_MODEL;

  const message = await getClient().messages.create({
    model,
    max_tokens: options?.maxTokens ?? 2048,
    system: buildSystem(systemPrompt, options?.cachedPrefix),
    messages: [{ role: "user", content: userMessage }],
  });

  void recordUsage(model, message.usage, options?.usage);

  return extrairTexto(message.content);
}

/**
 * Junta os blocos de texto da resposta, ignorando o resto.
 *
 * Isto existe por causa de um bug que só apareceu em produção. O código antes
 * pegava `content[0]` e exigia que fosse texto. Funcionava no Sonnet 4.5, e
 * quebrou na migração para o Sonnet 5, porque **nele o pensamento adaptativo
 * vem ligado por padrão quando o parâmetro `thinking` é omitido**. Aí o
 * primeiro bloco da resposta é de pensamento, não de texto, e a chamada
 * inteira morria com "Unexpected response type".
 *
 * O teste local passou porque o prompt era curto e não acionou o pensamento. O
 * prompt real da demonstração acionou. Ou seja: dependia do tamanho da tarefa,
 * que é a pior forma de bug, porque parece aleatório.
 *
 * Ler todos os blocos de texto, em vez do primeiro bloco, é o que torna isto
 * imune à próxima mudança de formato: bloco novo que a API introduza é
 * simplesmente ignorado.
 */
function extrairTexto(content: Anthropic.ContentBlock[]): string {
  const texto = content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  if (!texto) {
    const tipos = content.map((b) => b.type).join(", ") || "nenhum";
    throw new Error(`A resposta não trouxe texto. Blocos recebidos: ${tipos}.`);
  }
  return texto;
}

export async function streamClaude(
  systemPrompt: string,
  userMessage: string,
  onChunk: (text: string) => void,
  options?: AskOptions
): Promise<string> {
  let fullText = "";
  const model = options?.model ?? DEFAULT_MODEL;

  const stream = getClient().messages.stream({
    model,
    max_tokens: options?.maxTokens ?? 2048,
    system: buildSystem(systemPrompt, options?.cachedPrefix),
    messages: [{ role: "user", content: userMessage }],
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      fullText += event.delta.text;
      onChunk(event.delta.text);
    }
  }

  const final = await stream.finalMessage();
  void recordUsage(model, final.usage, options?.usage);

  return fullText;
}

export const KANBAN_SYSTEM_PROMPT = `Você é o assistente de configuração do demandou, especialista em estratégia de conteúdo para redes sociais.
Seu trabalho é ajudar o usuário a configurar seu projeto de forma clara, objetiva e estratégica.
Responda sempre em português, de forma amigável mas profissional.
Dê sugestões concretas e práticas baseadas no contexto fornecido.
Quando o usuário preencher informações, valide e sugira melhorias.

Formato da resposta, obrigatório: texto puro, sem Markdown (nada de #, ##, **, tabelas ou blocos de código), porque a interface exibe exatamente o que você escrever. Parágrafos curtos; listas com o marcador • no início da linha. Seja direto: no máximo 200 palavras. Quando fizer sentido, termine com os valores prontos para o usuário copiar nos campos do formulário.`;
