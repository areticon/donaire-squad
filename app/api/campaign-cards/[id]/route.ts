import { auth } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { content, status, valeParaODia } = (await req.json()) as {
    content?: string;
    status?: string;
    /**
     * Aplica o status a TODOS os cards do mesmo dia da mesma execução (21/09).
     *
     * Um dia tem sete ou oito cards (pesquisa, mídia, cada redator, revisão,
     * publicação), e o mini-card do calendário lê o do publicador ou o do
     * redator, não o que estava aberto. Marcar só o aberto deixava o
     * calendário dizendo "aguardando aprovação" sobre um dia reprovado, que é
     * a metade do defeito que o Bruno relatou.
     */
    valeParaODia?: boolean;
  };

  const card = await prisma.campaignCard.findUnique({
    where: { id },
    include: { project: { select: { userId: true } } },
  });

  if (!card || !(await podeUsarProjeto(userId, { id: card.projectId, userId: card.project.userId }))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  /**
   * `status` entrou em 18/09. O card já virava "approved" quando a pessoa
   * agendava o dia, mas **só no estado da tela**: nada era gravado, e ao
   * recarregar ele voltava a dizer "Aguardando aprovação" com os posts já
   * agendados. O Bruno viu isso: "deixei esse agendado e não mostra que está
   * agendado no card".
   */
  const STATUS_VALIDOS = ["pending", "approved", "rejected", "needs_revision", "archived"];
  if (status !== undefined && !STATUS_VALIDOS.includes(status)) {
    return NextResponse.json({ error: "Status desconhecido." }, { status: 400 });
  }

  const updated = await prisma.campaignCard.update({
    where: { id },
    data: {
      ...(content !== undefined ? { content } : {}),
      ...(status !== undefined ? { status } : {}),
    },
  });

  // Os OUTROS cards do mesmo dia. Arquivado fica de fora: ele saiu do quadro
  // por decisão anterior, e ressuscitá-lo com o status novo seria trazer de
  // volta o que o cliente já tinha tirado da frente.
  let tambem = 0;
  if (valeParaODia && status !== undefined && card.runId && card.dayOfWeek) {
    const r = await prisma.campaignCard.updateMany({
      where: {
        runId: card.runId,
        dayOfWeek: card.dayOfWeek,
        id: { not: id },
        NOT: { status: "archived" },
      },
      data: { status },
    });
    tambem = r.count;
  }

  // Sync content to linked Post if applicable
  if (content !== undefined && card.postId && (card.cardType === "post_linkedin" || card.cardType === "post_twitter" || card.cardType === "video_clip")) {
    await prisma.post.update({
      where: { id: card.postId },
      data: { content },
    });
  }

  return NextResponse.json({ card: updated, tambem });
}
