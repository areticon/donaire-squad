export const dynamic = "force-dynamic";
// Selecionar trechos lê a transcrição inteira e escreve alguns milhares de
// tokens. O padrão de 10s da Vercel não serve.
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { selecionarTrechos } from "@/lib/media/select-clips";

/**
 * Passo 3 do fluxo de vídeo: escolher os melhores trechos.
 *
 * Roda depois da transcrição, sobre o que já está gravado no banco. Não toca no
 * arquivo de vídeo, então é barato e pode ser repetido sem pagar transcrição de
 * novo, que é útil quando o cliente não gostou da seleção.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const video = await prisma.videoJob.findFirst({
    where: { id, project: { userId } },
    select: {
      id: true,
      status: true,
      durationSec: true,
      transcript: true,
      projectId: true,
      project: { select: { niche: true, targetAudience: true, voice: true } },
    },
  });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });

  if (video.status !== "selecting" && video.status !== "failed") {
    return NextResponse.json(
      { error: `Vídeo está em "${video.status}". A seleção roda depois da transcrição.` },
      { status: 409 }
    );
  }

  const transcript = video.transcript as {
    paragraphs?: Array<{ text: string; start: number; end: number }>;
  } | null;

  const paragrafos = transcript?.paragraphs ?? [];
  if (!paragrafos.length) {
    return NextResponse.json(
      { error: "Esse vídeo não tem transcrição com parágrafos. Transcreva antes." },
      { status: 400 }
    );
  }

  try {
    const trechos = await selecionarTrechos(
      paragrafos,
      video.durationSec ?? paragrafos[paragrafos.length - 1].end,
      {
        nicho: video.project.niche,
        publico: video.project.targetAudience,
        voz: video.project.voice,
      },
      { projectId: video.projectId }
    );

    await prisma.videoJob.update({
      where: { id },
      data: { status: "writing", clips: trechos, error: null },
    });

    return NextResponse.json({
      ok: true,
      trechos: trechos.map((t) => ({
        inicio: t.inicio,
        fim: t.fim,
        titulo: t.titulo,
        motivo: t.motivo,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao escolher os trechos";
    await prisma.videoJob.update({
      where: { id },
      data: { status: "failed", error: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
