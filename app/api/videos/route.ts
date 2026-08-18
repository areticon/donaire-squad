export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";

/** Lista os vídeos de um projeto. */
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId é obrigatório" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });

  const videos = await prisma.videoJob.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      originalName: true,
      durationSec: true,
      clips: true,
      error: true,
      creditsCharged: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ videos });
}

/**
 * Registra um vídeo já enviado ao storage.
 *
 * Existe porque o callback do storage (onUploadCompleted) não alcança o
 * localhost em desenvolvimento. Em produção o callback cria o registro e esta
 * rota é idempotente: se já existir registro para a mesma URL, devolve o que
 * está lá em vez de duplicar.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, blobUrl, originalName, sizeBytes } = await req.json();
  if (!projectId || !blobUrl) {
    return NextResponse.json(
      { error: "projectId e blobUrl são obrigatórios" },
      { status: 400 }
    );
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });

  const existing = await prisma.videoJob.findFirst({
    where: { projectId, blobUrl },
    select: { id: true, status: true },
  });
  if (existing) return NextResponse.json({ video: existing, created: false });

  const video = await prisma.videoJob.create({
    data: {
      projectId,
      userId,
      status: "uploaded",
      blobUrl,
      originalName: originalName ?? null,
      sizeBytes: sizeBytes ? BigInt(sizeBytes) : null,
    },
    select: { id: true, status: true },
  });

  return NextResponse.json({ video, created: true });
}
