import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { type, reason, cardType } = await req.json();

  const card = await prisma.campaignCard.findUnique({
    where: { id },
    include: { project: { select: { userId: true } } },
  });

  if (!card || card.project.userId !== userId) {
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

  return NextResponse.json({ ok: true });
}
