export const dynamic = "force-dynamic";
// Monta o pedido (a limpeza de fala roda de novo aqui, como no /cortar) e só
// despacha: quem trabalha é o worker.
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { acessoAoVideo } from "@/lib/media/piloto-do-servidor";
import { prisma } from "@/lib/db/prisma";
import type { Trecho } from "@/lib/media/select-clips";
import { assinarCorpo, CABECALHO_ASSINATURA } from "@/lib/media/worker-token";
import { montarPedidoDeCorte } from "@/lib/media/pedido-de-corte";
import { estimativaDaRodadaSegundos } from "@/lib/media/video-state";
import type { Word } from "@/lib/media/transcribe";
import { garantirRetomadasNoRoteiro } from "@/lib/media/roteiro-da-edicao";

/**
 * Refaz SÓ o vídeo completo, sem recortar tudo de novo (30/09).
 *
 * É a ação do estado "o vídeo completo não chegou" da faixa do Gestor. Até
 * aqui essa saída só existia como script (scripts/tmp/rodar-so-completo.mts),
 * e o cliente cujo completo falhava via a faixa contar para sempre: 196
 * minutos no teste de 29/09. O worker já sabia fazer isto desde 02/09
 * (`soCompleto`); faltava a porta.
 *
 * Os cortes, textos e cards ficam como estão. O aviso do worker volta pelo
 * cortar-callback, no ramo do completo atrasado, que anexa o arquivo e marca o
 * fim da rodada.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const base = process.env.VIDEO_WORKER_URL;
  if (!base) {
    return NextResponse.json({ error: "O worker de vídeo não está configurado." }, { status: 503 });
  }

  const { id } = await params;
  const acesso = await acessoAoVideo(req, id);
  if (!acesso) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const video = await prisma.videoJob.findFirst({
    where: acesso.where,
    select: {
      id: true,
      status: true,
      blobUrl: true,
      clips: true,
      transcript: true,
      durationSec: true,
      projectId: true,
      completoUrl: true,
      project: { select: { videoStyle: true, videoMusicUrl: true, videoTerms: true, videoEstiloEscolha: true, colorPalette: true } },
    },
  });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });

  // Só depois dos cortes: antes disso o completo ainda está a caminho junto
  // com eles, e pedir outro seria pagar o mesmo trabalho duas vezes.
  if (!["cut", "writing", "ready"].includes(video.status)) {
    return NextResponse.json(
      { error: `Vídeo está em "${video.status}". O completo se refaz depois dos cortes.` },
      { status: 409 }
    );
  }

  const trechos = (video.clips as unknown as Trecho[]) ?? [];
  const transcript = video.transcript as { words?: Word[] } | null;
  // O texto que o cliente aprovou (como no /cortar), com as retomadas por cima
  // quando o roteiro é de antes de 03/10. Sem roteiro aprovado, a limpeza
  // roda inteira de novo, como antes.
  const roteiro = await garantirRetomadasNoRoteiro(id);
  const aprovado = roteiro?.aprovadoEm ? roteiro : null;
  const { corpo } = await montarPedidoDeCorte(
    {
      id,
      blobUrl: video.blobUrl,
      durationSec: video.durationSec ?? 0,
      projectId: video.projectId,
      trechos,
      palavras: transcript?.words ?? [],
      estilo: video.project?.videoStyle ?? null,
      musicaUrl: video.project?.videoMusicUrl ?? null,
      termos: video.project?.videoTerms ?? null,
      escolha: video.project?.videoEstiloEscolha ?? null,
      colorPalette: video.project?.colorPalette ?? null,
      remocoesProntas: aprovado ? aprovado.remocoes : null,
      retomadasNasProntas: Boolean(aprovado?.retomadasFeitas),
    },
    { appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://demandou.com" }
  );
  const pedido = JSON.parse(corpo) as Record<string, unknown>;
  pedido.soCompleto = true;
  const texto = JSON.stringify(pedido);

  // A contagem regressiva da faixa: o completo sozinho leva perto de 0,6
  // minuto por minuto de gravação (passe 1 em ultrafast mais o acabamento em
  // lotes), então a rodada "começa" no passado o bastante para sobrar isso da
  // promessa inteira. Assim a faixa conta os ~13 min de um vídeo de 22, e não
  // os 33 da rodada completa.
  const promessa = estimativaDaRodadaSegundos(video.durationSec);
  const soOCompleto = Math.round((video.durationSec ?? 900) * 0.6);
  const rodadaEm = new Date(Date.now() - Math.max(0, promessa - soOCompleto) * 1000);

  try {
    const r = await fetch(`${base.replace(/\/$/, "")}/cortar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", [CABECALHO_ASSINATURA]: assinarCorpo(texto) },
      body: texto,
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) throw new Error(`worker respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao acionar o worker";
    return NextResponse.json({ error: `Não consegui pedir o vídeo completo de novo: ${message}` }, { status: 502 });
  }

  // O erro do completo anterior sai (ele deixou de ser o estado atual) e a
  // rodada recomeça: a faixa volta a contar em vez de mostrar a falha.
  await prisma.videoJob.update({
    where: { id },
    data: { error: null, rodadaEm, finishedAt: null },
  });

  return NextResponse.json({ ok: true, previstoSegundos: soOCompleto });
}
