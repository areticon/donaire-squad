import { askClaude } from "@/lib/claude";

/**
 * O QUE FAZ UMA ARTE SER POST, E NÃO ILUSTRAÇÃO.
 *
 * Este arquivo nasceu em 19/09, do veredito do Bruno olhando as peças que a
 * campanha de prova produziu: "você já viu algum feed de empresa alguma vez?
 * isso parece post para você?". Ele estava certo, e a comparação entre as três
 * peças do mesmo dia diz exatamente por quê.
 *
 * O QUE SAIU DE CADA CAMINHO, medido olhando os arquivos:
 *
 *   • CARROSSEL (bom): manchete gigante em português, "Você não parou por
 *     falta de ideia", colagem editorial preto e laranja, um rosto com fita na
 *     boca. Post de verdade.
 *   • IMAGEM (ruim): um painel de dashboard inventado, com "WEEK 1", "TIME",
 *     "CLARITY", "SUSTAINABLE FLOOR", tudo em INGLÊS, um erro de escrita
 *     ("syetem for tired days") e metade da tela vazia. A versão 16:9 do
 *     LinkedIn saiu SEM UMA PALAVRA, só formas.
 *   • QUADRO DO VÍDEO (pior): o prompt do Veo entregue ao modelo de imagem, que
 *     desenhou o storyboard com os códigos de tempo no canto ("0-2", "2,5-5",
 *     "5-8") e um "headlime creator" escrito errado.
 *
 * A DIFERENÇA NÃO FOI SORTE, FOI ARQUITETURA. O carrossel pede duas coisas que
 * os outros dois não pediam:
 *
 *   1. UMA FRASE, escrita por quem escreve texto, em português, ANTES de
 *      qualquer imagem. Modelo de imagem não escreve copy; ele desenha o que
 *      ouve, e quando não ouve frase nenhuma ele inventa rótulo em inglês;
 *   2. "DESENHE EXATAMENTE ESTE TEXTO COMO A MANCHETE DOMINANTE, E NENHUM
 *      OUTRO TEXTO". Sem essa segunda metade, o modelo enche a arte de
 *      legendas, botões e eixos, que é literalmente o dashboard que saiu.
 *
 * Então a regra da casa passa a ser: TODA peça de feed nasce de uma manchete.
 * Imagem, carrossel e quadro de vídeo usam este arquivo, e é por isso que ele
 * existe separado em vez de virar mais um trecho dentro da esteira.
 */

export interface MancheteDaPeca {
  /** A frase que vai DESENHADA na arte, em português. */
  manchete: string;
  /** A cena, em inglês, para o modelo de imagem. */
  visual: string;
}

/**
 * Escreve a manchete da peça a partir do texto do post.
 *
 * É uma chamada de texto, e não de imagem, pela mesma razão do roteiro do
 * carrossel: a frase é COPY. Ela carrega o argumento do post, respeita as
 * regras do cliente e não pode inventar número.
 */
export async function mancheteDaPeca(opcoes: {
  textoDoPost: string;
  estiloVisual: string;
  nicho?: string | null;
  projectId?: string;
  runId?: string;
}): Promise<MancheteDaPeca> {
  const bruto = await askClaude(
    `Você escreve a arte de um post de rede social. A arte tem UMA manchete e mais nada escrito.

Responda SÓ com JSON, sem texto antes nem depois, neste formato exato:
{"manchete":"...","visual":"..."}

Regras que não se negociam:
- "manchete" em PORTUGUÊS, no máximo 9 palavras, é o que vai DESENHADO na arte. É a frase que faz a pessoa parar de rolar o feed. Nunca uma frase cortada pela metade, nunca uma pergunta genérica;
- "visual" em INGLÊS, descrevendo a cena que acompanha a manchete: composição, luz, materiais, mood. UMA cena só, não uma sequência e não painéis;
- NUNCA invente número, percentual, data ou nome que não esteja no post abaixo. Sem dado, a manchete fala qualitativo;
- a cena NÃO é um gráfico, não é um painel de dados, não é uma tela de aplicativo e não é um storyboard. É uma cena fotográfica ou uma composição editorial;
- nada de travessão em português.`,
    `ESTILO VISUAL OBRIGATÓRIO (em inglês, aplique na cena):
${opcoes.estiloVisual}

NICHO: ${opcoes.nicho ?? "negócios"}

POST QUE ESTA ARTE ACOMPANHA:
${opcoes.textoDoPost.slice(0, 3000)}`,
    {
      maxTokens: 2048,
      usage: { projectId: opcoes.projectId, runId: opcoes.runId, operation: "manchete_da_peca" },
    }
  );

  const recorte = bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1);
  let lido: { manchete?: unknown; visual?: unknown };
  try {
    lido = JSON.parse(recorte);
  } catch {
    throw new Error("A manchete da peça não veio como JSON válido.");
  }
  const manchete = String(lido.manchete ?? "").trim();
  const visual = String(lido.visual ?? "").trim();
  if (!manchete || !visual) throw new Error("A manchete da peça veio incompleta.");
  return { manchete, visual };
}

/**
 * O PROMPT DE UMA PEÇA DE FEED, que é o mesmo para imagem, lâmina e quadro.
 *
 * As três proibições do fim não são estilo, são a lista exata do que saiu
 * errado em 19/09, uma por uma: rótulo solto em inglês (o dashboard), segunda
 * linha de texto (os "effort on good days"), e painel dividido em cenas (o
 * storyboard do vídeo, com os códigos de tempo desenhados).
 */
export function promptDePecaDeFeed(opcoes: {
  manchete: string;
  visual: string;
  estiloVisual: string;
  /** "This is the FIRST slide..." e afins. Vazio numa peça única. */
  posicao?: string;
  /**
   * A instrução de proporção e margem, da tabela de formatos.
   *
   * Opcional porque `produzirArtePorRede` já cola a dela no fim do prompt
   * base: mandar duas vezes daria ao modelo duas instruções de formato para
   * obedecer, e ele escolhe uma.
   */
  instrucaoDeFormato?: string;
}): string {
  return [
    opcoes.posicao ? `Social media carousel slide. ${opcoes.posicao}` : `A single social media feed post image.`,
    ``,
    `The image must display this exact Brazilian Portuguese text, spelled exactly as written,`,
    `as the single dominant headline, and NO other text anywhere:`,
    `"${opcoes.manchete}"`,
    ``,
    `Scene: ${opcoes.visual}`,
    ``,
    `VISUAL STYLE: ${opcoes.estiloVisual}`,
    ``,
    `Typography must be crisp and correctly spelled, large, and readable on a phone.`,
    `Do not invent words. Do not write anything in English.`,
    `Do not add a URL, a logo, a watermark, a slide number, a price, a caption,`,
    `a label, an axis, a legend or any second line of text.`,
    `Do not draw a chart, a dashboard, a data panel, an app screen or a user interface.`,
    `Do not split the image into panels, frames, a grid or a storyboard,`,
    `and never draw timecodes or scene numbers.`,
    ...(opcoes.instrucaoDeFormato ? ["", opcoes.instrucaoDeFormato] : []),
  ].join("\n");
}

/**
 * Desenha a arte de uma peça de feed.
 *
 * Até 01/10 era o GPT Image 2 medium da OpenAI direto, porque em 19/09 a arte
 * tinha a manchete DESENHADA e só ele escrevia certo. Desde 30/09 a frase é
 * composta em código (lib/media/arte-com-frase.tsx) e o modelo desenha só a
 * cena, então o motivo de pagar o medium acabou. Agora vale o seletor
 * IMAGEM_ARTE (GPT Image 2.5 baixa pela Higgsfield, ~US$ 0,025, aprovado na
 * prova de 30/09), com a mesma fila e o mesmo recuo das outras imagens: a
 * OpenAI em qualidade baixa e, por último, o Google (lib/media/nano-banana.ts).
 *
 * `permitirGemini` ficou só por compatibilidade: todo chamador passava true, e
 * a ressalva dele (o Gemini erra texto) não vale para arte sem texto.
 *
 * O aviso, quando a arte sai do último recurso, NÃO nomeia fornecedor (01/10):
 * os avisos vão para o log da execução, que o cliente lê. Quem respondeu está
 * em `ai_usage` e no log do servidor, que é onde o Bruno olha.
 */
export async function desenharPecaDeFeed(opcoes: {
  prompt: string;
  proporcao: "1:1" | "4:5" | "16:9" | "9:16";
  permitirGemini?: boolean;
  avisos?: string[];
  ctx?: { projectId?: string; runId?: string; operation?: string };
}): Promise<string> {
  const { gerarImagem } = await import("@/lib/media/nano-banana");
  const ctx = { operation: "peca_de_feed", ...opcoes.ctx };
  const r = await gerarImagem(opcoes.prompt, opcoes.proporcao, "hd", ctx, { tipo: "arte" });
  const aviso = avisoDoRecuoDaArte(r.modelo);
  if (aviso && !opcoes.avisos?.includes(aviso)) opcoes.avisos?.push(aviso);
  return r.dataUrl;
}

/**
 * O aviso ao cliente quando a arte saiu do modelo de reserva, sem nome de
 * fornecedor. Null quando saiu do principal ou da primeira reserva, que
 * entregam a mesma qualidade da prova.
 */
export function avisoDoRecuoDaArte(modelo: string): string | null {
  if (modelo.startsWith("higgsfield-") || modelo.startsWith("gpt-image")) return null;
  return "A arte saiu no modelo de reserva, porque o principal não respondeu a tempo. Confira a imagem antes de aprovar.";
}
