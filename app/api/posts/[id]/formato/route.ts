import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { formatoValido, redeAceitaFormato, type FormatoDeDestino } from "@/lib/publish/formato-de-destino";
import { podeUsarProjeto } from "@/lib/equipe/conta";

/**
 * MAIS UM LUGAR NA MESMA REDE para uma peça que já existe (item 13, 29/09).
 *
 * O modelo da esteira desde 28/09 é UM POST POR LUGAR: quem marca feed, reel
 * e story no Instagram recebe três posts com o mesmo texto e a mesma mídia,
 * cada um com o seu `metadata.formato`, porque é assim que o publicador lê.
 * O card do dia passou a deixar marcar o lugar depois da campanha pronta, e
 * marcar um lugar novo é exatamente isso: mais um post irmão.
 *
 * NÃO COBRA, e é de propósito: não chama IA nenhuma. É o mesmo texto e a
 * mesma mídia com outro destino; cobrar aqui seria cobrar por um clique.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { formato, accountId } = (await req.json()) as { formato?: unknown; accountId?: unknown };

  const original = await prisma.post.findUnique({
    where: { id },
    include: { project: { select: { userId: true } } },
  });
  if (!original || !(await podeUsarProjeto(userId, { id: original.projectId, userId: original.project.userId }))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Lugar que a rede não tem é recusado aqui, e não convertido em feed: o
  // feed provavelmente já existe, e a conversão criaria uma duplicata calada.
  if (typeof formato !== "string" || !redeAceitaFormato(original.platform, formato as FormatoDeDestino)) {
    return NextResponse.json({ error: "Esta rede não tem esse lugar." }, { status: 400 });
  }
  const alvo = formatoValido(original.platform, formato);

  // OUTRA CONTA DA MESMA REDE (30/09): o dia saía só pela página e o Bruno não
  // conseguia marcar o perfil pessoal. O mesmo texto vai também pela conta
  // escolhida, sem IA e sem custo, como mais um post irmão.
  let conta = original.socialAccountId;
  if (typeof accountId === "string" && accountId !== original.socialAccountId) {
    const outra = await prisma.socialAccount.findFirst({
      where: { id: accountId, projectId: original.projectId, platform: original.platform },
      select: { id: true },
    });
    if (!outra) return NextResponse.json({ error: "Essa conta não é desta rede neste projeto." }, { status: 400 });
    conta = outra.id;
  }

  // O mesmo lugar não vale duas vezes para a mesma conta no mesmo dia.
  const irmaos = await prisma.post.findMany({
    where: {
      projectId: original.projectId,
      runId: original.runId,
      dayOfWeek: original.dayOfWeek,
      platform: original.platform,
      socialAccountId: conta,
      status: { notIn: ["cancelled", "rejected"] },
    },
    select: { id: true, metadata: true, scheduledAt: true, imageUrl: true, status: true },
  });
  const jaTem = irmaos.find((p) => formatoValido(original.platform, (p.metadata as { formato?: unknown } | null)?.formato) === alvo);

  const { error: _erroDoOriginal, ...metaLimpo } = (original.metadata as Record<string, unknown> | null) ?? {};
  void _erroDoOriginal;

  /**
   * O LUGAR NOVO A PARTIR DE UM POST JÁ PUBLICADO (03/10, o Instagram que
   * "falhou" para o Bruno no carrossel de sexta). Dois defeitos juntos:
   *   1. a mídia: o post publicado tem `imageUrl` limpo depois da publicação,
   *      e o irmão nascia sem as lâminas;
   *   2. a data: nascia com `scheduledAt` nulo, e post sem data não cai em dia
   *      nenhum do quadro nem na lista do card. O clique parecia não marcar, e
   *      cada clique novo criava mais um rascunho invisível.
   * Agora a mídia vem de um irmão do mesmo dia ou do card da Diana, e a data é
   * a do dia: o rascunho aparece no card, e aprovar leva para o próximo horário
   * livre, como qualquer rascunho vencido.
   */
  let imagem = original.imageUrl;
  if (!imagem) {
    const irmaoComMidia = await prisma.post.findFirst({
      where: { projectId: original.projectId, runId: original.runId, dayOfWeek: original.dayOfWeek, mediaType: original.mediaType, imageUrl: { not: null }, NOT: { imageUrl: "" } },
      orderBy: { createdAt: "desc" },
      select: { imageUrl: true },
    });
    imagem = irmaoComMidia?.imageUrl ?? null;
  }
  if (!imagem && original.runId && original.dayOfWeek != null) {
    const cardDaMidia = await prisma.campaignCard.findFirst({
      where: { runId: original.runId, dayOfWeek: original.dayOfWeek, cardType: "media", mediaUrl: { not: null }, NOT: { status: "archived" } },
      orderBy: { createdAt: "desc" },
      select: { mediaUrl: true },
    });
    imagem = cardDaMidia?.mediaUrl ?? null;
  }
  if (jaTem) {
    // O RASCUNHO INVISÍVEL de um clique anterior (sem data, sem mídia): é ele
    // que o cliente está pedindo de novo, então ganha a data e a mídia e
    // aparece, em vez de responder "já está marcado" sobre algo que a tela
    // não mostra.
    if (!jaTem.scheduledAt && original.scheduledAt && jaTem.status === "draft") {
      const consertado = await prisma.post.update({
        where: { id: jaTem.id },
        data: { scheduledAt: original.scheduledAt, ...(jaTem.imageUrl ? {} : { imageUrl: imagem }) },
        select: { id: true, platform: true },
      });
      return NextResponse.json({ post: consertado });
    }
    return NextResponse.json({ error: "Este lugar já está marcado.", postId: jaTem.id }, { status: 409 });
  }

  const novo = await prisma.post.create({
    data: {
      projectId: original.projectId,
      runId: original.runId,
      dayOfWeek: original.dayOfWeek,
      platform: original.platform,
      socialAccountId: conta,
      content: original.content,
      mediaType: original.mediaType,
      imageUrl: imagem,
      imagePrompt: original.imagePrompt,
      // Nasce rascunho no mesmo horário: quem aprova o dia aprova este junto,
      // e o erro do irmão (se houver) não é erro deste.
      scheduledAt: original.scheduledAt,
      status: "draft",
      metadata: { ...metaLimpo, formato: alvo } as never,
    },
    select: { id: true, platform: true },
  });

  return NextResponse.json({ post: novo });
}
