import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";
import { generateImage } from "@/lib/media/nano-banana";
import { generateVideo, VeoUnavailableError } from "@/lib/media/veo3";
import { generateInfographic } from "@/lib/media/infographic";

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
        { maxTokens: 600 }
      );

      try {
        if (isVideo) {
          newSlideUrl = await generateVideo(updatedPrompt, "9:16", "720p", 150_000);
        } else {
          newSlideUrl = await generateImage(updatedPrompt, isCarousel ? "1:1" : "linkedin-landscape");
        }
      } catch (err) {
        if (err instanceof VeoUnavailableError) {
          mediaError = `Vídeo não disponível: ${err.message}. Verifique se o bucket GCS está configurado e se o Vertex AI API está habilitado.`;
        } else {
          mediaError = err instanceof Error ? err.message : "Erro desconhecido na geração de mídia";
        }
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
  const updatedContent = await askClaude(system, userPrompt, { maxTokens: 1500 });

  const newHistory = [
    ...chatHistory,
    { role: "user" as const, content: message, timestamp: new Date().toISOString() },
    { role: "assistant" as const, content: updatedContent, timestamp: new Date().toISOString() },
  ];

  await prisma.campaignCard.update({
    where: { id },
    data: { content: updatedContent, chatHistory: newHistory },
  });

  if (card.postId && (card.cardType === "post_linkedin" || card.cardType === "post_twitter")) {
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
