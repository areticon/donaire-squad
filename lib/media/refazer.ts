import { get, put } from "@vercel/blob";
import { prisma } from "@/lib/db/prisma";
import { montarPedidoDeCorte } from "@/lib/media/pedido-de-corte";
import { assinarCorpo, CABECALHO_ASSINATURA } from "@/lib/media/worker-token";
import { comporCapa, type Expressao } from "@/lib/media/capa-e-titulo";
import { dataUrlToBuffer } from "@/lib/media/nano-banana";
import type { Word } from "@/lib/media/transcribe";
import type { Trecho } from "@/lib/media/select-clips";

/**
 * Os ajustes que o cliente pede depois de assistir: recomeçar o corte uns
 * segundos depois, terminar antes, refazer a capa com uma instrução.
 *
 * Nasceu do pedido do Bruno em 01/09: "o meu segundo corte começou um
 * pouquinho fora; se tivesse um controle igual tem no CapCut eu cortaria o
 * início... quero que o usuário interaja com os agentes pedindo ajustes".
 *
 * O re-corte manda ao worker um pedido SÓ com o trecho ajustado
 * (`soTrechos`), montado pelo MESMO `montarPedidoDeCorte` de produção, então
 * limpeza, legenda e estilo continuam idênticos; o completo não é refeito. O
 * callback funde só a mídia daquele índice, sem tocar em aprovação nem posts.
 */

type ClipEmEdicao = Trecho & {
  midia?: Record<string, unknown> | null;
};

const DURACAO_MINIMA = 10;

export async function refazerCorte(
  videoJobId: string,
  userId: string,
  indice: number,
  ajuste: { inicioDelta?: number; fimDelta?: number }
): Promise<{ inicio: number; fim: number }> {
  const base = process.env.VIDEO_WORKER_URL;
  if (!base) throw new Error("A edição de vídeo não está disponível agora.");

  const video = await prisma.videoJob.findFirst({
    where: { id: videoJobId, project: { userId } },
    select: {
      id: true,
      blobUrl: true,
      durationSec: true,
      projectId: true,
      clips: true,
      transcript: true,
      project: { select: { videoStyle: true, videoMusicUrl: true, videoTerms: true } },
    },
  });
  if (!video) throw new Error("Vídeo não encontrado.");

  const trechos = (video.clips as unknown as ClipEmEdicao[]) ?? [];
  const alvo = trechos[indice];
  if (!alvo) throw new Error("Esse corte não existe.");

  const duracaoTotal = video.durationSec ?? 0;
  const inicioNovo = Math.max(0, alvo.inicio + (ajuste.inicioDelta ?? 0));
  const fimNovo = Math.min(duracaoTotal || alvo.fim, alvo.fim + (ajuste.fimDelta ?? 0));
  if (fimNovo - inicioNovo < DURACAO_MINIMA) {
    throw new Error(`O corte ficaria com menos de ${DURACAO_MINIMA} segundos.`);
  }

  trechos[indice] = {
    ...alvo,
    inicio: inicioNovo,
    fim: fimNovo,
    midia: { ...(alvo.midia ?? {}), refazendo: true },
  };
  await prisma.videoJob.update({
    where: { id: video.id },
    data: { clips: trechos as never },
  });

  const transcript = video.transcript as { words?: Word[] } | null;
  const { corpo } = await montarPedidoDeCorte(
    {
      id: video.id,
      blobUrl: video.blobUrl,
      durationSec: duracaoTotal,
      projectId: video.projectId,
      trechos: trechos as unknown as Trecho[],
      palavras: transcript?.words ?? [],
      estilo: video.project?.videoStyle ?? null,
      musicaUrl: video.project?.videoMusicUrl ?? null,
      termos: video.project?.videoTerms ?? null,
    },
    { appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://demandou.com" }
  );

  const pedido = JSON.parse(corpo) as { trechos: Array<{ indice: number }> } & Record<string, unknown>;
  pedido.trechos = pedido.trechos.filter((t) => t.indice === indice);
  // O worker pula o completo e o aviso parcial; o callback trata como fusão.
  pedido.soTrechos = true;
  pedido.reCorte = true;

  const texto = JSON.stringify(pedido);
  const res = await fetch(`${base.replace(/\/$/, "")}/cortar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [CABECALHO_ASSINATURA]: assinarCorpo(texto),
    },
    body: texto,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error("O estúdio de vídeo não aceitou o pedido agora. Tente de novo.");
  return { inicio: inicioNovo, fim: fimNovo };
}

export async function refazerCapa(
  videoJobId: string,
  userId: string,
  indice: number,
  instrucao: string
): Promise<string> {
  const video = await prisma.videoJob.findFirst({
    where: { id: videoJobId, project: { userId } },
    select: {
      id: true,
      clips: true,
      capaFonteUrl: true,
      projectId: true,
      project: { select: { niche: true } },
    },
  });
  if (!video) throw new Error("Vídeo não encontrado.");

  const trechos = (video.clips as unknown as Array<
    ClipEmEdicao & { texto?: { fraseDaCapa?: string; expressao?: string; cenario?: string } }
  >) ?? [];
  const alvo = trechos[indice];
  if (!alvo?.texto?.fraseDaCapa) throw new Error("Esse corte ainda não tem capa para refazer.");

  const quadro =
    video.capaFonteUrl ?? (alvo.midia?.capa as { url?: string } | undefined)?.url;
  if (!quadro) throw new Error("Não encontrei o quadro base da capa.");

  const blob = await get(quadro, {
    access: "private",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  if (!blob || blob.statusCode !== 200) throw new Error("Não consegui ler o quadro base.");
  const bytes = Buffer.from(await new Response(blob.stream).arrayBuffer());

  const arte = await comporCapa(bytes.toString("base64"), alvo.texto.fraseDaCapa, {
    expressao: alvo.texto.expressao as Expressao | undefined,
    cenario: alvo.texto.cenario,
    nicho: video.project?.niche,
    formato: "9:16",
    ajuste: instrucao,
    usageCtx: { projectId: video.projectId },
  });
  if (!arte) throw new Error("A capa nova não saiu desta vez. Tente descrever o ajuste de outro jeito.");

  const { url } = await put(
    `cortes/${video.id}/capa-arte-${indice}.jpg`,
    dataUrlToBuffer(arte),
    {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      contentType: "image/jpeg",
      addRandomSuffix: true,
    }
  );

  trechos[indice] = {
    ...alvo,
    midia: { ...(alvo.midia ?? {}), capaArte: { url } },
  };
  await prisma.videoJob.update({
    where: { id: video.id },
    data: { clips: trechos as never },
  });
  return url;
}
