// O pedido composto roda depois da resposta (`after`), e o carrossel de 3
// lâminas com conferência passa de 3 minutos: o teto é o das rotas de vídeo.
export const maxDuration = 800;

import { auth } from "@/lib/auth/server";
import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";
import { generateImage } from "@/lib/media/nano-banana";
import { escolherEstilo, paletaDoProjeto } from "@/lib/media/direcao-de-arte";
import { extrairConteudoDoInfografico, desenharInfografico } from "@/lib/media/infographic";
import { produzirArtePorRede } from "@/lib/media/arte-por-rede";
import { desenharComFraseEmCodigo, marcaDaArte, promptDaArteSemTexto } from "@/lib/media/arte-com-frase";
import { mancheteDaPeca } from "@/lib/media/peca-de-feed";
import { ajustarVideoPeloChat } from "@/lib/media/ajuste-pelo-chat";
import { pecaPublicavel } from "@/lib/pipeline/guarda-de-texto";
import { extrairNaoCitar, salvarNaoCitar, aplicarNaoCitarNaExecucao } from "@/lib/pipeline/restricoes";
import { marcarEmRevisao, encerrarRevisao } from "@/lib/pipeline/revisao-do-card";
import { ehPedidoDeRefazerVideo, regerarVideoDoDia } from "@/lib/media/regerar-video";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { abrirPedido, estadoDoPedido, executarPedido } from "@/lib/media/pedido-do-card";

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

/**
 * O CARD FICA "EM REVISÃO" ENQUANTO O PEDIDO ESTÁ SENDO FEITO.
 *
 * Pedido do Bruno em 21/09: refazer uma arte leva até 90 s e reescrever os
 * quatro posts do dia leva mais, e nesse tempo a tela ficava idêntica. Quem
 * pediu não sabia se o comando tinha sido entendido. A marca vive no CARD
 * (lib/pipeline/revisao-do-card.ts), porque o calendário inteiro lê do banco
 * e porque quem faz o trabalho pode ser outro card: o pedido de imagem feito
 * no card do Paulo é atendido no card da Diana.
 *
 * O `finally` aqui é o que garante que a marca sai mesmo quando o pedido
 * falha. Se nem o `finally` rodar (a plataforma matou a função), a marca tem
 * prazo e deixa de ser lida sozinha.
 */
/**
 * O ANDAMENTO DO PEDIDO (05/10): o chat gravado e as etapas da tarefa. A tela
 * consulta enquanto o pedido está sendo feito, e ao reabrir o modal.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const card = await prisma.campaignCard.findUnique({ where: { id }, select: { projectId: true, project: { select: { userId: true } } } });
  if (!card || !(await podeUsarProjeto(userId, { id: card.projectId, userId: card.project.userId }))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(await estadoDoPedido(id));
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const emRevisao: string[] = [];
  try {
    return await tratarChatDoCard(req, ctx, emRevisao);
  } finally {
    if (emRevisao.length > 0) await encerrarRevisao(emRevisao);
  }
}

async function tratarChatDoCard(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  emRevisao: string[]
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { message, slideIndex } = await req.json();
  if (!message?.trim()) return NextResponse.json({ error: "message required" }, { status: 400 });

  const DADOS_DO_CARD = {
    project: { include: { memories: true, contexts: true } },
    post: true,
    run: { select: { config: true } },
  } as const;

  let card = await prisma.campaignCard.findUnique({ where: { id }, include: DADOS_DO_CARD });

  if (!card || !(await podeUsarProjeto(userId, { id: card.projectId, userId: card.project.userId }))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  /**
   * ENCAMINHAR O PEDIDO PARA QUEM FAZ.
   *
   * Em 18/09 o Bruno pediu, no chat do card do PAULO, "ajuste imagem, eu pedi
   * um chart não uma imagem realista, quero um design gráfico no estilo Vox".
   * O card do Paulo não tem imagem: o pedido caiu no ramo de edição de TEXTO,
   * e o modelo, mandado "editar o texto conforme a instrução", reescreveu o
   * conteúdo do card para **dizer** que a imagem tinha sido trocada.
   *
   * > Nada foi trocado, e a mentira ficou gravada no card.
   *
   * Um agente que afirma ter feito o que não fez é pior que um que recusa.
   * Num squad de verdade, o Paulo passaria o pedido para a Diana. É o que
   * acontece aqui: o pedido de imagem é atendido no card de mídia do mesmo
   * dia, e o card de onde ele saiu registra para onde foi.
   */
  /**
   * "NUNCA CITE X" É REGRA DO PROJETO, NÃO EDIÇÃO DE UM CARD.
   *
   * Em 21/09 o Bruno pediu no card do Paulo "nunca cite a Volt Robotics, são
   * nossos concorrentes", e o caminho de edição de texto reescreveu o card do
   * Paulo ("2 posts prontos para publicação"): nada mudou nos dezenove posts
   * que citavam a Volt. Uma restrição de concorrente vale para a campanha
   * inteira e para as próximas: fica salva no projeto e é aplicada agora em
   * todos os rascunhos da execução. Ver lib/pipeline/restricoes.ts.
   */
  const nomesProibidos = extrairNaoCitar(message);
  if (nomesProibidos.length > 0) {
    const todos = await salvarNaoCitar(card.projectId, nomesProibidos);
    const aplicado = card.runId ? await aplicarNaoCitarNaExecucao(card.runId, todos) : { posts: 0, cards: 0 };
    const resposta =
      `Regra salva para este projeto: nunca citar ${todos.join(", ")}. ` +
      (card.runId
        ? `Apliquei agora nos rascunhos desta campanha: ${aplicado.posts} post(s) reescrito(s) sem a menção (o dado que só tinha essa fonte saiu junto). ` +
          `Nas próximas campanhas a pesquisa já descarta essa fonte antes de escrever.`
        : "Vale a partir da próxima campanha.");
    const historico = [
      ...(Array.isArray(card.chatHistory) ? (card.chatHistory as { role: string; content: string; timestamp: string }[]) : []),
      { role: "user" as const, content: message, timestamp: new Date().toISOString() },
      { role: "assistant" as const, content: resposta, timestamp: new Date().toISOString() },
    ];
    await prisma.campaignCard.update({ where: { id }, data: { chatHistory: historico } });
    return NextResponse.json({ updatedContent: card.content, chatHistory: historico, regraSalva: todos, aplicado });
  }

  /**
   * "GERE O VÍDEO DE NOVO" REFAZ O VÍDEO, em qualquer card do dia (28/09).
   *
   * O Bruno pediu no chat do Paulo "o vídeo falhou, gere novamente por favor".
   * O pedido caiu na edição de TEXTO, os seis posts foram reescritos, a
   * resposta foi "apliquei", e nenhum vídeo foi pedido. Agora o pedido volta
   * para a fila de vídeo com cobrança nova, e a resposta diz o custo e o tempo.
   */
  // O card de um vídeo GRAVADO (corte ou completo) nunca cai aqui: "faça outra
  // ideia para a cena do vídeo" casava com a regra e pedia um vídeo novo ao
  // gerador (Veo), com cobrança. O ajuste dele é o Vitor, lá embaixo (30/09).
  const doVideoGravado = Boolean((card.metadata as { videoJobId?: string } | null)?.videoJobId);
  if (!doVideoGravado && ehPedidoDeRefazerVideo(message) && card.runId && card.dayOfWeek) {
    const r = await regerarVideoDoDia({ runId: card.runId, dayOfWeek: card.dayOfWeek, userId });
    const resposta = r.ok
      ? `Pedi o vídeo de novo para a Diana: ${r.segundos}s na qualidade ${r.qualidade === "cheio" ? "Cheia" : "Rápida"}, ${r.custo} créditos de vídeo. ` +
        (r.geracoes > 1
          ? `São ${r.geracoes} trechos encadeados, cada um leva de 1 a 5 minutos. `
          : "Leva de 1 a 5 minutos. ") +
        "O card do dia mostra o andamento, e o vídeo entra nos posts sozinho quando ficar pronto. Se o gerador do Google falhar, eu tento de novo em 1, 2, 3 e 5 minutos e aviso aqui."
      : r.motivo;
    const historico = [
      ...(Array.isArray(card.chatHistory) ? (card.chatHistory as { role: string; content: string; timestamp: string }[]) : []),
      { role: "user" as const, content: message, timestamp: new Date().toISOString() },
      { role: "assistant" as const, content: resposta, timestamp: new Date().toISOString() },
    ];
    await prisma.campaignCard.update({ where: { id }, data: { chatHistory: historico } });
    return NextResponse.json({ updatedContent: card.content, chatHistory: historico, videoRefeito: r.ok });
  }

  /**
   * O PEDIDO DE UM DIA DA CAMPANHA VIRA TAREFA NO SERVIDOR (05/10).
   *
   * Texto, arte, data e rede, tudo que o pedido tiver, feito por
   * lib/media/pedido-do-card.ts depois da resposta. A mensagem entra no chat na
   * hora, as etapas ficam gravadas no card, e o resultado aparece neste card.
   * Card de vídeo gravado (o Vitor, abaixo) e card sem dia seguem o caminho
   * de antes.
   */
  const TIPOS_DO_DIA = ["publish", "media", "post_linkedin", "post_twitter"];
  if (!doVideoGravado && card.runId && card.dayOfWeek && TIPOS_DO_DIA.includes(card.cardType) && card.mediaType !== "video") {
    const aberto = await abrirPedido({ cardId: card.id, mensagem: message.trim(), agenteNome: card.agentName });
    if (aberto.jaFazendo) {
      return NextResponse.json({
        jaFazendo: true,
        pedido: aberto.pedido,
        aviso: "Ainda estou fazendo o pedido anterior. Assim que terminar, eu respondo aqui; se quiser mudar mais alguma coisa, mande depois.",
      });
    }
    const daDiana = await prisma.campaignCard.findFirst({
      where: { runId: card.runId, dayOfWeek: card.dayOfWeek, cardType: "media", NOT: { status: "archived" } },
      select: { id: true },
    });
    const quem = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, image: true } });
    await marcarEmRevisao({
      cardIds: [card.id, ...(daDiana ? [daDiana.id] : [])],
      pedido: message.trim(),
      porNome: quem?.name ?? null,
      porImagem: quem?.image ?? null,
      agenteId: card.agentId,
      agenteNome: card.agentName,
    });
    const tarefa = { cardId: card.id, userId, mensagem: message.trim(), slideIndex: typeof slideIndex === "number" ? slideIndex : null };
    after(() => executarPedido(tarefa));
    return NextResponse.json({ emAndamento: true, pedido: aberto.pedido, chatHistory: aberto.chatHistory }, { status: 202 });
  }

  const PEDIDO_DE_MIDIA =
    /\b(imagem|foto|arte|gr[aá]fic|chart|infogr[aá]fic|capa|ilustra|visual|design|est[ií]lo|cor(es)?|layout|thumb)/i;
  const cardDeOrigem = card;
  let encaminhadoDe: string | null = null;

  if (
    PEDIDO_DE_MIDIA.test(message) &&
    card.cardType !== "media" &&
    card.cardType !== "video_clip" &&
    !card.mediaUrl &&
    card.runId &&
    card.dayOfWeek
  ) {
    const daDiana = await prisma.campaignCard.findFirst({
      where: {
        runId: card.runId,
        dayOfWeek: card.dayOfWeek,
        cardType: "media",
        NOT: { status: "archived" },
      },
      include: DADOS_DO_CARD,
      orderBy: { createdAt: "desc" },
    });
    if (daDiana) {
      encaminhadoDe = card.agentName;
      card = daDiana;
    }
  }

  // Daqui em diante existe trabalho de verdade: o card de onde veio o pedido e
  // o de quem vai fazê-lo entram em revisão, com o avatar de quem pediu.
  const quemPediu = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, image: true } });
  emRevisao.push(cardDeOrigem.id, card.id);
  await marcarEmRevisao({
    cardIds: emRevisao,
    pedido: message.trim(),
    porNome: quemPediu?.name ?? null,
    porImagem: quemPediu?.image ?? null,
    agenteId: card.agentId,
    agenteNome: card.agentName,
  });

  const chatHistory = Array.isArray(card.chatHistory)
    ? (card.chatHistory as { role: string; content: string; timestamp: string }[])
    : [];

  // Build memory context (preferences learned over time)
  /**
   * Os documentos do projeto, a mesma regra da esteira: só o que foi LIDO de
   * verdade entra. Até 18/09 o chat da peça só via as preferências aprendidas
   * e nunca o material da marca, então uma peça refeita pelo chat saía sem o
   * contexto que a peça original teve.
   */
  const contextoDoProjeto = card.project.contexts
    .filter((c) => c.status === "pronto" && c.compiled.trim().length > 0)
    .map((c) => `## ${c.title}\n${c.compiled}`)
    .join("\n\n");

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
    /**
     * A ARTE REFEITA, UMA POR REDE.
     *
     * Este caminho tinha o mesmo defeito da esteira e um agravante: no fim dele
     * um `updateMany` gravava a MESMA url em todos os posts do dia. Ou seja,
     * refazer a arte de um card desfazia o formato por rede que a esteira tinha
     * acabado de acertar.
     */
    let arteRefeitaPorRede: Record<string, string> | null = null;

    /** As redes que este dia publica, para saber quantos formatos refazer. */
    const redesDoDia = card.runId && card.dayOfWeek
      ? Array.from(
          new Set(
            (
              await prisma.post.findMany({
                where: { runId: card.runId, dayOfWeek: card.dayOfWeek },
                select: { platform: true },
              })
            ).map((p) => p.platform)
          )
        )
      : [];

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
            ? `${postThemeContent}\n\n[INSTRUÇÃO DE ESTILO DO USUÁRIO, aplique ao design mas mantenha o conteúdo do post acima: ${message}]`
            : postThemeContent;

          const runConfig = card.run?.config as { singlePlatform?: string; mediaStyle?: string } | null;

          // A mesma direcao de arte da esteira (estilo alternando, cores da
          // marca), senao o "regenerar" devolveria o infografico generico que
          // o Bruno reprovou em 14/09. E o estilo ESCOLHIDO na campanha manda,
          // igual na esteira (18/09).
          const estilo = await escolherEstilo({
            projectId: card.projectId,
            runId: card.runId,
            dayOfWeek: card.dayOfWeek,
            infografico: true,
            preferido: runConfig?.mediaStyle,
          });
          const conteudo = await extrairConteudoDoInfografico(
            contextualContent,
            card.project.niche ?? "business",
            apiKey,
            {
              funil: (card.run?.config as { funnelStage?: "tofu" | "mofu" | "bofu" } | null)?.funnelStage,
              marca: contextoDoProjeto,
            }
          );
          const arte = await produzirArtePorRede({
            redes: redesDoDia,
            contentType: "infographic",
            promptBase: "",
            textoDoPost: postThemeContent ?? undefined,
            projectId: card.projectId,
            runId: card.runId ?? undefined,
            desenhar: async (_p, proporcao) => {
              const url = await desenharInfografico(conteudo, apiKey, proporcao, {
                estilo: estilo.prompt,
                paleta: paletaDoProjeto(card.project.colorPalette),
                // Montado em código desde 30/09, com a família e as cores da marca.
                marca: await marcaDaArte(card.projectId),
              });
              if (!url) throw new Error("o modelo não devolveu o infográfico");
              return url;
            },
          });
          newSlideUrl = arte.principal ?? null;
          arteRefeitaPorRede = arte.porRede;
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
No explanations, no prefixes, just the prompt text.`;

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
          // A frase antiga dizia "vídeo por IA foi descontinuado", e ficou
          // velha quando o Veo voltou em 19/09. Refazer o vídeo é o desvio
          // lá em cima (`regerarVideoDoDia`); aqui só chega pedido sem dia.
          mediaError =
            "Para refazer o vídeo, peça no chat de um card do dia, por exemplo: gere o vídeo de novo.";
        } else {
          /**
           * TEXTO EM ARTE É CÓDIGO também no refazer pelo chat (30/09). A
           * frase é a que a peça já tinha (a da imagem do dia ou a da lâmina);
           * sem ela gravada, uma manchete nova sai do texto do post. O modelo
           * desenha só a cena pedida, sem letra e sem gente.
           */
          const meta = (card.metadata as { frase?: string; slides?: string[] } | null) ?? {};
          const marca = await marcaDaArte(card.projectId);
          const frase =
            (targetSlide !== null ? meta.slides?.[targetSlide] : meta.frase) ??
            (await mancheteDaPeca({
              textoDoPost: postThemeContent ?? updatedPrompt,
              estiloVisual: updatedPrompt,
              nicho: card.project.niche,
              projectId: card.projectId,
              runId: card.runId ?? undefined,
            })).manchete;
          const arte = await produzirArtePorRede({
            redes: redesDoDia,
            contentType: isCarousel ? "carousel" : "image",
            promptBase: promptDaArteSemTexto({ visual: updatedPrompt, marca }),
            textoEsperado: [frase],
            textoDoPost: postThemeContent ?? undefined,
            projectId: card.projectId,
            runId: card.runId ?? undefined,
            desenhar: desenharComFraseEmCodigo(frase, marca, (prompt, proporcao) => generateImage(prompt, proporcao, "hd")),
          });
          newSlideUrl = arte.principal ?? null;
          arteRefeitaPorRede = arte.porRede;
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

    // Resposta de conversa (05/10): o que foi feito e onde ver, sem prompt e
    // sem termo técnico. Antes saía "Imagem gerado com sucesso! Prompt: 3-slide
    // carousel design..." para o cliente.
    const oQue = isInfographic ? "o infográfico" : targetSlide !== null ? `a lâmina ${targetSlide + 1}` : "a arte";
    const assistantMsg = finalMediaUrl
      ? `Pronto, refiz ${oQue} como você pediu. Já está aqui no card; se quiser outro ajuste, é só me dizer.`
      : isVideo && mediaError
        ? mediaError
        : `Não consegui refazer ${oQue} desta vez, e ficou ${isInfographic ? "o que estava" : "a que estava"}. Pode pedir de novo daqui a pouco.`;

    const newHistory = [
      ...chatHistory,
      { role: "user" as const, content: message, timestamp: new Date().toISOString() },
      { role: "assistant" as const, content: assistantMsg, timestamp: new Date().toISOString() },
    ];

    const newContent = mediaError && !finalMediaUrl
      ? `AVISO: ${mediaError}\n\nPrompt: ${updatedPrompt}`
      : updatedPrompt;

    // O card que FEZ o trabalho (05/10): com `id`, a arte e o prompt iam para
    // o card de onde o pedido saiu, que no caso do dono era o do Paulo.
    await prisma.campaignCard.update({
      where: { id: card.id },
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
        // No direct postId on Diana's card — update all posts of this run+day.
        //
        // UMA CHAMADA POR REDE quando a arte foi refeita em vários formatos:
        // um `updateMany` só, com a mesma url, é exatamente o que fazia toda
        // rede receber a mesma imagem (card 509).
        if (arteRefeitaPorRede) {
          for (const [platform, url] of Object.entries(arteRefeitaPorRede)) {
            await prisma.post.updateMany({
              where: { runId: card.runId, dayOfWeek: card.dayOfWeek, platform },
              data: { imageUrl: url, imagePrompt: updatedPrompt },
            }).catch(() => {});
          }
          // Rede que não estava no mapa (caso raro: post criado depois) fica
          // com a arte principal, que é melhor que ficar com a antiga.
          await prisma.post.updateMany({
            where: {
              runId: card.runId,
              dayOfWeek: card.dayOfWeek,
              platform: { notIn: Object.keys(arteRefeitaPorRede) },
            },
            data: { imageUrl: finalMediaUrl, imagePrompt: updatedPrompt },
          }).catch(() => {});
        } else {
          await prisma.post.updateMany({
            where: { runId: card.runId, dayOfWeek: card.dayOfWeek },
            data: { imageUrl: finalMediaUrl, imagePrompt: updatedPrompt },
          }).catch(() => {});
        }
      }
    }

    // O card de onde o pedido saiu fica sabendo para onde ele foi. Sem esta
    // linha, a pessoa pede no card do Paulo, a arte muda no card da Diana, e
    // a tela onde ela pediu não conta nada.
    if (encaminhadoDe) {
      const naOrigem = Array.isArray(cardDeOrigem.chatHistory)
        ? (cardDeOrigem.chatHistory as { role: string; content: string; timestamp: string }[])
        : [];
      await prisma.campaignCard.update({
        where: { id: cardDeOrigem.id },
        data: {
          chatHistory: [
            ...naOrigem,
            { role: "user" as const, content: message, timestamp: new Date().toISOString() },
            {
              role: "assistant" as const,
              content: mediaError
                ? "Passei o seu pedido para a Diana, que cuida das imagens, e a arte não saiu desta vez; ficou a que estava. Pode pedir de novo daqui a pouco."
                : "Pronto, a Diana refez a arte deste dia como você pediu, e ela já aparece nos posts deste card.",
              timestamp: new Date().toISOString(),
            },
          ],
        },
      }).catch(() => {});
    }

    return NextResponse.json({
      updatedContent: newContent,
      updatedMediaUrl: finalMediaUrl,
      mediaError,
      chatHistory: newHistory,
      encaminhadoPara: encaminhadoDe ? card.agentName : undefined,
    });
  }

  // ── Card de VÍDEO: o Vitor entende o pedido e EXECUTA ────────────────────
  //
  // Pedido do Bruno em 01/09: "quero que o usuário interaja com os agentes
  // pedindo ajustes"; e em 30/09: o cliente ajusta o vídeo PELO CHAT DO CARD,
  // "porque é essa a forma que o usuário vai fazer". Corte e completo: início
  // e fim por palavra ou segundo, trecho do meio, cenas e efeitos, capa. Quem
  // entende e faz é lib/media/ajuste-pelo-chat.ts; pedido sobre o TEXTO do
  // post segue o caminho de edição logo abaixo.
  const metaVideo = card.metadata as { videoJobId?: string } | null;
  if (card.cardType === "video_clip" && metaVideo?.videoJobId) {
    const r = await ajustarVideoPeloChat({ card, userId, mensagem: message });
    if (r.tratado) {
      const historicoNovo = [
        ...chatHistory,
        { role: "user" as const, content: message, timestamp: new Date().toISOString() },
        { role: "assistant" as const, content: r.resposta, timestamp: new Date().toISOString() },
      ];
      const salvo = await prisma.campaignCard.update({
        where: { id },
        data: { chatHistory: historicoNovo },
        select: { metadata: true },
      });
      // O metadata volta junto: o card passa a mostrar "o squad está fazendo"
      // (ou o pedido esperando o sim) sem esperar a próxima leitura do quadro.
      // Sem a marca de revisão deste pedido, que o `finally` tira em seguida.
      const { revisao: _revisao, ...metadataNovo } = (salvo.metadata as Record<string, unknown> | null) ?? {};
      return NextResponse.json({
        updatedContent: card.content,
        chatHistory: historicoNovo,
        updatedMetadata: metadataNovo,
        refazendoCorte: r.refazendoCorte ?? false,
        aviso: r.aviso,
      });
    }
  }

  /**
   * PEDIDO DE IMAGEM NUM CARD QUE NÃO TEM IMAGEM, e sem ninguém para quem
   * encaminhar (o dia não tem peça de mídia).
   *
   * Aqui a resposta é "não dá", e o conteúdo do card NÃO é tocado. O caminho
   * de edição de texto abaixo reescreveria o card para dizer que a imagem
   * mudou, que é exatamente o defeito de 18/09.
   */
  if (PEDIDO_DE_MIDIA.test(message) && !card.mediaUrl && card.cardType !== "media") {
    const resposta =
      "Este card não tem imagem, e não achei peça de mídia neste dia para ajustar. " +
      "Se a campanha do dia é só texto, o jeito de mudar a arte é gerar uma peça com imagem. " +
      "Se você queria ajustar o TEXTO, me diga o que mudar nele.";
    const historico = [
      ...chatHistory,
      { role: "user" as const, content: message, timestamp: new Date().toISOString() },
      { role: "assistant" as const, content: resposta, timestamp: new Date().toISOString() },
    ];
    await prisma.campaignCard.update({ where: { id: card.id }, data: { chatHistory: historico } });
    return NextResponse.json({ updatedContent: card.content, chatHistory: historico });
  }

  /**
   * O CARD DO PAULO NÃO TEM TEXTO PARA EDITAR: ele lista os posts do dia.
   *
   * Uma instrução de texto pedida ali vale para TODOS os posts do dia, cada
   * um reescrito na sua rede, e o card do Paulo registra o que foi feito. Até
   * 21/09 o caminho abaixo editava a frase "2 post(s) prontos para
   * publicação" e devolvia isso como se fosse o ajuste.
   */
  if (card.cardType === "publish" && card.runId && card.dayOfWeek) {
    const postsDoDia = await prisma.post.findMany({
      where: { runId: card.runId, dayOfWeek: card.dayOfWeek, status: { notIn: ["published", "publishing"] } },
      select: { id: true, platform: true, content: true },
    });
    const porTexto = new Map<string, string>();
    let alterados = 0;
    for (const p of postsDoDia) {
      const chave = `${p.platform}\n${p.content}`;
      let novo = porTexto.get(chave);
      if (!novo) {
        const bruto = await askClaude(
          `Você edita um post de ${p.platform} do projeto "${card.project.name}". Tom: ${card.project.voice ?? "profissional"}.
Devolva APENAS o texto final, sem comentários, sem prefixos, sem markdown. Mantenha o tamanho e as regras da rede.
REGRA DE OURO: nunca invente dados, estatísticas ou referências.${preferences ? `\nPreferências do usuário:\n${preferences}` : ""}`,
          `Texto atual:\n\n${p.content}\n\nInstrução: ${message}`,
          { maxTokens: 6000, usage: { operation: "ajuste_do_dia", projectId: card.projectId, runId: card.runId } }
        );
        const peca = pecaPublicavel(bruto);
        novo = "recusado" in peca ? p.content : peca.texto;
        porTexto.set(chave, novo);
      }
      if (novo !== p.content) {
        await prisma.post.update({ where: { id: p.id }, data: { content: novo } });
        const plataformaDoCard = p.platform === "twitter" ? "post_twitter" : "post_linkedin";
        await prisma.campaignCard.updateMany({ where: { runId: card.runId, dayOfWeek: card.dayOfWeek, cardType: plataformaDoCard, content: p.content }, data: { content: novo } }).catch(() => {});
        alterados++;
      }
    }
    const resposta = alterados
      ? `Pronto, mudei o texto ${alterados === 1 ? "do post" : `dos ${alterados} posts`} deste dia. Ele já aparece aqui no card.`
      : "Li o texto de novo e nada mudou com esse pedido. Me diga com outras palavras o que quer trocar.";
    const historico = [
      ...chatHistory,
      { role: "user" as const, content: message, timestamp: new Date().toISOString() },
      { role: "assistant" as const, content: resposta, timestamp: new Date().toISOString() },
    ];
    await prisma.campaignCard.update({ where: { id }, data: { chatHistory: historico } });
    return NextResponse.json({ updatedContent: card.content, chatHistory: historico, alterados });
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
  const bruto = await askClaude(system, userPrompt, { maxTokens: 6000 });

  /**
   * A mesma guarda da esteira, aqui também.
   *
   * Este caminho grava direto no card e no post. Se o modelo devolver um
   * parecer, um checklist ou o próprio pedido de volta (foi o que aconteceu
   * em 18/09, por outro caminho), isso viraria a peça publicada.
   */
  const peca = pecaPublicavel(bruto);
  if ("recusado" in peca) {
    const recusa = "Não consegui aplicar esse ajuste no texto desta vez, e ele ficou como estava. Pode me pedir de novo com outras palavras?";
    const historico = [
      ...chatHistory,
      { role: "user" as const, content: message, timestamp: new Date().toISOString() },
      { role: "assistant" as const, content: recusa, timestamp: new Date().toISOString() },
    ];
    await prisma.campaignCard.update({ where: { id: card.id }, data: { chatHistory: historico } });
    return NextResponse.json({ updatedContent: card.content, chatHistory: historico });
  }
  const updatedContent = peca.texto;

  const newHistory = [
    ...chatHistory,
    { role: "user" as const, content: message, timestamp: new Date().toISOString() },
    // A resposta é conversa, não o texto inteiro repetido (05/10).
    { role: "assistant" as const, content: "Pronto, mudei o texto como você pediu. A versão nova já está aqui no card.", timestamp: new Date().toISOString() },
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
