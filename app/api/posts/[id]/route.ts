import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

const PAST_TOLERANCE_MS = 60_000;

function isPastDate(d: Date): boolean {
  return d.getTime() < Date.now() - PAST_TOLERANCE_MS;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const post = await prisma.post.findUnique({
    where: { id },
    include: { project: { select: { userId: true } } },
  });

  if (!post || post.project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ post });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const post = await prisma.post.findUnique({
    where: { id },
    include: { project: { select: { userId: true } } },
  });

  if (!post || post.project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {};

  if (body.content !== undefined) updateData.content = body.content;

  if (body.cancelSchedule) {
    updateData.status = "draft";
    updateData.scheduledAt = null;
  } else if (body.scheduledAt !== undefined) {
    const d = body.scheduledAt ? new Date(body.scheduledAt) : null;
    if (d && isPastDate(d)) {
      return NextResponse.json(
        { error: "Não é possível agendar no passado. Escolha data e hora atuais ou futuras." },
        { status: 400 }
      );
    }
    updateData.scheduledAt = d;
    // Reagendar: mantém fila se já estava scheduled; senão permanece rascunho até aprovação
    if (d && post.status === "scheduled") {
      updateData.status = "scheduled";
    } else if (d && post.status !== "published") {
      updateData.status = "draft";
    }
  }

  if (body.status !== undefined) {
    if (body.status === "scheduled") {
      const at = (updateData.scheduledAt as Date | undefined) ?? post.scheduledAt;
      if (!at) {
        return NextResponse.json(
          { error: "Defina data e hora de publicação antes de aprovar o agendamento." },
          { status: 400 }
        );
      }
      if (isPastDate(new Date(at))) {
        return NextResponse.json(
          { error: "Não é possível agendar no passado." },
          { status: 400 }
        );
      }
      updateData.status = "scheduled";
    } else {
      updateData.status = body.status;
    }
  }

  const updated = await prisma.post.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json({ post: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const post = await prisma.post.findUnique({
    where: { id },
    include: { project: { select: { userId: true } } },
  });

  if (!post || post.project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.post.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
