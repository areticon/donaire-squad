export const dynamic = 'force-dynamic'

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const runId = req.nextUrl.searchParams.get("runId");
  const projectId = req.nextUrl.searchParams.get("projectId");
  const weekStart = req.nextUrl.searchParams.get("weekStart"); // ISO date of Monday

  // Fetch specific run by ID
  if (runId) {
    const run = await prisma.pipelineRun.findUnique({
      where: { id: runId },
      include: {
        cards: {
          orderBy: [{ dayOfWeek: "asc" }, { createdAt: "asc" }],
        },
      },
    });
    if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ...run, logs: Array.isArray(run.logs) ? run.logs : [] });
  }

  if (!projectId) return NextResponse.json({ error: "runId or projectId required" }, { status: 400 });

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // If weekStart provided, return all cards for that week
  if (weekStart) {
    const weekStartDate = new Date(weekStart + "T00:00:00.000Z");
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6); // always UTC to avoid DST/tz issues
    weekEndDate.setUTCHours(23, 59, 59, 999);

    const cards = await prisma.campaignCard.findMany({
      where: {
        projectId,
        scheduledDate: {
          gte: weekStartDate,
          lte: weekEndDate,
        },
        run: { archived: false },
        NOT: { status: "archived" },
      },
      orderBy: [{ dayOfWeek: "asc" }, { createdAt: "asc" }],
    });

    const weekRun = await prisma.pipelineRun.findFirst({
      where: {
        projectId,
        archived: false,
        weekStart: {
          gte: weekStartDate,
          lte: new Date(weekStartDate.getTime() + 24 * 60 * 60 * 1000),
        },
      },
      orderBy: { startedAt: "desc" },
    });

    return NextResponse.json({ cards, run: weekRun });
  }

  const latestRun = await prisma.pipelineRun.findFirst({
    where: { projectId, archived: false },
    orderBy: { startedAt: "desc" },
    include: {
      cards: {
        orderBy: [{ dayOfWeek: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  return NextResponse.json({ run: latestRun });
}
