import Anthropic from "@anthropic-ai/sdk";
import { getClient, DEFAULT_MODEL, type AskOptions } from "@/lib/claude";
import { recordUsage } from "@/lib/claude/usage";

/**
 * O LAÇO DE FERRAMENTAS, que é o que separa um agente de um chatbot.
 *
 * Nasceu em 19/09, do veredito do Bruno depois de conversar com o Roberto no
 * escritório. Ele perguntou "Vera está muito brava hoje?" de propósito, para
 * provocar inteligência, e o Roberto respondeu "não sei, não tenho como
 * avaliar isso, nem tenho trabalho registrado neste projeto ainda".
 *
 * A resposta era correta e o produto estava errado. O Roberto NAO TINHA como
 * saber: o prompt daquela conversa carregava os cards DELE e mais nada, entao
 * ele nao tinha uma linha sequer sobre a Vera. E as regras o proibiam de
 * observar, inferir ou opinar sobre qualquer coisa fora daquela lista.
 *
 * O pedido do Bruno foi: "eles precisam estar sempre conectados em tempo real,
 * ter poder de pensar e agirem sozinho, so nao publica nada".
 *
 * Este arquivo e a parte do "agir". Ele da ao agente um conjunto de
 * ferramentas que ele decide sozinho quando usar, em vez de receber um bloco
 * de contexto fixo montado por nos. A diferenca importa: com contexto fixo,
 * quem decide o que o agente sabe somos nos, e ele so pode responder o que
 * anteciparmos. Com ferramenta, ele PROCURA.
 *
 * ## O limite, e ele e duro
 *
 * Ferramenta que MUDA alguma coisa e escolha de quem monta a lista, nunca
 * deste arquivo. O escritorio da ao agente ferramentas de LER o projeto
 * inteiro e UMA de agir (pedir ajuste numa peca). Publicar nao esta na lista e
 * nao vai estar: e a unica coisa que o Bruno nomeou como proibida.
 */

export type Ferramenta = {
  nome: string;
  /** O que ela faz, na voz de quem vai escolher usá-la. Entra no prompt. */
  descricao: string;
  /** JSON Schema dos argumentos. */
  entrada: Record<string, unknown>;
  /** O que rodar. Devolve texto, que volta para o modelo. */
  rodar: (args: Record<string, unknown>) => Promise<string>;
};

export type RespostaComFerramentas = {
  texto: string;
  /** O que ele usou, na ordem, para o log e para a tela poder contar. */
  usou: Array<{ nome: string; args: Record<string, unknown>; resultado: string }>;
};

/**
 * Quantas voltas o laço dá antes de desistir.
 *
 * Seis cobre "olho a semana, olho a peça, olho o colega, respondo" com folga.
 * Sem teto, um modelo confuso fica pedindo a mesma ferramenta para sempre, e
 * cada volta é uma chamada paga.
 */
const MAXIMO_DE_VOLTAS = 6;

export async function askClaudeComFerramentas(
  systemPrompt: string,
  userMessage: string,
  ferramentas: Ferramenta[],
  options?: AskOptions
): Promise<RespostaComFerramentas> {
  const model = options?.model ?? DEFAULT_MODEL;
  const maxTokens = options?.maxTokens ?? 8192;
  const timeoutMs = options?.timeoutMs ?? 120_000;

  const definicoes: Anthropic.Tool[] = ferramentas.map((f) => ({
    name: f.nome,
    description: f.descricao,
    input_schema: f.entrada as Anthropic.Tool.InputSchema,
  }));

  const mensagens: Anthropic.MessageParam[] = [{ role: "user", content: userMessage }];
  const usou: RespostaComFerramentas["usou"] = [];

  for (let volta = 0; volta < MAXIMO_DE_VOLTAS; volta++) {
    // Streaming pelo mesmo motivo do `askClaude`: resposta longa sem stream
    // fica presa em heuristica de timeout de HTTP, e ja quebrou em producao.
    const stream = getClient().messages.stream(
      {
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: mensagens,
        tools: definicoes,
        ...(options?.effort ? { output_config: { effort: options.effort } } : {}),
      },
      { timeout: timeoutMs }
    );
    const message = await stream.finalMessage();
    void recordUsage(model, message.usage, options?.usage);

    const pedidos = message.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    if (pedidos.length === 0 || message.stop_reason !== "tool_use") {
      const texto = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { texto, usou };
    }

    mensagens.push({ role: "assistant", content: message.content });

    /**
     * As ferramentas de uma volta rodam EM PARALELO.
     *
     * O modelo pede "ver a semana" e "ver a Vera" na mesma volta porque as
     * duas são independentes; rodar em sequência dobraria a espera de uma
     * conversa que acontece com a pessoa parada olhando a tela.
     */
    const resultados = await Promise.all(
      pedidos.map(async (p) => {
        const f = ferramentas.find((x) => x.nome === p.name);
        const args = (p.input ?? {}) as Record<string, unknown>;
        let resultado: string;
        if (!f) {
          resultado = `A ferramenta ${p.name} não existe.`;
        } else {
          try {
            resultado = await f.rodar(args);
          } catch (e) {
            // O ERRO VOLTA PARA O MODELO, e não derruba a conversa. Ele
            // costuma se corrigir sozinho (id errado, argumento faltando), e
            // derrubar tudo por causa de uma ferramenta que falhou seria
            // trocar uma resposta parcial por nenhuma.
            resultado = `Não deu para fazer isso: ${e instanceof Error ? e.message : "erro"}`;
          }
        }
        usou.push({ nome: p.name, args, resultado });
        return {
          type: "tool_result" as const,
          tool_use_id: p.id,
          content: resultado.slice(0, 12_000),
        };
      })
    );

    mensagens.push({ role: "user", content: resultados });
  }

  /**
   * Estourou as voltas. Uma última chamada SEM ferramentas obriga o modelo a
   * responder com o que já tem, em vez de a pessoa receber silêncio depois de
   * seis chamadas pagas.
   */
  const fecho = getClient().messages.stream(
    {
      model,
      max_tokens: maxTokens,
      system: `${systemPrompt}\n\nVocê já consultou o que precisava. Responda AGORA, com o que tem, sem pedir mais nada.`,
      messages: mensagens,
    },
    { timeout: timeoutMs }
  );
  const ultima = await fecho.finalMessage();
  void recordUsage(model, ultima.usage, options?.usage);
  const texto = ultima.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return { texto, usou };
}
