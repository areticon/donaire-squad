import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

export async function askClaude(
  systemPrompt: string,
  userMessage: string,
  options?: { maxTokens?: number; model?: string }
): Promise<string> {
  const message = await getClient().messages.create({
    model: options?.model ?? "claude-sonnet-4-5",
    max_tokens: options?.maxTokens ?? 2048,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected response type");
  return block.text;
}

export async function streamClaude(
  systemPrompt: string,
  userMessage: string,
  onChunk: (text: string) => void,
  options?: { maxTokens?: number }
): Promise<string> {
  let fullText = "";

  const stream = getClient().messages.stream({
    model: "claude-sonnet-4-5",
    max_tokens: options?.maxTokens ?? 2048,
    system: systemPrompt,
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

  return fullText;
}

export const KANBAN_SYSTEM_PROMPT = `Você é o assistente de configuração do Demandou, especialista em estratégia de conteúdo para redes sociais. 
Seu trabalho é ajudar o usuário a configurar seu projeto de forma clara, objetiva e estratégica.
Responda sempre em português, de forma amigável mas profissional.
Dê sugestões concretas e práticas baseadas no contexto fornecido.
Quando o usuário preencher informações, valide e sugira melhorias.`;
