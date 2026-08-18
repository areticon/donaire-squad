export const dynamic = "force-dynamic";
// Transcrever um vídeo longo leva mais que o padrão de 10s da Vercel.
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { transcribeBlob, transcribeBlobAsync, suportaCallback } from "@/lib/media/transcribe";
import { assinarVideo } from "@/lib/media/callback-token";
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
      projectId: true,
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
    // Assíncrono quando dá, direto quando não dá.
    //
    // No modo direto a função segura a requisição enquanto o áudio inteiro
    // atravessa o nosso servidor duas vezes, e vídeo longo esbarra no
    // maxDuration. Pior: transcrever um arquivo de 92 MB direto do blob
    // estourou com SocketError depois de 28 MB, por contrapressão, porque a
    // perna de saída era mais lenta que a de entrada e o CDN derrubou a
    // conexão ociosa.
    //
    // O assíncrono resolve, mas exige que a Deepgram alcance a gente, o que não
    // acontece em localhost. Mandar callback para endereço inalcançável seria o
    // pior desfecho: ela transcreveria, cobraria, e o resultado não voltaria
    // para lugar nenhum.
    if (suportaCallback()) {
      const callback = `${process.env.NEXT_PUBLIC_APP_URL}/api/videos/${id}/transcribe-callback?sig=${assinarVideo(id)}`;
      const { requestId } = await transcribeBlobAsync(video.blobUrl, callback, { keyterms });
      return NextResponse.json({
        ok: true,
        modo: "assincrono",
        requestId,
        mensagem: "Transcrição em andamento. O status muda sozinho quando terminar.",
      });
    }

    const result = await transcribeBlob(video.blobUrl, {
      keyterms,
      usage: { projectId: video.projectId, operation: "video_transcricao" },
    });

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
