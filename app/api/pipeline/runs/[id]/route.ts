import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

function addDaysUtc(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}

function toIsoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function mergeDateKeepingTime(oldAt: Date | null, newDayUtc: Date): Date {
  if (!oldAt) {
    return new Date(
      Date.UTC(
        newDayUtc.getUTCFullYear(),
        newDayUtc.getUTCMonth(),
        newDayUtc.getUTCDate(),
        12,
        0,
        0,
        0
      )
    );
  }
  const o = new Date(oldAt);
  return new Date(
    Date.UTC(
      newDayUtc.getUTCFullYear(),
      newDayUtc.getUTCMonth(),
      newDayUtc.getUTCDate(),
      o.getUTCHours(),
      o.getUTCMinutes(),
      o.getUTCSeconds(),
      o.getUTCMilliseconds()
    )
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const run = await prisma.pipelineRun.findUnique({
    where: { id },
    include: { project: { select: { userId: true } } },
  });

  if (!run || run.project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (body.cancel === true) {
    if (run.status !== "running") {
      return NextResponse.json({ error: "Campanha não está em execução." }, { status: 400 });
    }
    await prisma.pipelineRun.update({
      where: { id },
      data: { status: "cancelled", endedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.archived === true) {
    await prisma.pipelineRun.update({
      where: { id },
      data: { archived: true, archivedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  // Archive only the cards within a specific week range (preserves other weeks)
  if (body.archiveWeek === true) {
    const weekStartStr = body.weekStart as string | undefined;
    if (!weekStartStr) {
      return NextResponse.json({ error: "weekStart required" }, { status: 400 });
    }
    const weekStartDate = new Date(weekStartStr + "T00:00:00.000Z");
    const weekEndDate = new Date(weekStartDate.getTime() + 7 * 86400000 - 1);

    // Archive cards in this week for this run
    await prisma.campaignCard.updateMany({
      where: {
        runId: id,
        scheduledDate: { gte: weekStartDate, lte: weekEndDate },
      },
      data: { status: "archived" },
    });

    // Check if ALL cards in the run are now archived → archive the run too
    const remainingCards = await prisma.campaignCard.count({
      where: { runId: id, NOT: { status: "archived" } },
    });
    if (remainingCards === 0) {
      await prisma.pipelineRun.update({
        where: { id },
        data: { archived: true, archivedAt: new Date() },
      });
    }

    return NextResponse.json({ ok: true });
  }

  if (body.archived === false) {
    const weekStartStr = body.weekStart as string | undefined;
    const activeDays = body.activeDays as number[] | undefined;

    if (weekStartStr && Array.isArray(activeDays) && activeDays.length > 0) {
      const weekStartDate = new Date(weekStartStr + "T00:00:00.000Z");
      const todayIso = toIsoDate(new Date());

      for (const dow of activeDays) {
        if (dow < 1 || dow > 7) {
          return NextResponse.json({ error: "activeDays: use 1–7 (Seg–Dom)" }, { status: 400 });
        }
        const cellDate = addDaysUtc(weekStartDate, dow - 1);
        if (toIsoDate(cellDate) < todayIso) {
          return NextResponse.json(
            { error: "Não é possível posicionar a campanha em dias passados." },
            { status: 400 }
          );
        }
      }

      const cards = await prisma.campaignCard.findMany({ where: { runId: id } });
      for (const card of cards) {
        if (!activeDays.includes(card.dayOfWeek)) {
          await prisma.campaignCard.update({
            where: { id: card.id },
            data: { scheduledDate: null },
          });
        } else {
          const newDate = addDaysUtc(weekStartDate, card.dayOfWeek - 1);
          await prisma.campaignCard.update({
            where: { id: card.id },
            data: { scheduledDate: newDate },
          });
        }
      }

      const posts = await prisma.post.findMany({ where: { runId: id } });
      for (const p of posts) {
        if (!p.dayOfWeek) continue;
        if (!activeDays.includes(p.dayOfWeek)) {
          await prisma.post.update({
            where: { id: p.id },
            data: {
              scheduledAt: null,
              status: p.status === "published" ? p.status : "draft",
            },
          });
        } else {
          const newDay = addDaysUtc(weekStartDate, p.dayOfWeek - 1);
          const merged = mergeDateKeepingTime(p.scheduledAt, newDay);
          if (merged.getTime() < Date.now() - 60_000) {
            return NextResponse.json(
              { error: "Horário resultante cai no passado. Ajuste a semana ou o horário nos posts." },
              { status: 400 }
            );
          }
          await prisma.post.update({
            where: { id: p.id },
            data: { scheduledAt: merged },
          });
        }
      }

      await prisma.pipelineRun.update({
        where: { id },
        data: {
          archived: false,
          archivedAt: null,
          weekStart: weekStartDate,
        },
      });
    } else {
      await prisma.pipelineRun.update({
        where: { id },
        data: { archived: false, archivedAt: null },
      });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid body" }, { status: 400 });
}
