export const dynamic = "force-dynamic";
// Transcrever um vídeo longo leva mais que o padrão de 10s da Vercel.
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { transcribeBlob } from "@/lib/media/transcribe";
import { buildKeyterms } from "@/lib/media/keyterms";

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
      blobUrl: true,
      status: true,
      project: {
        select: {
          name: true,
          // O contexto de marca é onde vivem os nomes próprios do cliente, que
          // são o que o keyterm consegue proteger.
          contexts: {
            where: { type: "brand" },
            select: { compiled: true },
            take: 1,
          },
        },
      },
    },
  });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });

  // Idempotência: se já transcreveu, não paga de novo.
  if (video.status !== "uploaded" && video.status !== "failed") {
    return NextResponse.json({ error: `Vídeo já está em "${video.status}"` }, { status: 409 });
  }

  await prisma.videoJob.update({
    where: { id },
    data: { status: "transcribing", error: null },
  });

  try {
    const keyterms = buildKeyterms(
      video.project.name,
      video.project.contexts[0]?.compiled
    );
    const result = await transcribeBlob(video.blobUrl, { keyterms });

    await prisma.videoJob.update({
      where: { id },
      data: {
        status: "selecting",
        durationSec: result.durationSec,
        transcript: {
          text: result.text,
          language: result.language,
          words: result.words,
          paragraphs: result.paragraphs,
          // Guardados para a tela de aprovação poder avisar o cliente quando a
          // gravação saiu ruim, sem precisar transcrever de novo para medir.
          meanConfidence: result.meanConfidence,
          wordsPerMinute: result.wordsPerMinute,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      durationSec: result.durationSec,
      words: result.words.length,
      paragraphs: result.paragraphs.length,
      meanConfidence: Number(result.meanConfidence.toFixed(3)),
      wordsPerMinute: Math.round(result.wordsPerMinute),
      preview: result.text.slice(0, 300),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha na transcrição";
    await prisma.videoJob.update({
      where: { id },
      data: { status: "failed", error: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
