// A capa refeita pelo nano banana leva até 90s; o chat precisa da folga.
export const maxDuration = 300;

import { auth } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";
import { generateImage } from "@/lib/media/nano-banana";
import { generateInfographic } from "@/lib/media/infographic";
import { refazerCorte, refazerCapa } from "@/lib/media/refazer";

/** Detect if a media URL represents a video (GCS URL, external .mp4, or base64 video) */
function detectIsVideo(mediaUrl?: string | null): boolean {
  if (!mediaUrl) return false;
  if (mediaUrl.startsWith("data:video/")) return true;
  if (!mediaUrl.startsWith("data:")) {
    const lower = mediaUrl.toLowerCase();
    if (lower.includes(".mp4") || lower.includes(".webm")) return true;
  }
  return false;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { message, slideIndex } = await req.json();
  if (!message?.trim()) return NextResponse.json({ error: "message required" }, { status: 400 });

  const card = await prisma.campaignCard.findUnique({
    where: { id },
    include: {
      project: { include: { memories: true } },
      post: true,
      run: { select: { config: true } },
    },
  });

  if (!card || card.project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const chatHistory = Array.isArray(card.chatHistory)
    ? (card.chatHistory as { role: string; content: string; timestamp: string }[])
    : [];

  // Build memory context (preferences learned over time)
  const preferences = card.project.memories
    .filter((m) => m.type === "preference")
    .map((m) => `- ${m.key}: ${JSON.stringify(m.value)}`)
    .join("\n");

  const historyContext = chatHistory.length > 0
    ? `\n\nHistórico de ajustes:\n${chatHistory.map((m) => `${m.role === "user" ? "Usuário" : "IA"}: ${m.content.slice(0, 200)}`).join("\n")}`
    : "";

  // ── Media card: refine prompt then regenerate image/video ─────────────────
  if (card.cardType === "media") {
    const existingSlides = card.mediaUrl?.includes("|")
      ? card.mediaUrl.split("|").filter((s) => s.trim().length > 10)
      : null;
    const isCarousel = existingSlides && existingSlides.length > 1;
    const targetSlide = typeof slideIndex === "number" && isCarousel ? slideIndex : null;

    const msgLower = message.toLowerCase();
    const userRequestsVideo = msgLower.includes("video") || msgLower.includes("vídeo") || msgLower.includes("gerar video") || msgLower.includes("gerar vídeo");
    const cardMediaType = (card as { mediaType?: string | null }).mediaType;
    const isInfographic = cardMediaType === "infographic";
    const isVideo = cardMediaType === "video"
      || detectIsVideo(card.mediaUrl)
      || userRequestsVideo;

    // ── Always fetch the LinkedIn post from Lucas for the same day/run ──────
    // Diana's card.content is a visual prompt (or "infographic"), NOT the post text.
    // We need the real post content to keep thematic context on every regeneration.
    let linkedinPostContent: string | null = null;
    if (card.runId && card.dayOfWeek) {
      const linkedinCard = await prisma.campaignCard.findFirst({
        where: {
          runId: card.runId,
          dayOfWeek: card.dayOfWeek,
          agentId: "lucas-linkedin",
          cardType: "post_linkedin",
        },
        select: { content: true },
      });
      linkedinPostContent = linkedinCard?.content ?? null;
    }
    // Fallback chain: Lucas post → linked Post record → existing prompt
    const postThemeContent =
      linkedinPostContent ??
      card.post?.content ??
      (card.content && !card.content.startsWith("AVISO:") && card.content !== "infographic"
        ? card.content
        : null);

    // Generate the image/video/infographic
    let newSlideUrl: string | null = null;
    let mediaError: string | null = null;
    let updatedPrompt = "";

    // ── Infographic: regenerate using post content (+ user style hint) ───────
    if (isInfographic) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        mediaError = "GEMINI_API_KEY não configurada.";
      } else {
        try {
          if (!postThemeContent) {
            throw new Error("Conteúdo do post não encontrado. Não é possível gerar o infográfico sem o texto base.");
          }
          // CRITICAL: always anchor to the post content.
          // The user instruction is a STYLE hint only — never replaces the post content.
          const contextualContent = message
            ? `${postThemeContent}\n\n[INSTRUÇÃO DE ESTILO DO USUÁRIO — aplique ao design mas mantenha o conteúdo do post acima: ${message}]`
            : postThemeContent;

          // Derive platform from run config for correct aspect ratio
          const runConfig = card.run?.config as { singlePlatform?: string } | null;
          const infoPlatform =
            (runConfig?.singlePlatform as "linkedin" | "twitter" | "both" | undefined) ?? "both";

          newSlideUrl = await generateInfographic(
            contextualContent,
            card.project.niche ?? "business",
            apiKey,
            infoPlatform
          );
          updatedPrompt = "infographic";
        } catch (err) {
          mediaError = err instanceof Error ? err.message : "Erro ao gerar infográfico";
          console.error("[chat/infographic] generation failed:", err);
        }
      }
    } else {
      // ── Image/Video: refine prompt then regenerate ─────────────────────────
      const promptSystem = `You are a professional visual prompt engineer for AI image/video generation.
Project: ${card.project.name}
Niche: ${card.project.niche ?? "business"}
Style references: ${card.project.voice ?? "modern, professional"}
${postThemeContent ? `\nPost content this visual must illustrate:\n${postThemeContent.slice(0, 600)}` : ""}

Your job: Take the current visual prompt and improve/modify it based on the user instruction.
IMPORTANT: The visual must always stay thematically aligned with the post content above.
Output ONLY the improved prompt in English, detailed and descriptive.
Include: subject, composition, lighting, colors, mood, style.
No explanations, no prefixes — just the prompt text.`;

      const currentPrompt = card.content?.replace(/^AVISO:[\s\S]*?\n\nPrompt: /, "") ?? "";
      const slideContext = targetSlide !== null
        ? `\n\nThis is for SLIDE ${targetSlide + 1} of a ${existingSlides?.length ?? 3}-slide carousel. Keep visual consistency with the other slides.`
        : "";

      updatedPrompt = await askClaude(
        promptSystem,
        `Current prompt:\n${currentPrompt}${slideContext}\n\nUser instruction: ${message}${historyContext}`,
        { maxTokens: 4000 }
      );

      try {
        if (isVideo) {
          // Geração de vídeo por IA saiu em 18/08/2026. Vídeo agora vem da
          // gravação do próprio cliente, cortada e legendada pelo fluxo de
          // vídeo. Cards antigos marcados como vídeo caem para quadro estático.
          mediaError =
            "Vídeo gerado por IA foi descontinuado. O vídeo agora vem da sua " +
            "própria gravação, com cortes automáticos.";
        } else {
          newSlideUrl = await generateImage(updatedPrompt, isCarousel ? "1:1" : "linkedin-landscape");
        }
      } catch (err) {
        mediaError = err instanceof Error ? err.message : "Erro desconhecido na geração de mídia";
        console.error("[chat/media] generation failed:", err);
      }
    }

    // For carousel: replace only the targeted slide, keep the others
    let finalMediaUrl: string | null = null;
    if (newSlideUrl && isCarousel && targetSlide !== null && existingSlides) {
      const updated = [...existingSlides];
      updated[targetSlide] = newSlideUrl;
      finalMediaUrl = updated.join("|");
    } else if (newSlideUrl) {
      finalMediaUrl = newSlideUrl;
    }

    const slideLabel = targetSlide !== null ? ` (slide ${targetSlide + 1})` : "";
    const mediaLabel = isInfographic ? "Infográfico" : isVideo ? "Vídeo" : "Imagem";
    const assistantMsg = finalMediaUrl
      ? `${mediaLabel}${slideLabel} gerado com sucesso!${isInfographic ? "" : ` Prompt: ${updatedPrompt.slice(0, 100)}...`}`
      : `${mediaError ? `Erro: ${mediaError.slice(0, 200)}` : "Prompt atualizado."}`;

    const newHistory = [
      ...chatHistory,
      { role: "user" as const, content: message, timestamp: new Date().toISOString() },
      { role: "assistant" as const, content: assistantMsg, timestamp: new Date().toISOString() },
    ];

    const newContent = mediaError && !finalMediaUrl
      ? `AVISO: ${mediaError}\n\nPrompt: ${updatedPrompt}`
      : updatedPrompt;

    await prisma.campaignCard.update({
      where: { id },
      data: {
        content: newContent,
        ...(finalMediaUrl !== null ? { mediaUrl: finalMediaUrl } : {}),
        chatHistory: newHistory,
      },
    });

    // Sync the updated media to all Posts for this run+day so Paulo always shows the latest version.
    // Diana's card usually has no postId, so we query Posts by runId + dayOfWeek instead.
    if (finalMediaUrl) {
      if (card.postId) {
        // Direct link — fast path
        await prisma.post.update({
          where: { id: card.postId },
          data: { imageUrl: finalMediaUrl, imagePrompt: updatedPrompt },
        }).catch(() => {});
      } else if (card.runId && card.dayOfWeek) {
        // No direct postId on Diana's card — update all posts of this run+day
        await prisma.post.updateMany({
          where: { runId: card.runId, dayOfWeek: card.dayOfWeek },
          data: { imageUrl: finalMediaUrl, imagePrompt: updatedPrompt },
        }).catch(() => {});
      }
    }

    return NextResponse.json({
      updatedContent: newContent,
      updatedMediaUrl: finalMediaUrl,
      mediaError,
      chatHistory: newHistory,
    });
  }

  // ── Card de VÍDEO: o agente entende o pedido e EXECUTA ────────────────────
  //
  // Pedido do Bruno em 01/09: "quero que o usuário interaja com os agentes
  // pedindo ajustes". Aqui o Vitor decide se o pedido é de TEMPO (recomeçar
  // depois, terminar antes: re-corte no worker), de CAPA (refeita com a
  // instrução) ou de TEXTO (segue o caminho de edição que já existia).
  const metaVideo = card.metadata as { videoJobId?: string; trechoIndice?: number } | null;
  if (
    card.cardType === "video_clip" &&
    metaVideo?.videoJobId &&
    typeof metaVideo.trechoIndice === "number"
  ) {
    const bruto = await askClaude(
      `Você classifica o pedido de um cliente sobre um CORTE DE VÍDEO.
Responda APENAS um JSON: {"acao":"tempo"|"capa"|"texto","inicioDelta":number,"fimDelta":number,"instrucao":string}
- "tempo": mudar onde o corte começa ou termina. inicioDelta/fimDelta em SEGUNDOS (positivo adia, negativo antecipa; ex.: "corta os 3 primeiros segundos" vira inicioDelta 3; "termina 2s antes" vira fimDelta -2). Sem número explícito, use 2.
- "capa": mudar a imagem de capa. Ponha o pedido resumido em "instrucao".
- "texto": qualquer outra coisa (legenda do post, título, tom).`,
      message,
      { maxTokens: 4000, effort: "low", usage: { operation: "video_ajuste", projectId: card.projectId } }
    );
    let plano: { acao?: string; inicioDelta?: number; fimDelta?: number; instrucao?: string } = {};
    try {
      plano = JSON.parse(bruto.replace(/^[^{]*/, "").replace(/[^}]*$/, ""));
    } catch {
      plano = {};
    }

    if (plano.acao === "tempo" || plano.acao === "capa") {
      let resposta: string;
      try {
        if (plano.acao === "tempo") {
          const novo = await refazerCorte(metaVideo.videoJobId, userId, metaVideo.trechoIndice, {
            inicioDelta: plano.inicioDelta ?? 0,
            fimDelta: plano.fimDelta ?? 0,
          });
          resposta =
            `Feito: estou refazendo o corte começando em ${Math.floor(novo.inicio / 60)}:${String(Math.floor(novo.inicio % 60)).padStart(2, "0")} ` +
            `e terminando em ${Math.floor(novo.fim / 60)}:${String(Math.floor(novo.fim % 60)).padStart(2, "0")} da gravação. ` +
            `Fica pronto em uns 2 minutos; recarregue o card para assistir.`;
        } else {
          await refazerCapa(metaVideo.videoJobId, userId, metaVideo.trechoIndice, plano.instrucao ?? message);
          resposta = "Capa refeita com o seu ajuste. Recarregue o card para ver como ficou.";
        }
      } catch (e) {
        resposta = e instanceof Error ? e.message : "Não consegui fazer esse ajuste agora.";
      }
      const historicoNovo = [
        ...chatHistory,
        { role: "user" as const, content: message, timestamp: new Date().toISOString() },
        { role: "assistant" as const, content: resposta, timestamp: new Date().toISOString() },
      ];
      await prisma.campaignCard.update({
        where: { id },
        data: { chatHistory: historicoNovo },
      });
      return NextResponse.json({ updatedContent: card.content, chatHistory: historicoNovo });
    }
    // "texto" cai no caminho de edição logo abaixo.
  }

  // ── Text/post card: edit content ──────────────────────────────────────────
  const system = `Você é um assistente de edição de conteúdo para redes sociais.
Projeto: ${card.project.name}
Plataforma: ${card.cardType === "post_linkedin" ? "LinkedIn" : card.cardType === "post_twitter" ? "X (Twitter)" : card.cardType}
Tom de voz: ${card.project.voice ?? "profissional"}
Nicho: ${card.project.niche ?? "geral"}
${preferences ? `\nPreferências do usuário:\n${preferences}` : ""}

Seu trabalho: Editar e melhorar o texto conforme a instrução do usuário.
Retorne APENAS o texto revisado, sem explicações, sem prefixos.
Mantenha o comprimento adequado para a plataforma.
Responda em português com acentuação correta.

REGRA DE OURO: Nunca invente dados, estatísticas ou referências. Use apenas fatos reais com fonte.`;

  const userPrompt = `Texto atual:\n\n${card.content ?? ""}\n\nInstrução: ${message}${historyContext}`;
  const updatedContent = await askClaude(system, userPrompt, { maxTokens: 6000 });

  const newHistory = [
    ...chatHistory,
    { role: "user" as const, content: message, timestamp: new Date().toISOString() },
    { role: "assistant" as const, content: updatedContent, timestamp: new Date().toISOString() },
  ];

  await prisma.campaignCard.update({
    where: { id },
    data: { content: updatedContent, chatHistory: newHistory },
  });

  if (card.postId && (card.cardType === "post_linkedin" || card.cardType === "post_twitter" || card.cardType === "video_clip")) {
    await prisma.post.update({
      where: { id: card.postId },
      data: { content: updatedContent },
    }).catch(() => {});
  }

  // Save to ProjectMemory
  const preferenceKey = `feedback_${card.cardType}_${Date.now()}`;
  await prisma.projectMemory.upsert({
    where: { projectId_type_key: { projectId: card.projectId, type: "preference", key: preferenceKey } },
    create: {
      projectId: card.projectId,
      type: "preference",
      key: preferenceKey,
      value: { instruction: message, cardType: card.cardType, dayOfWeek: card.dayOfWeek },
      metadata: { learnedAt: new Date().toISOString() },
    },
    update: {
      value: { instruction: message, cardType: card.cardType, dayOfWeek: card.dayOfWeek },
    },
  });

  return NextResponse.json({ updatedContent, chatHistory: newHistory });
}
