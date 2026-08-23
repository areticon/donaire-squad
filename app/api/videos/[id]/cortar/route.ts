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
import {
  detectarPausas,
  montarLegendasDestaque,
  segundosRemovidos,
} from "@/lib/media/edicao";
import {
  detectarHesitacao,
  limpezaParaRemocoes,
  unirRemocoes,
} from "@/lib/media/limpeza";
import { escolherGanchos, ganchosNoTempoEditado } from "@/lib/media/abertura";
import type { Word } from "@/lib/media/transcribe";

/**
 * Manda o worker cortar a gravação.
 *
 * Esta é a primeira etapa do fluxo que NÃO roda dentro da requisição, e o
 * desenho é de propósito: a rota despacha, marca o estado e responde em
 * segundos. Quem trabalha é o worker no Railway, onde ffmpeg tem disco de
 * verdade e não existe teto de tempo.
 *
 * É o conserto de raiz que a seleção de trechos ainda não tem. Aqui já nasce
 * certo.
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

  // A edição do vídeo completo é decidida AQUI, e não no worker, pelo mesmo
  // motivo do enquadramento: a matemática do deslocamento de tempo precisa
  // existir num lugar só. As legendas já saem com os tempos convertidos para
  // depois das remoções, senão o destaque do fim do vídeo apareceria quase
  // meio minuto atrasado.
  const transcript = video.transcript as { words?: Word[] } | null;
  const palavras = transcript?.words ?? [];

  const pausas = detectarPausas(palavras, video.durationSec ?? 0);

  // A limpeza de fala vem DEPOIS das pausas e junto com elas, porque as duas
  // atacam problemas diferentes: pausa é silêncio, hesitação tem áudio.
  //
  // Medido na gravação real: as pausas devolvem 49,6s no vídeo inteiro, e a
  // limpeza devolve cerca de 30s só no primeiro bloco de 800 palavras. É onde
  // o tempo realmente está.
  //
  // Falhar aqui não derruba o corte: o vídeo sai com as pausas removidas e a
  // fala como estava, que é pior mas existe.
  let fala: Awaited<ReturnType<typeof detectarHesitacao>> = [];
  try {
    fala = await detectarHesitacao(palavras, { projectId: video.projectId });
  } catch {
    /* segue sem limpeza de fala */
  }

  const remocoes = unirRemocoes(pausas, limpezaParaRemocoes(fala, palavras));
  const legendasAss = montarLegendasDestaque(trechos, remocoes);

  // Os ganchos da abertura, já convertidos para o tempo DEPOIS da edição.
  // Converter aqui e não no worker é a mesma regra do resto: a matemática do
  // deslocamento mora num lugar só.
  //
  // Falhar aqui não derruba o corte: o vídeo sai começando do começo, que
  // retém menos mas existe.
  let ganchos: ReturnType<typeof ganchosNoTempoEditado> = [];
  try {
    ganchos = ganchosNoTempoEditado(
      await escolherGanchos(trechos, { projectId: video.projectId }),
      remocoes
    );
  } catch {
    /* segue sem abertura */
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://demandou.com";
  const corpo = JSON.stringify({
    videoJobId: id,
    sourceUrl: video.blobUrl,
    duracaoSec: video.durationSec ?? 0,
    trechos: trechos.map((t, i) => ({
      indice: i,
      inicio: Math.floor(t.inicio),
      fim: Math.ceil(t.fim),
      titulo: t.titulo,
    })),
    remocoes: remocoes.map((r) => ({ de: r.de, ate: r.ate })),
    ganchos: ganchos.map((g) => ({ inicio: g.inicio, fim: g.fim })),
    legendasAss,
    enquadramentoUrl: `${appUrl}/api/videos/${id}/enquadrar`,
    callbackUrl: `${appUrl}/api/videos/${id}/cortar-callback`,
  });

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

  return NextResponse.json({
    ok: true,
    trechos: trechos.length,
    remocoes: remocoes.length,
    pausas: pausas.length,
    hesitacoes: fala.length,
    ganchos: ganchos.length,
    segundosRemovidos: Math.round(segundosRemovidos(remocoes)),
  });
}
