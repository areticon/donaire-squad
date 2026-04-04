import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/** Lista execuções de pipeline (ex.: arquivadas para a tela de arquivo). */
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  const archivedOnly = req.nextUrl.searchParams.get("archivedOnly") === "true";

  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const runs = await prisma.pipelineRun.findMany({
    where: {
      projectId,
      ...(archivedOnly ? { archived: true } : {}),
    },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      topic: true,
      status: true,
      campaignMode: true,
      weekStart: true,
      startedAt: true,
      endedAt: true,
      archived: true,
      archivedAt: true,
    },
    take: 100,
  });

  return NextResponse.json({ runs });
}
