export const dynamic = "force-dynamic";
// O corpo já vem pronto: só interpretar e gravar. Não precisa dos 300s.
export const maxDuration = 60;

import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { aplicarTermos, parseTermos } from "@/lib/media/termos";
import { interpretarResposta, transcribeBlobAsync } from "@/lib/media/transcribe";
import { MAX_TENTATIVAS } from "@/lib/media/video-state";
import { assinaturaValida, assinarVideo } from "@/lib/media/callback-token";
import { recordTranscricao } from "@/lib/media/usage";
import { despacharPasso } from "@/lib/media/piloto-do-servidor";

/**
 * Recebe o resultado da transcrição assíncrona da Deepgram.
 *
 * Esta rota **não tem sessão**, e não pode ter: quem chama é a Deepgram, de
 * fora, sem cookie nenhum. A autenticação é a assinatura na query, que vale
 * para um vídeo só.
 *
 * Cuidado que vale registrar: o corpo aqui é dado de terceiro chegando sem
 * sessão, então tudo que vem nele passa pelas mesmas guardas do modo direto,
 * as de transcrição vazia e de transcrição sem confiança. Confiar no corpo só
 * porque a assinatura conferiu seria confundir "veio de quem eu espero" com
 * "veio correto".
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const assinatura = req.nextUrl.searchParams.get("sig") ?? "";

  if (!assinaturaValida(id, assinatura)) {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  }

  const video = await prisma.videoJob.findUnique({
    where: { id },
    select: { id: true, status: true, projectId: true, attempts: true, blobUrl: true, project: { select: { videoTerms: true } } },
  });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });

  // Idempotência: a Deepgram repete o callback se não receber 200. Sem isto, a
  // repetição sobrescreveria uma transcrição que o cliente já pode ter usado.
  if (video.status !== "transcribing") {
    return NextResponse.json({ ok: true, ignorado: `status ${video.status}` });
  }

  let corpo: unknown = null;
  try {
    corpo = await req.json();
    const resultado = interpretarResposta(corpo as never);

    recordTranscricao("nova-3-multi", resultado.durationSec, {
      projectId: video.projectId,
      operation: "video_transcricao",
    });

    await prisma.videoJob.update({
      where: { id },
      data: {
        status: "transcribed",
        startedAt: null,
        attempts: 0,
        durationSec: resultado.durationSec,
        error: null,
        transcript: {
          text: resultado.text,
          language: resultado.language,
          // Rede determinística por baixo do keyterm: o que a Deepgram ainda
          // errar nos termos do cliente é corrigido aqui, uma vez, e vale para
          // seleção, legenda e posts.
          words: aplicarTermos(resultado.words, parseTermos(video.project?.videoTerms)),
          paragraphs: resultado.paragraphs,
          meanConfidence: resultado.meanConfidence,
          wordsPerMinute: resultado.wordsPerMinute,
        },
      },
    });

    // A transcrição é tudo o que o squad precisa para começar. Dois trilhos em
    // paralelo a partir daqui: o do vídeo (seleção, cortes, capas, posts) e o
    // da semana de texto (quadro aberto, Roberto, redatores, Vera). Até 04/09
    // os dois eram disparados pela aba do cliente, um depois do outro, e o
    // quadro só aparecia aos 13 minutos.
    after(() => Promise.all([despacharPasso(id, "selecionar"), despacharPasso(id, "semana")]));

    return NextResponse.json({ ok: true });
  } catch (err) {
    // O motivo tecnico vai para o LOG, onde a gente investiga; a tela recebe
    // uma frase que o cliente entende e que nao vaza fornecedor. Achado do
    // teste de 31/08: "Deepgram nao devolveu transcricao" na cara do usuario,
    // que nao tem que saber que a Deepgram existe.
    console.error(
      `[transcricao][${id}] falhou: ${err instanceof Error ? err.message : err}. ` +
        `corpo bruto: ${JSON.stringify(corpo ?? {}).slice(0, 2000)}`
    );
    // A nova tentativa sai DAQUI, do servidor, e não da tela: a versão
    // anterior dependia de alguém abrir a aba para o piloto disparar o retry,
    // e o vídeo do Bruno ficou 22 minutos parado em "failed" esperando isso
    // (31/08). Falha de transcrição costuma ser transitória do serviço;
    // re-despachar na hora custa nada e o teto de tentativas continua valendo.
    if (video.attempts < MAX_TENTATIVAS && video.blobUrl) {
      try {
        const callback = `${process.env.NEXT_PUBLIC_APP_URL}/api/videos/${id}/transcribe-callback?sig=${assinarVideo(id)}`;
        await transcribeBlobAsync(video.blobUrl, callback, {
          keyterms: parseTermos(video.project?.videoTerms),
        });
        await prisma.videoJob.update({
          where: { id },
          data: {
            status: "transcribing",
            startedAt: new Date(),
            attempts: { increment: 1 },
            error: null,
          },
        });
        return NextResponse.json({ ok: true, retentando: true });
      } catch (reErr) {
        console.error(`[transcricao][${id}] re-despacho também falhou:`, reErr);
      }
    }
    const message =
      "A transcrição falhou desta vez. Nada se perdeu: vamos tentar de novo sozinhos.";
    await prisma.videoJob.update({
      where: { id },
      data: { status: "failed", startedAt: null, error: message },
    });
    // 200 de propósito mesmo em falha nossa: a Deepgram repetiria o callback, e
    // repetir não conserta transcrição ruim. O erro já está gravado no vídeo,
    // que é onde o cliente vai ver.
    return NextResponse.json({ ok: false, error: message });
  }
}
