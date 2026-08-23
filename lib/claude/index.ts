import Anthropic from "@anthropic-ai/sdk";
import { recordUsage, type UsageContext } from "@/lib/claude/usage";

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      // ATENÇÃO: teto global aqui é armadilha, e já cobrou caro.
      //
      // Ele era 90s, escolhido para as chamadas curtas do pipeline. Em 22/08 a
      // seleção de trechos de um vídeo de 27 minutos passou a levar 121s
      // MEDIDOS, e o SDK abortava aos 90, RETENTAVA duas vezes (o padrão dele)
      // e devolvia "Request timed out." depois de uns 270s. Pior: cada
      // tentativa abortada gera tokens do lado da Anthropic e é cobrada, mas
      // não vira linha em `ai_usage`, porque a nossa gravação só acontece
      // depois da resposta voltar. Ou seja, timeout aqui vira custo invisível.
      //
      // O teto real de cada chamada é decidido em `askClaude`, por tarefa.
      // 300s é só a rede de segurança para quem não decidir nada.
      timeout: 300_000,
      // 1, e não 2: quando a causa é lentidão, retentar multiplica o tempo de
      // parede e o custo sem aumentar a chance de sucesso. Erro que vale
      // retentar (429, 5xx) continua sendo retentado uma vez.
      maxRetries: 1,
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
  /**
   * Teto de tempo desta chamada. Sobe para tarefa pesada, desce para tarefa
   * interativa em que esperar muito é pior que falhar rápido.
   */
  timeoutMs?: number;
  /**
   * Profundidade de raciocínio. O padrão do modelo é alto, e ele NÃO é o certo
   * para toda tarefa.
   *
   * Medido em 23/08 na limpeza de hesitação, mesma entrada, mesmo prompt:
   *
   *   alto   97,9s   10.213 tokens de saída
   *   médio  62,7s    6.776
   *   baixo  ~25s     ~2.500
   *
   * O resultado foi equivalente nos três, porque a tarefa é mecânica: achar
   * muleta numa lista de palavras não exige raciocínio profundo, exige leitura.
   * Como o cobrado é o que o modelo GERA, e quase tudo ali é pensamento, baixar
   * o esforço cortou o custo em quatro vezes sem perder qualidade.
   *
   * Regra: tarefa de julgamento (escolher trechos, escrever) fica no padrão;
   * tarefa mecânica sobre lista (marcar, classificar, extrair) vai em "low",
   * COM verificação em código do que voltou.
   */
  // Os níveis são os que o SDK instalado aceita. `xhigh` existe na API mais
  // nova mas não nos tipos desta versão, e inventar aqui só quebraria o build.
  effort?: "low" | "medium" | "high" | "max";
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

  // REGRA DA CASA desde 22/08: nenhum maxTokens abaixo de 4000 numa chamada
  // que faz trabalho de verdade. O teto inclui os tokens de pensamento, então
  // teto apertado não gera resposta curta, gera resposta VAZIA. E subir o teto
  // não encarece por si: o cobrado é o que o modelo gera, e o pensamento
  // adaptativo decide a profundidade sozinho.
  // 8192 de padrão, não 2048: o teto inclui os tokens de pensamento, que no
  // Sonnet 5 vem ligado por padrão. Teto baixo faz o modelo gastar tudo
  // pensando e devolver resposta sem texto, que foi o que quebrou a seleção
  // de trechos de um vídeo de 27 minutos em 22/08.
  const maxTokens = options?.maxTokens ?? 8192;

  // Teto de tempo proporcional ao trabalho pedido, com piso de 90s.
  //
  // A base vem de medição, não de chute: 10.916 tokens de saída levaram 121s
  // numa seleção real, ou seja perto de 90 tokens por segundo. 25s por mil
  // tokens dá quase três vezes de folga sobre isso, e o teto de 300s mantém o
  // pior caso dentro do `maxDuration` de 800s das rotas de vídeo mesmo com a
  // retentativa (300 + 300 = 600).
  const timeoutMs =
    options?.timeoutMs ?? Math.min(300_000, Math.max(90_000, (maxTokens / 1000) * 25_000));

  // STREAMING, sempre. Não é para mostrar texto aparecendo: é porque resposta
  // longa sem streaming vive presa a heurísticas de timeout de requisição
  // HTTP, e foi assim que a seleção quebrou em produção. Com streaming os
  // bytes chegam continuamente e a conexão nunca fica ociosa.
  //
  // `finalMessage()` devolve a mensagem completa, então o resto do código não
  // muda: quem chama continua recebendo o texto pronto.
  const stream = getClient().messages.stream(
    {
      model,
      max_tokens: maxTokens,
      system: buildSystem(systemPrompt, options?.cachedPrefix),
      messages: [{ role: "user", content: userMessage }],
      ...(options?.effort ? { output_config: { effort: options.effort } } : {}),
    },
    { timeout: timeoutMs }
  );
  const message = await stream.finalMessage();

  void recordUsage(model, message.usage, options?.usage);

  return extrairTexto(message.content, message.stop_reason, maxTokens);
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
function extrairTexto(
  content: Anthropic.ContentBlock[],
  stopReason?: string | null,
  maxTokens?: number
): string {
  const texto = content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  if (!texto) {
    const tipos = content.map((b) => b.type).join(", ") || "nenhum";

    // Caso que derrubou a seleção de trechos em 22/08, com uma transcrição de
    // 27 minutos: o `max_tokens` é um teto que inclui os tokens de PENSAMENTO,
    // e o modelo gastou os 4000 inteiros pensando, sem sobrar nada para
    // escrever. A resposta volta só com blocos de pensamento e stop_reason
    // "max_tokens". Dizer isso é a diferença entre um erro acionável e um
    // enigma, porque o conserto é aumentar o teto, não mexer no prompt.
    if (stopReason === "max_tokens") {
      throw new Error(
        `O modelo gastou o limite de ${maxTokens ?? "?"} tokens pensando e não chegou a responder. ` +
          `Aumente o maxTokens desta chamada. Blocos recebidos: ${tipos}.`
      );
    }

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
