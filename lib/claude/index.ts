import Anthropic from "@anthropic-ai/sdk";
import { recordUsage, type UsageContext } from "@/lib/claude/usage";

let _client: Anthropic | null = null;

/**
 * O cliente compartilhado.
 *
 * Exportado desde 19/09 para lib/claude/ferramentas.ts, que roda o laco de
 * ferramentas do escritorio. Um segundo `new Anthropic()` la dentro criaria
 * um cliente com OUTRO teto de tempo e OUTRA politica de retentativa, que e
 * exatamente a armadilha que o comentario abaixo descreve.
 */
export function getClient(): Anthropic {
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
 * Migrado de claude-sonnet-5 para claude-opus-5 em 19/09/2026.
 *
 * (Histórico: sonnet-4-5 → sonnet-5 em 18/08/2026, pelo preço promocional.)
 *
 * MOTIVO: a Demandou virou produto premium, e o texto é o produto. O que o
 * cliente lê é a saída deste modelo; a arte acompanha.
 *
 * O CUSTO FOI MEDIDO, e não estimado em tabela. O volume REAL dos últimos 30
 * dias (879 chamadas, 4,4 milhões de tokens de entrada e 1,6 de saída) foi
 * reprecificado nos três modelos, que é a única comparação honesta:
 *
 *   Sonnet 5 (o que rodava)   R$ 130,02   1,00x
 *   Opus 5                    R$ 325,04   1,57x
 *   Haiku 4.5                 R$  65,01   0,31x
 *
 * No plano Autoridade de R$ 697 com quatro campanhas por mês, o texto passa a
 * ser 18,1% do preço, e é o MAIOR item da conta de IA, acima do vídeo. Isso é
 * contraintuitivo e vale saber: quem procurasse economia começaria pelo vídeo.
 *
 * O QUE O OPUS 5 RECUSA COM 400, conferido no código antes de trocar:
 *   • `budget_tokens` (o pensamento agora é adaptativo e vem LIGADO por
 *     padrão; não existe orçamento fixo). Nenhuma chamada nossa usa;
 *   • prefill de assistente, ou seja mandar a última mensagem como
 *     `assistant`. Nenhuma chamada nossa usa: `askClaude` monta sempre uma
 *     mensagem `user` só. Os `role: "assistant"` que existem no projeto são
 *     histórico de chat gravado no banco, e não vão para a API;
 *   • `temperature`, `top_p` e `top_k`. Os que existem no projeto são de
 *     chamadas ao Gemini e ao Grok.
 *
 * `output_config.effort` continua valendo e ganha importância: com o
 * pensamento ligado por padrão, é o efforto que controla profundidade e custo.
 * As tarefas mecânicas do projeto já rodam em "low" desde 23/08.
 *
 * Efeito colateral esperado: trocar de modelo invalida o cache de prompt, então
 * a primeira chamada de cada projeto reescreve o cache. É custo único.
 */
/*
 * DE VOLTA PARA O SONNET 5 em 01/10/2026, decisão do Bruno: "bem mais barato
 * e, para o que fazemos, entrega tão bem quanto". O estudo de custos de 30/09
 * mostrou o Claude como MAIOR custo da operação (US$ 122 de US$ 239 em 30
 * dias; 45% a 64% de uma gravação de 22 min, puxado pelo diretor de montagem).
 * Sonnet 5 custa US$ 2 de entrada e US$ 10 de saída por milhão de tokens,
 * contra US$ 5 e US$ 25 do Opus 5. Os parâmetros que usamos (effort, mensagem
 * única de usuário, sem temperature) são os mesmos que rodavam antes de 19/09.
 * Quem precisar do Opus numa chamada específica passa `model` explícito.
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
  /**
   * Quanto tempo o prefixo fica no cache. O padrão da API é 5 minutos, e a
   * campanha leva 51: cada dia (7 min) reescrevia o prefixo e pagava 1,25x
   * por ele. Com "1h" a gravação custa 2x, mas é UMA por campanha, e as 54
   * chamadas seguintes leem a 0,1x. Medido em 20/09: o cache do Opus estava
   * em 35% com o padrão. Só quem faz muitas chamadas seguidas deve pedir 1h.
   */
  cacheTtl?: "5m" | "1h";
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
  cachedPrefix?: string,
  cacheTtl?: "5m" | "1h"
): string | Anthropic.TextBlockParam[] {
  if (!cachedPrefix) return systemPrompt;
  return [
    {
      type: "text",
      text: cachedPrefix,
      cache_control: cacheTtl === "1h" ? { type: "ephemeral", ttl: "1h" } : { type: "ephemeral" },
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
      system: buildSystem(systemPrompt, options?.cachedPrefix, options?.cacheTtl),
      messages: [{ role: "user", content: userMessage }],
      ...(options?.effort ? { output_config: { effort: options.effort } } : {}),
    },
    { timeout: timeoutMs }
  );
  let message;
  try {
    message = await stream.finalMessage();
  } catch (e) {
    throw traduzirErroDaApi(e);
  }

  void recordUsage(model, message.usage, options?.usage);

  return extrairTexto(message.content, message.stop_reason, maxTokens);
}

/**
 * Traduz o erro da API para uma frase que diz o que fazer.
 *
 * Existe por causa de 08/09: a conta da Anthropic ficou sem saldo e o produto
 * inteiro passou a falhar com "Nao consegui gerar agora, tente de novo em
 * alguns segundos", que e exatamente a mensagem que faz a pessoa tentar de novo
 * para sempre. O saldo acabado nao melhora sozinho, e quem precisa saber e o
 * dono da conta, nao o visitante.
 *
 * Um erro de saldo tambem grita no log do servidor: e a unica forma de a
 * plataforma inteira parar sem ninguem perceber.
 */
export class SemSaldoNaApi extends Error {
  readonly semSaldo = true;
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "SemSaldoNaApi";
  }
}

export function ehErroDeSaldo(e: unknown): boolean {
  return e instanceof SemSaldoNaApi || /credit balance is too low|insufficient.*credit/i.test(
    e instanceof Error ? e.message : String(e)
  );
}

function traduzirErroDaApi(e: unknown): Error {
  const mensagem = e instanceof Error ? e.message : String(e);
  if (/credit balance is too low|insufficient.*credit/i.test(mensagem)) {
    console.error(
      "[claude] A CONTA DA ANTHROPIC ESTA SEM SALDO. Todo agente, corte e demo " +
        "vao falhar ate a recarga. console.anthropic.com, Billing."
    );
    return new SemSaldoNaApi(
      "A plataforma esta sem saldo de API. Avise o suporte: nada vai funcionar ate a recarga."
    );
  }
  return e instanceof Error ? e : new Error(mensagem);
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
    system: buildSystem(systemPrompt, options?.cachedPrefix, options?.cacheTtl),
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

/**
 * A mesma chamada, com um PDF junto da pergunta.
 *
 * Existe para o manual de marca (14/09): a API le PDF como bloco de documento,
 * entao nao precisamos de biblioteca de extracao nem de OCR proprio. O `npm
 * install pdf-parse` caiu por rede no dia, e a verdade e que nao fazia falta.
 *
 * Sem streaming de proposito: a resposta aqui e um documento compilado de
 * poucos milhares de tokens, e o timeout generoso cobre o PDF grande.
 */
export async function askClaudeComPdf(
  systemPrompt: string,
  userMessage: string,
  pdfBase64: string,
  options?: AskOptions
): Promise<string> {
  const model = options?.model ?? DEFAULT_MODEL;
  const maxTokens = options?.maxTokens ?? 8192;
  const timeoutMs = options?.timeoutMs ?? 300_000;

  const stream = getClient().messages.stream(
    {
      model,
      max_tokens: maxTokens,
      system: buildSystem(systemPrompt, options?.cachedPrefix, options?.cacheTtl),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
            },
            { type: "text", text: userMessage },
          ],
        },
      ],
    },
    { timeout: timeoutMs }
  );
  let message;
  try {
    message = await stream.finalMessage();
  } catch (e) {
    throw traduzirErroDaApi(e);
  }
  void recordUsage(model, message.usage, options?.usage);
  return extrairTexto(message.content, message.stop_reason, maxTokens);
}

/**
 * A mesma chamada, com uma IMAGEM junto da pergunta.
 *
 * Existe para a conferencia de arte de 19/09: ate entao a Vera aprovava a peca
 * visual lendo um texto que dizia "GERADA com sucesso", sem nunca ver a arte.
 * Foi assim que uma imagem com o numero "61%" cortado no topo passou pela
 * revisao e foi publicada em quatro redes.
 *
 * Sem streaming de proposito: a resposta e um parecer curto, e o teto de tempo
 * aqui e apertado porque isto roda dentro do orcamento da Diana.
 */
export async function askClaudeComImagem(
  systemPrompt: string,
  userMessage: string,
  imagemBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg",
  options?: AskOptions
): Promise<string> {
  const model = options?.model ?? DEFAULT_MODEL;
  const maxTokens = options?.maxTokens ?? 4096;
  const timeoutMs = options?.timeoutMs ?? 60_000;

  const stream = getClient().messages.stream(
    {
      model,
      max_tokens: maxTokens,
      system: buildSystem(systemPrompt, options?.cachedPrefix, options?.cacheTtl),
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imagemBase64 } },
            { type: "text", text: userMessage },
          ],
        },
      ],
      ...(options?.effort ? { output_config: { effort: options.effort } } : {}),
    },
    { timeout: timeoutMs }
  );
  let message;
  try {
    message = await stream.finalMessage();
  } catch (e) {
    throw traduzirErroDaApi(e);
  }
  void recordUsage(model, message.usage, options?.usage);
  return extrairTexto(message.content, message.stop_reason, maxTokens);
}

/**
 * VÁRIAS imagens numa mensagem só (01/10/2026), cada uma com um rótulo de
 * texto logo antes dela. Existe para a detecção de tela compartilhada
 * (lib/media/telas-da-gravacao.ts): classificar 16 prints numa chamada custa
 * o mesmo por imagem e paga o prompt uma vez só, em vez de 16.
 */
export async function askClaudeComImagens(
  systemPrompt: string,
  userMessage: string,
  imagens: Array<{ base64: string; rotulo: string; mediaType?: "image/jpeg" | "image/png" | "image/webp" }>,
  options?: AskOptions
): Promise<string> {
  const model = options?.model ?? DEFAULT_MODEL;
  const maxTokens = options?.maxTokens ?? 8192;
  const timeoutMs = options?.timeoutMs ?? 120_000;
  const conteudo: Anthropic.ContentBlockParam[] = [];
  for (const im of imagens) {
    conteudo.push({ type: "text", text: im.rotulo });
    conteudo.push({ type: "image", source: { type: "base64", media_type: im.mediaType ?? "image/jpeg", data: im.base64 } });
  }
  conteudo.push({ type: "text", text: userMessage });
  const stream = getClient().messages.stream(
    {
      model,
      max_tokens: maxTokens,
      system: buildSystem(systemPrompt, options?.cachedPrefix, options?.cacheTtl),
      messages: [{ role: "user", content: conteudo }],
      ...(options?.effort ? { output_config: { effort: options.effort } } : {}),
    },
    { timeout: timeoutMs }
  );
  let message;
  try {
    message = await stream.finalMessage();
  } catch (e) {
    throw traduzirErroDaApi(e);
  }
  void recordUsage(model, message.usage, options?.usage);
  return extrairTexto(message.content, message.stop_reason, maxTokens);
}
