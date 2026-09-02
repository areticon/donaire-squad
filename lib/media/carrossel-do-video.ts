import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";
import { generateImage } from "@/lib/media/nano-banana";
import type { Trecho } from "@/lib/media/select-clips";

/**
 * A Diana monta o carrossel do vídeo.
 *
 * Até 02/09 o agendar escrevia só o BRIEFING no card da Diana ("Carrossel com
 * as frases fortes do vídeo...") e decidia, de propósito, não gerar as
 * imagens, porque imagem custa crédito. A tela não contava isso para ninguém:
 * o Bruno viu o card de sábado sem nada e chamou de travado. Decisão revista:
 * o carrossel nasce pronto, como a Diana da campanha de texto já fazia.
 *
 * Um slide por frase forte (a `fraseDaCapa` que a redação já escreveu por
 * corte), quadrado, com a frase escrita na imagem, na paleta do projeto. O
 * resultado vira um post de carrossel na primeira rede conectada que aceita
 * carrossel (Instagram, LinkedIn ou Facebook), e o card da Diana passa a
 * apontar para esse post, o que faz a esteira (Vera e Paulo) cobrir o dia.
 *
 * Idempotente: card que já tem mídia é pulado.
 */

type TrechoComTexto = Trecho & {
  publicar?: boolean;
  texto?: { titulo?: string; descricao?: string; fraseDaCapa?: string };
};

const REDES_COM_CARROSSEL = ["instagram", "linkedin", "facebook"] as const;

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

export async function gerarCarrosselDoVideo(videoJobId: string): Promise<boolean> {
  const video = await prisma.videoJob.findUnique({
    where: { id: videoJobId },
    select: {
      id: true,
      projectId: true,
      clips: true,
      project: {
        select: {
          name: true,
          niche: true,
          targetAudience: true,
          voice: true,
          colorPalette: true,
          socialAccounts: { where: { isActive: true }, select: { platform: true, id: true } },
        },
      },
    },
  });
  if (!video) return false;

  const card = await prisma.campaignCard.findFirst({
    where: {
      projectId: video.projectId,
      agentId: "diana-design",
      metadata: { path: ["videoJobId"], equals: videoJobId },
    },
    select: { id: true, runId: true, dayOfWeek: true, scheduledDate: true, mediaUrl: true, postId: true, metadata: true, content: true },
  });
  if (!card || card.mediaUrl || card.postId) return false;

  const trechos = ((video.clips as unknown as TrechoComTexto[]) ?? []);
  const frases = trechos
    .map((t) => t.texto?.fraseDaCapa?.trim())
    .filter((f): f is string => Boolean(f))
    .slice(0, 5);
  if (frases.length < 2) return false;

  const rede = REDES_COM_CARROSSEL.map((p) => video.project.socialAccounts.find((a) => a.platform === p)).find(Boolean);
  const paleta = video.project.colorPalette?.trim();
  const estilo =
    `Square social media carousel slide, bold typographic design, one short sentence in Brazilian Portuguese as the hero text, ` +
    `large clean sans-serif typography, high contrast, generous margins, minimal abstract background, ` +
    (paleta ? `brand color palette: ${paleta}, ` : "") +
    `niche: ${video.project.niche ?? "business"}. No watermark, no logo, no extra text besides the sentence.`;

  const urls: string[] = [];
  try {
    for (let i = 0; i < frases.length; i++) {
      const prompt =
        `${estilo} Slide ${i + 1} of ${frases.length}. The text on the slide must read exactly: "${frases[i]}"`;
      const url = await generateImage(prompt, "1:1", "standard", {
        projectId: video.projectId,
        runId: card.runId,
        operation: "campanha_imagem",
      });
      urls.push(url);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[diana][${videoJobId}] carrossel falhou no slide ${urls.length + 1}:`, e);
    await prisma.campaignCard.update({
      where: { id: card.id },
      data: {
        content: `AVISO: não consegui gerar o carrossel (${msg.slice(0, 160)}). Peça de novo pelo chat deste card.\n\n${card.content ?? ""}`,
      },
    });
    return false;
  }

  const redeNome = rede?.platform ?? "instagram";
  const contexto = trechos
    .filter((t) => t.texto?.fraseDaCapa)
    .map((t) => `${t.texto?.titulo ?? ""}\n${t.texto?.descricao ?? ""}`.trim())
    .filter(Boolean);
  let legenda: string;
  try {
    legenda = await escreverLegendaDoCarrossel({
      frases,
      contexto,
      projeto: video.project,
      rede: redeNome,
      usage: { runId: card.runId, projectId: video.projectId },
    });
  } catch (e) {
    // As imagens já existem e custaram crédito; a legenda de reserva é a
    // lista das frases, e a Vera vai apontar que precisa desenvolver.
    console.error(`[diana][${videoJobId}] legenda falhou, usando as frases:`, e);
    legenda = `${frases[0]}\n\n${frases.map((f, i) => `${i + 1}. ${f}`).join("\n")}\n\nQual dessas fala mais com você hoje?`;
  }

  const data = card.scheduledDate ?? new Date();
  const post = await prisma.post.create({
    data: {
      projectId: video.projectId,
      platform: redeNome,
      socialAccountId: rede?.id ?? null,
      content: legenda,
      mediaType: "carousel",
      imageUrl: urls.join("|"),
      status: "draft",
      dayOfWeek: card.dayOfWeek,
      scheduledAt: data,
      runId: card.runId,
      metadata: { origem: "video", videoJobId: video.id, derivado: true, carrossel: true },
    },
    select: { id: true },
  });

  const meta = (card.metadata as Record<string, unknown> | null) ?? {};
  await prisma.campaignCard.update({
    where: { id: card.id },
    data: {
      mediaType: "carousel",
      mediaUrl: urls.join("|"),
      postId: post.id,
      content: legenda,
      metadata: { ...meta, slides: frases.length, rede: redeNome },
    },
  });
  return true;
}
