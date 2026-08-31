export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";

/** O card pergunta se o re-corte do trecho ainda está rodando. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const trecho = Number(req.nextUrl.searchParams.get("trecho"));
  const video = await prisma.videoJob.findFirst({
    where: { id, project: { userId } },
    select: { clips: true },
  });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const clip = ((video.clips as Array<{ midia?: { refazendo?: boolean } }> | null) ?? [])[trecho];
  return NextResponse.json({ refazendo: Boolean(clip?.midia?.refazendo) });
}
