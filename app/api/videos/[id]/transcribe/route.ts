export const dynamic = "force-dynamic";
// Transcrever um vídeo longo leva mais que o padrão de 10s da Vercel. Só o
// modo direto usa isto de verdade; o assíncrono devolve na hora e o resultado
// chega por callback.
export const maxDuration = 800;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { transcribeBlob, transcribeBlobAsync, suportaCallback } from "@/lib/media/transcribe";
import { assinarVideo } from "@/lib/media/callback-token";
import { buildKeyterms, MAX_KEYTERMS } from "@/lib/media/keyterms";
import { parseTermos } from "@/lib/media/termos";
import { MAX_TENTATIVAS } from "@/lib/media/video-state";

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
      attempts: true,
      projectId: true,
      project: {
        select: {
          name: true,
          videoTerms: true,
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

  // Idempotência: se já transcreveu, não paga de novo. Transcrição é a etapa
  // que custa dinheiro de verdade por repetição, então a guarda importa mais
  // aqui que nas outras.
  if (video.status !== "uploaded" && video.status !== "failed") {
    return NextResponse.json({ error: `Vídeo já está em "${video.status}"` }, { status: 409 });
  }

  if (video.attempts >= MAX_TENTATIVAS) {
    return NextResponse.json(
      { error: "Esta etapa já falhou vezes demais. Fale com o suporte antes de tentar outra vez." },
      { status: 409 }
    );
  }

  // Toma o trabalho de forma atômica: dois cliques não podem virar duas
  // transcrições cobradas.
  const tomado = await prisma.videoJob.updateMany({
    where: { id, status: video.status },
    data: {
      status: "transcribing",
      startedAt: new Date(),
      attempts: { increment: 1 },
      error: null,
    },
  });
  if (tomado.count === 0) {
    return NextResponse.json(
      { error: "Outra aba já começou a transcrever este vídeo." },
      { status: 409 }
    );
  }

  try {
    // Os termos que o CLIENTE cadastrou vêm primeiro: são o que ele sabe que
    // a transcrição erra. O que sobrar do orçamento de cinco vai para os nomes
    // deduzidos do contexto de marca.
    const doCliente = parseTermos(video.project.videoTerms);
    const keyterms = [
      ...doCliente,
      ...buildKeyterms(video.project.name, video.project.contexts[0]?.compiled).filter(
        (t) => !doCliente.some((d) => d.toLowerCase() === t.toLowerCase())
      ),
    ].slice(0, MAX_KEYTERMS);
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
        status: "transcribed",
        startedAt: null,
        attempts: 0,
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
    console.error(`[transcricao][despacho] ${err instanceof Error ? err.message : err}`);
    const message =
      "A transcrição falhou desta vez. Nada se perdeu: vamos tentar de novo sozinhos.";
    await prisma.videoJob.update({
      where: { id },
      data: { status: "failed", startedAt: null, error: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
