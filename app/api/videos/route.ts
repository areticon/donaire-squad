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
 * localhost em desenvolvimento. Em produção as duas coisas acontecem, e é isso
 * que produzia registro duplicado até 22/08: as duas escritas são concorrentes.
 * A garantia de "um arquivo, um registro" está na restrição única do banco.
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

  // `upsert` e não "procura, e se não achar cria": as duas rotas que registram
  // um vídeo (esta e o aviso do storage) leem antes de qualquer uma escrever,
  // então a checagem na aplicação não decide nada e as duas criavam. Quem
  // resolve corrida é a restrição no banco, e o `update` vazio significa
  // exatamente "já existe, deixa como está".
  const video = await prisma.videoJob.upsert({
    where: { projectId_blobUrl: { projectId, blobUrl } },
    update: {},
    create: {
      projectId,
      userId,
      status: "uploaded",
      blobUrl,
      originalName: originalName ?? null,
      sizeBytes: sizeBytes ? BigInt(sizeBytes) : null,
    },
    select: { id: true, status: true },
  });

  return NextResponse.json({ video });
}
