export const dynamic = "force-dynamic";
// Só despacha e responde. O trabalho pesado vive no worker, que não tem teto.
// A limpeza de fala roda aqui antes de despachar, e são várias chamadas em
// paralelo. Medido: cerca de 30s por bloco de 800 palavras, e uma gravação de
// duas horas tem uns 20 blocos.
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import type { Trecho } from "@/lib/media/select-clips";
import { assinarCorpo, CABECALHO_ASSINATURA } from "@/lib/media/worker-token";
import { MAX_TENTATIVAS } from "@/lib/media/video-state";
import { montarPedidoDeCorte } from "@/lib/media/pedido-de-corte";
import type { Word } from "@/lib/media/transcribe";

/**
 * Manda o worker cortar a gravação.
 *
 * Esta é a primeira etapa do fluxo que NÃO roda dentro da requisição, e o
 * desenho é de propósito: a rota despacha, marca o estado e responde em
 * segundos. Quem trabalha é o worker no Railway, onde ffmpeg tem disco de
 * verdade e não existe teto de tempo.
 *
 * O CONTEÚDO do pedido (pausas, limpeza, ganchos, fundo, legendas, estilo) sai
 * de `montarPedidoDeCorte`, e não daqui. A razão é que o script de teste manda
 * o mesmo pedido, e enquanto essa montagem morou dentro da rota as duas cópias
 * divergiram mais de uma vez, sempre do mesmo jeito: o produto era consertado,
 * o teste continuava com o desenho velho, e dizia que funcionava.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const base = process.env.VIDEO_WORKER_URL;
  if (!base) {
    return NextResponse.json(
      { error: "O worker de vídeo não está configurado." },
      { status: 503 }
    );
  }

  const { id } = await params;

  const video = await prisma.videoJob.findFirst({
    where: { id, project: { userId } },
    select: {
      id: true,
      status: true,
      attempts: true,
      blobUrl: true,
      clips: true,
      // O estilo decide legenda, ritmo e som, e mora no PROJETO e não no
      // envio: canal com estilo diferente a cada vídeo não constrói
      // reconhecimento. O nicho, que alimenta o fundo gerado, é lido na rota
      // `/enquadrar`, que é onde o fundo passou a ser gerado.
      project: { select: { videoStyle: true } },
      transcript: true,
      durationSec: true,
      projectId: true,
    },
  });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });

  if (video.status !== "selected" && video.status !== "failed") {
    return NextResponse.json(
      { error: `Vídeo está em "${video.status}". O corte roda depois da seleção.` },
      { status: 409 }
    );
  }
  if (video.attempts >= MAX_TENTATIVAS) {
    return NextResponse.json(
      { error: "Esta etapa já falhou vezes demais. Fale com o suporte." },
      { status: 409 }
    );
  }

  const trechos = (video.clips as unknown as Trecho[]) ?? [];
  if (!trechos.length) {
    return NextResponse.json(
      { error: "Esse vídeo não tem trechos escolhidos." },
      { status: 400 }
    );
  }

  const tomado = await prisma.videoJob.updateMany({
    where: { id, status: video.status },
    data: {
      status: "cutting",
      startedAt: new Date(),
      attempts: { increment: 1 },
      error: null,
    },
  });
  if (tomado.count === 0) {
    return NextResponse.json(
      { error: "Outra aba já mandou cortar este vídeo." },
      { status: 409 }
    );
  }

  const transcript = video.transcript as { words?: Word[] } | null;

  const { corpo, resumo } = await montarPedidoDeCorte(
    {
      id,
      blobUrl: video.blobUrl,
      durationSec: video.durationSec ?? 0,
      projectId: video.projectId,
      trechos,
      palavras: transcript?.words ?? [],
      estilo: video.project?.videoStyle ?? null,
    },
    { appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://demandou.com" }
  );

  try {
    const r = await fetch(`${base.replace(/\/$/, "")}/cortar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [CABECALHO_ASSINATURA]: assinarCorpo(corpo),
      },
      body: corpo,
      // O worker responde 202 na hora. Se demorar mais que isso, algo está
      // errado com ele, não com o vídeo.
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) {
      throw new Error(`worker respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
    }
  } catch (err) {
    // Devolve o estado: sem isto o vídeo ficaria "cortando" até o prazo, com o
    // worker sem saber que existe trabalho.
    const message = err instanceof Error ? err.message : "Falha ao acionar o worker";
    await prisma.videoJob.update({
      where: { id },
      data: { status: "failed", startedAt: null, error: message },
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, ...resumo });
}
