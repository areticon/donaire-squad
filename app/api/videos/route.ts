export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { descartarGravacaoRecusada, fraseDoEstouro, registrarGravacao } from "@/lib/limites-do-plano";
import { projetoVisivel } from "@/lib/equipe/conta";

/** Lista os vídeos de um projeto. */
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId é obrigatório" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, ...projetoVisivel(userId) },
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
    where: { id: projectId, ...projetoVisivel(userId) },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });

  // `upsert` e não "procura, e se não achar cria": as duas rotas que registram
  // um vídeo (esta e o aviso do storage) leem antes de qualquer uma escrever,
  // então a checagem na aplicação não decidia nada e as duas criavam. Desde
  // 30/09 quem resolve a corrida é a trava de `registrarGravacao`, que também
  // confere a COTA DE GRAVAÇÕES: até aqui esta rota registrava qualquer arquivo
  // sem cota, e era a porta aberta do limite de 4 gravações do Starter.
  const registro = await registrarGravacao({ userId, projectId, blobUrl, originalName, sizeBytes });
  if (!registro.ok) {
    await descartarGravacaoRecusada(blobUrl, projectId);
    return NextResponse.json(
      { error: fraseDoEstouro(registro.estouro), limite: registro.estouro },
      { status: 403 }
    );
  }

  return NextResponse.json({ video: registro.video });
}
