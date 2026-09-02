import { askClaude } from "@/lib/claude";

/**
 * A legenda do carrossel da Diana, escrita com o nicho, o público e a voz.
 *
 * Até 02/09 este arquivo também montava o carrossel do vídeo sozinho, com
 * as `fraseDaCapa` dos cortes, num card fixo de sábado. Desde a campanha a
 * partir do vídeo (parte 90) quem monta é `pecas-da-semana.ts`, no dia e no
 * formato que o cliente escolheu, e com as frases vindas das teses do
 * Roberto. Ficou aqui só a legenda, que as duas versões compartilham.
 */

const NOME_DA_REDE: Record<string, string> = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  facebook: "Facebook",
};

/**
 * A legenda do carrossel, escrita e não montada. A primeira versão (02/09,
 * de tarde) era um template: "As ideias que ficaram do vídeo <nome do
 * arquivo>" mais a lista numerada. A Vera reprovou na primeira revisão, e
 * com razão: "rascunho de pauta, anotações cruas". Agora a Diana escreve a
 * legenda com o nicho, o público e a voz do projeto, e as frases dos slides
 * entram como esqueleto, não como o texto final.
 */
export async function escreverLegendaDoCarrossel(args: {
  frases: string[];
  contexto: string[];
  projeto: { name: string; niche: string | null; targetAudience: string | null; voice: string | null };
  rede: string;
  usage: { runId: string | null; projectId: string };
}): Promise<string> {
  const { frases, contexto, projeto, rede, usage } = args;
  const tarefa = `Escreva a legenda de um carrossel de ${frases.length} slides para ${NOME_DA_REDE[rede] ?? rede}.

PROJETO: ${projeto.name}
NICHO: ${projeto.niche ?? "não informado"}
PÚBLICO: ${projeto.targetAudience ?? "não informado"}
VOZ DA MARCA: ${projeto.voice ?? "não informada"}

FRASES DOS SLIDES, na ordem (cada uma é o texto de um slide):
${frases.map((f, i) => `${i + 1}. ${f}`).join("\n")}

DE ONDE AS FRASES VIERAM (títulos e descrições dos cortes do vídeo, para você desenvolver com contexto e não inventar nada):
${contexto.join("\n\n")}

REGRAS:
- Primeira linha: um gancho de até 90 caracteres que faça parar o dedo. Não repita a frase do slide 1 literalmente.
- Depois, um parágrafo curto por slide, desenvolvendo a ideia com a voz da marca e falando com esse público. Sem numerar, sem "slide 1".
- Feche com uma pergunta ou chamada para ação de uma linha.
- Português brasileiro natural, sem clichê motivacional, no máximo 2 emojis, sem hashtag no corpo.
- Nenhum dado, estatística ou citação que não esteja no contexto acima.
- Sem travessão: use vírgula, dois-pontos ou parênteses.
- Entre 600 e 1100 caracteres. Devolva SÓ a legenda, sem título, sem comentário.`;

  const saida = await askClaude(
    "Você é Diana Design, redatora visual de conteúdo para redes sociais. Escreve legendas que conversam, não que anunciam.",
    tarefa,
    { maxTokens: 4000, usage: { operation: "agent", runId: usage.runId ?? undefined, agentId: "diana-design", projectId: usage.projectId } }
  );
  return saida.trim();
}
