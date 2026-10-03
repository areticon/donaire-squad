export const dynamic = "force-dynamic";
// A limpeza da gravação inteira (~30 s por bloco de 800 palavras, em paralelo)
// e o diretor em texto (1 a 3 min por chamada, até duas rodadas). O trabalho
// para de COMEÇAR diretor novo aos 150 s; o que já começou termina dentro do
// teto. Vídeo longo continua numa nova chamada (re-despacho no fim).
export const maxDuration = 800;

import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { acessoAoVideo, despacharPasso } from "@/lib/media/piloto-do-servidor";
import { MAX_TENTATIVAS } from "@/lib/media/video-state";
import { cobrarPrimeiraParte, lerRoteiroDoVideo, prepararRoteiro } from "@/lib/media/roteiro-da-edicao";
import { SaldoInsuficiente } from "@/lib/credits";
// O aviso do roteiro pronto (sino e e-mail, uma vez por rodada) mora em
// lib/notificacoes desde 02/10: o observador do cron confere o mesmo fato, e a
// chave única garante um e-mail só.
import { avisarRoteiroPronto } from "@/lib/notificacoes/avisos";

/**
 * O ROTEIRO (30/09): depois da seleção, a esteira para aqui. Limpa a fala da
 * gravação inteira, planeja em texto as cenas dos cortes candidatos e as
 * inserções do completo, e deixa o vídeo em "roteiro" esperando o cliente
 * aprovar na tela `/projects/[id]/video/[videoId]/roteiro`. Nada de imagem,
 * cena gerada, corte no worker ou montagem antes disso.
 *
 * Quem chama: o piloto do servidor (a seleção despacha o passo "roteiro"), a
 * cura da tela (vídeo parado em "selected" sem roteiro) e o botão "tentar de
 * novo" de uma falha. A continuação do vídeo longo chega assinada, com o vídeo
 * ainda em "roteirizando".
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acesso = await acessoAoVideo(req, id);
  if (!acesso) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const video = await prisma.videoJob.findFirst({
    where: acesso.where,
    select: { id: true, status: true, attempts: true, startedAt: true, userId: true, projectId: true, durationSec: true, sizeBytes: true, clips: true },
  });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });

  const trechos = Array.isArray(video.clips) ? video.clips.length : 0;
  if (!trechos) return NextResponse.json({ error: "Esse vídeo ainda não tem cortes escolhidos." }, { status: 400 });
  const r = await lerRoteiroDoVideo(id);
  if (r?.aprovadoEm) return NextResponse.json({ error: "Este roteiro já foi aprovado." }, { status: 409 });

  // Continuação (só o servidor): o vídeo segue em "roteirizando" e o prazo
  // renova. Início ou nova tentativa: toma de "selected" ou "failed".
  const continuacao = acesso.interno && video.status === "roteirizando";
  if (!continuacao) {
    if (video.status !== "selected" && video.status !== "failed") {
      return NextResponse.json({ error: `Vídeo está em "${video.status}". O roteiro sai depois da escolha dos cortes.` }, { status: 409 });
    }
    if (video.attempts >= MAX_TENTATIVAS) {
      return NextResponse.json({ error: "Esta etapa já falhou vezes demais. Fale com o suporte." }, { status: 409 });
    }
  }
  const tomado = await prisma.videoJob.updateMany({
    where: continuacao ? { id, status: "roteirizando", startedAt: video.startedAt } : { id, status: video.status },
    data: continuacao
      ? { startedAt: new Date() }
      : { status: "roteirizando", startedAt: new Date(), attempts: { increment: 1 }, error: null },
  });
  if (tomado.count === 0) return NextResponse.json({ error: "O roteiro deste vídeo já está sendo montado.", jaEmAndamento: true }, { status: 409 });

  // A primeira parte normalmente já foi cobrada na seleção; aqui é a rede para
  // o vídeo que chegou a "selected" por outro caminho. Idempotente.
  try {
    await cobrarPrimeiraParte(video);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao cobrar";
    await prisma.videoJob.update({ where: { id }, data: { status: "failed", startedAt: null, error: message } });
    return NextResponse.json({ error: message }, { status: err instanceof SaldoInsuficiente ? 402 : 500 });
  }

  try {
    const resultado = await prepararRoteiro(id, { orcamentoMs: 150_000 });
    if (resultado.estado === "continuar") {
      after(() => despacharPasso(id, "roteiro"));
      return NextResponse.json({ ok: true, continuar: true, ...resultado });
    }
    const pronto = await prisma.videoJob.updateMany({
      where: { id, status: "roteirizando" },
      data: { status: "roteiro", startedAt: null, attempts: 0, error: null },
    });
    // O CLIENTE JÁ SAIU DA FRENTE (30/09, pedido do Bruno): quem sobe um vídeo
    // de 22 min vai para uma reunião. Sem aviso fora da tela, o roteiro fica
    // esperando sem ninguém saber que ainda há o que fazer. Um e-mail, uma vez.
    if (pronto.count > 0) after(() => avisarRoteiroPronto(id));
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao montar o roteiro";
    console.error(`[roteiro][${id}]`, err);
    await prisma.videoJob.updateMany({
      where: { id, status: "roteirizando" },
      data: { status: "failed", startedAt: null, error: `Não consegui montar o roteiro desta vez. Nada foi gerado nem cobrado a mais: dá para tentar de novo. (${message.slice(0, 120)})` },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
