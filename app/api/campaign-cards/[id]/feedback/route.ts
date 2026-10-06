import { auth } from "@/lib/auth/server";
import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { registrarNota } from "@/lib/cerebro/captura";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { type, reason, cardType } = await req.json();

  const card = await prisma.campaignCard.findUnique({
    where: { id },
    include: { project: { select: { userId: true } } },
  });

  if (!card || !(await podeUsarProjeto(userId, { id: card.projectId, userId: card.project.userId }))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!reason?.trim()) return NextResponse.json({ ok: true }); // no reason = nothing to save

  // Save rejection feedback to ProjectMemory so future pipelines learn from it
  const key = `${type}_${cardType}_${Date.now()}`;
  await prisma.projectMemory.upsert({
    where: { projectId_type_key: { projectId: card.projectId, type: "rejection", key } },
    create: {
      projectId: card.projectId,
      type: "rejection",
      key,
      value: {
        reason,
        cardType,
        agentId: card.agentId,
        dayOfWeek: card.dayOfWeek,
        timestamp: new Date().toISOString(),
      },
      metadata: {
        source: "user_rejection",
        cardId: id,
        learnedAt: new Date().toISOString(),
      },
    },
    update: {
      value: { reason, cardType, agentId: card.agentId, dayOfWeek: card.dayOfWeek, timestamp: new Date().toISOString() },
    },
  });

  // O SEGUNDO CÉREBRO (06/10): a recusa com motivo é nota do cliente; o JEV lê
  // depois da resposta se ela vale para as próximas peças.
  after(() => registrarNota(card.projectId, `recusa:${key}`));

  return NextResponse.json({ ok: true });
}
