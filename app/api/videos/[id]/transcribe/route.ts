export const dynamic = "force-dynamic";
// Transcrever um vídeo longo leva mais que o padrão de 10s da Vercel. Só o
// modo direto usa isto de verdade; o assíncrono devolve na hora e o resultado
// chega por callback.
export const maxDuration = 800;

import { NextRequest, NextResponse } from "next/server";
import { acessoAoVideo } from "@/lib/media/piloto-do-servidor";
import { prisma } from "@/lib/db/prisma";
import { transcribeBlob, transcribeBlobAsync, suportaCallback } from "@/lib/media/transcribe";
import { assinarVideo } from "@/lib/media/callback-token";
import { buildKeyterms, MAX_KEYTERMS } from "@/lib/media/keyterms";
import { parseTermos } from "@/lib/media/termos";
import { MAX_TENTATIVAS } from "@/lib/media/video-state";
import { head } from "@vercel/blob";
import { LIMITE_DA_TRANSCRICAO_DIRETA } from "@/lib/media/limits";
import { assinarCorpo, CABECALHO_ASSINATURA } from "@/lib/media/worker-token";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // A PRIMEIRA etapa tambem aceita a assinatura do piloto, e nao so a sessao.
  // Ate 08/09 ela era a unica que exigia aba aberta, entao a esteira inteira
  // dependia de alguem estar com a tela do cliente na frente: o `onUploadCompleted`
  // do storage nao tem sessao nenhuma e nao conseguia comecar. Servidor que
  // pilota da segunda etapa em diante e piloto pela metade.
  const acesso = await acessoAoVideo(req, id);
  if (!acesso) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const video = await prisma.videoJob.findFirst({
    where: acesso.where,
    select: {
      id: true,
      blobUrl: true,
      audioUrl: true,
      sizeBytes: true,
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
            where: { type: "brand", status: "pronto" },
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
    // `jaEmAndamento` (02/10): quem chamou chegou depois de a etapa começar.
    // Não é erro para mostrar; a tela só consulta o estado.
    return NextResponse.json({ error: `Vídeo já está em "${video.status}"`, jaEmAndamento: true }, { status: 409 });
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
    // A CORRIDA QUE VIRAVA "OUTRA ABA" (02/10). Quem ganha aqui quase nunca é
    // outra aba: é o próprio servidor, que começa a transcrição no aviso de
    // upload concluído (upload/route.ts, despacharPasso "transcrever") no mesmo
    // segundo em que a faixa do Gestor pedia a mesma coisa. A frase culpava uma
    // aba que não existia. Agora diz o que é, e vai marcada para a tela não
    // mostrar como erro.
    return NextResponse.json(
      { error: "A transcrição deste vídeo já começou.", jaEmAndamento: true },
      { status: 409 }
    );
  }

  try {
    /**
     * GRAVAÇÃO ACIMA DE 1,9 GB: primeiro o áudio (29/09).
     *
     * A Deepgram recusa arquivo acima de 2 GB, e desde os tetos de 1, 2 e 5
     * horas o arquivo chega a 20 GB. O worker baixa, extrai só o áudio (cerca
     * de 29 MB por hora) e avisa em `audio-callback`, que devolve o vídeo para
     * "uploaded" com `audioUrl` preenchido e chama esta rota de novo. Na segunda
     * passada o `audioUrl` existe e a transcrição segue o caminho de sempre.
     */
    const fonteDaFala = video.audioUrl ?? video.blobUrl;
    if (!video.audioUrl) {
      const bytes =
        video.sizeBytes != null
          ? Number(video.sizeBytes)
          : await head(video.blobUrl, { token: process.env.BLOB_READ_WRITE_TOKEN }).then((h) => h.size).catch(() => 0);
      if (bytes > LIMITE_DA_TRANSCRICAO_DIRETA) {
        const base = process.env.VIDEO_WORKER_URL;
        if (!base) throw new Error("Gravação acima de 1,9 GB e o worker de vídeo não está configurado.");
        const corpo = JSON.stringify({
          videoJobId: id,
          sourceUrl: video.blobUrl,
          callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://demandou.com"}/api/videos/${id}/audio-callback`,
        });
        const r = await fetch(`${base.replace(/\/$/, "")}/audio`, {
          method: "POST",
          headers: { "Content-Type": "application/json", [CABECALHO_ASSINATURA]: assinarCorpo(corpo) },
          body: corpo,
          signal: AbortSignal.timeout(30_000),
        });
        if (r.status !== 202) throw new Error(`O worker recusou a extração do áudio (${r.status}).`);
        return NextResponse.json({
          ok: true,
          modo: "audio",
          mensagem: "Gravação grande: separando o áudio antes de transcrever. O status muda sozinho.",
        });
      }
    }

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
      const { requestId } = await transcribeBlobAsync(fonteDaFala, callback, { keyterms });
      return NextResponse.json({
        ok: true,
        modo: "assincrono",
        requestId,
        mensagem: "Transcrição em andamento. O status muda sozinho quando terminar.",
      });
    }

    const result = await transcribeBlob(fonteDaFala, {
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
