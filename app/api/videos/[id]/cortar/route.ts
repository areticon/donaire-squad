export const dynamic = "force-dynamic";
// Só despacha e responde. O trabalho pesado vive no worker, que não tem teto.
// A limpeza de fala roda aqui antes de despachar, e são várias chamadas em
// paralelo. Medido: cerca de 30s por bloco de 800 palavras, e uma gravação de
// duas horas tem uns 20 blocos.
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { acessoAoVideo } from "@/lib/media/piloto-do-servidor";
import { prisma } from "@/lib/db/prisma";
import type { Trecho } from "@/lib/media/select-clips";
import { trechosParaCortar } from "@/lib/media/decisao-dos-cortes";
import { assinarCorpo, CABECALHO_ASSINATURA } from "@/lib/media/worker-token";
import { MAX_TENTATIVAS } from "@/lib/media/video-state";
import { montarPedidoDeCorte } from "@/lib/media/pedido-de-corte";
import { gravarEdicaoDoPedido } from "@/lib/media/edicao-gravada";
import type { Word } from "@/lib/media/transcribe";
import { garantirRetomadasNoRoteiro, lerRoteiroDoVideo, roteiroLigado } from "@/lib/media/roteiro-da-edicao";

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
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {

  const base = process.env.VIDEO_WORKER_URL;
  if (!base) {
    return NextResponse.json(
      { error: "O worker de vídeo não está configurado." },
      { status: 503 }
    );
  }

  const { id } = await params;
  // Sessão do dono OU assinatura do piloto do servidor (ver piloto-do-servidor.ts).
  const acesso = await acessoAoVideo(req, id);
  if (!acesso) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const video = await prisma.videoJob.findFirst({
    where: acesso.where,
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
      project: { select: { videoStyle: true, videoMusicUrl: true, videoTerms: true, videoEstiloEscolha: true, colorPalette: true } },
      transcript: true,
      durationSec: true,
      projectId: true,
      finishedAt: true,
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

  // A PORTA DO ROTEIRO (30/09): com a tela de roteiro ligada, nada corta sem
  // o cliente ter aprovado. Vídeo que chegou a "selected" antes desta regra
  // (sem roteiro nenhum) segue como antes, para não travar quem estava no
  // meio da esteira no dia da publicação.
  const roteiro = await lerRoteiroDoVideo(id);
  // ZERO CORTES APROVADO É ZERO CORTES (06/10): com a decisão "só o completo"
  // gravada, a lista ao worker vai vazia mesmo que `clips` tenha algo.
  const trechos = trechosParaCortar((video.clips as unknown as Trecho[]) ?? [], roteiro);
  // SÓ O COMPLETO (02/10): o roteiro aprovado com zero cortes manda o worker
  // produzir só o vídeo completo (a lista de trechos vai vazia). Sem roteiro
  // aprovado, lista vazia continua sendo erro.
  if (!trechos.length && !roteiro?.aprovadoEm) {
    return NextResponse.json(
      { error: "Esse vídeo não tem trechos escolhidos." },
      { status: 400 }
    );
  }
  if (roteiro && !roteiro.aprovadoEm) {
    return NextResponse.json(
      { error: "O roteiro deste vídeo ainda não foi aprovado. Aprove na tela de roteiro e o corte começa." },
      { status: 409 }
    );
  }
  if (!roteiro && roteiroLigado() && !acesso.interno && video.status === "selected") {
    return NextResponse.json(
      { error: "Este vídeo precisa do roteiro antes do corte. O squad está montando." },
      { status: 409 }
    );
  }

  const tomado = await prisma.videoJob.updateMany({
    where: { id, status: video.status },
    data: {
      status: "cutting",
      startedAt: new Date(),
      attempts: { increment: 1 },
      error: null,
      // Vídeo que já tinha terminado e está sendo refeito: começa uma RODADA
      // nova, e a faixa do Gestor conta dela, não do envio original (30/09,
      // o "196:25" do vídeo de teste). O vídeo completo antigo fica onde está
      // até o novo chegar; quem o troca é o cortar-callback.
      ...(video.finishedAt ? { rodadaEm: new Date(), finishedAt: null } : {}),
    },
  });
  if (tomado.count === 0) {
    return NextResponse.json(
      { error: "O corte deste vídeo já começou.", jaEmAndamento: true },
      { status: 409 }
    );
  }

  const transcript = video.transcript as { words?: Word[] } | null;
  // Roteiro aprovado de antes das retomadas (03/10): a tomada refeita entra
  // na lista guardada antes do corte, uma vez (ver garantirRetomadasNoRoteiro).
  const aprovado = roteiro?.aprovadoEm ? ((await garantirRetomadasNoRoteiro(id)) ?? roteiro) : null;

  const { corpo, resumo } = await montarPedidoDeCorte(
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
      // O texto que o cliente leu e aprovou: sem limpeza por IA de novo.
      remocoesProntas: aprovado ? aprovado.remocoes : null,
      retomadasNasProntas: Boolean(aprovado?.retomadasFeitas),
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
    // A edição de cada trecho fica gravada para a Vera ler o texto FINAL
    // (depois da limpeza), e não a transcrição bruta. Ver edicao-gravada.ts.
    await gravarEdicaoDoPedido(id, corpo);
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
