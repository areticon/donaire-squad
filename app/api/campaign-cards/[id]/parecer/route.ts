export const dynamic = "force-dynamic";

import { auth } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { parecerDosCards } from "@/lib/squad/parecer-da-peca";
import { podeUsarProjeto } from "@/lib/equipe/conta";

/**
 * O parecer de UMA peça, para o card aberto.
 *
 * A ficha do agente já recebe o parecer junto com a lista de trabalhos; o
 * modal do card é aberto também pelo calendário e pelo kanban, que não
 * carregam nada disso. Então o modal pergunta aqui, e as duas telas leem do
 * mesmo `parecerDosCards`: um leitor só, uma história só.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const card = await prisma.campaignCard.findUnique({
    where: { id },
    select: {
      id: true,
      runId: true,
      projectId: true,
      dayOfWeek: true,
      cardType: true,
      status: true,
      mediaType: true,
      mediaUrl: true,
      project: { select: { userId: true } },
    },
  });
  if (!card || !(await podeUsarProjeto(userId, { id: card.projectId, userId: card.project.userId }))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parecer = (await parecerDosCards(card.projectId, [card])).get(card.id);
  return NextResponse.json(parecer ?? { veredito: null, etapas: [], videoUrl: null });
}
