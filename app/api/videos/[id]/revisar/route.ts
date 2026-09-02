export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { completarEsteiraDoVideo } from "@/lib/media/esteira-do-video";

/**
 * Roda de novo o que falta na esteira do vídeo: carrossel da Diana, veredito
 * da Vera, cards de Vera e Paulo. Idempotente, então serve tanto para vídeo
 * agendado antes de 02/09 (quando nada disso existia) quanto para pedir uma
 * nova passada depois de mexer nos cortes.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const video = await prisma.videoJob.findUnique({
    where: { id },
    select: { id: true, project: { select: { userId: true } } },
  });
  if (!video || video.project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const resultado = await completarEsteiraDoVideo(id);
  return NextResponse.json(resultado);
}
