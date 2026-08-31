import { prisma } from "@/lib/db/prisma";
import type { Trecho } from "@/lib/media/select-clips";
import { DESTINO_COMPLETO } from "@/lib/media/destinos";
import { montarPostDeVideo } from "@/lib/media/youtube-post";

/**
 * Põe o vídeo completo no Gestor de Conteúdo: o rascunho de YouTube (título e
 * descrição com capítulos) e o card do Vitor, ligados.
 *
 * Vive fora da rota de agendamento porque desde 01/09 o completo pode chegar
 * DEPOIS do quadro montado: o worker avisa os cortes assim que ficam prontos
 * (211s medidos) e o completo quando termina de codificar (14 min no preset
 * antigo). Quem chama: o agendamento, quando o completo já existe; e o
 * callback do corte, quando ele chega atrasado. Idempotente nos dois: post
 * achado por metadata, card achado por metadata.
 */
export async function anexarCompletoAoQuadro(videoJobId: string): Promise<boolean> {
  const video = await prisma.videoJob.findUnique({
    where: { id: videoJobId },
    select: {
      id: true,
      projectId: true,
      completoUrl: true,
      blobUrl: true,
      durationSec: true,
      capaFonteUrl: true,
      clips: true,
      originalName: true,
      project: { select: { name: true } },
    },
  });
  if (!video?.completoUrl) return false;

  const run = await prisma.pipelineRun.findFirst({
    where: {
      projectId: video.projectId,
      archived: false,
      config: { path: ["videoJobId"], equals: video.id },
    },
    select: { id: true, weekStart: true },
  });
  if (!run) return false;

  const jaTemCard = await prisma.campaignCard.findFirst({
    where: {
      runId: run.id,
      cardType: "video_clip",
      metadata: { path: ["completo"], equals: true },
    },
    select: { id: true },
  });
  if (jaTemCard) return false;

  const trechos = (video.clips as unknown as Trecho[]) ?? [];
  const nome = (video.originalName ?? "Gravação").replace(/\.[^.]+$/, "");
  const segunda = run.weekStart ?? new Date();
  const data = new Date(segunda.getTime());
  data.setUTCHours(9, 0, 0, 0);

  const conteudo = montarPostDeVideo(trechos, video.durationSec ?? 0, video.project?.name ?? nome);
  let postId: string | null = null;
  // O filtro exige gravacaoCompleta: só videoJobId casava com os posts dos
  // CORTES de YouTube Shorts, e o card do completo saiu ligado ao post do
  // corte 0 no teste de 01/09 (sem capítulos, sem descrição, sem prévia).
  const rascunho = await prisma.post.findFirst({
    where: {
      projectId: video.projectId,
      platform: "youtube",
      AND: [
        { metadata: { path: ["videoJobId"], equals: video.id } },
        { metadata: { path: ["gravacaoCompleta"], equals: true } },
      ],
    },
    select: { id: true },
  });
  if (rascunho) {
    postId = rascunho.id;
  } else {
    const criado = await prisma.post.create({
      data: {
        projectId: video.projectId,
        platform: "youtube",
        content: conteudo,
        mediaType: "video",
        imageUrl: video.blobUrl,
        status: "draft",
        runId: run.id,
        dayOfWeek: 1,
        scheduledAt: data,
        metadata: {
          origem: "video",
          videoJobId: video.id,
          gravacaoCompleta: true,
          capitulos: trechos.length,
        },
      },
      select: { id: true },
    });
    postId = criado.id;
  }

  await prisma.campaignCard.create({
    data: {
      runId: run.id,
      projectId: video.projectId,
      agentId: "vitor-video",
      agentName: "Vitor Vídeo",
      dayOfWeek: 1,
      scheduledDate: data,
      cardType: "video_clip",
      mediaType: "video",
      content: `${nome}, gravação completa editada`,
      mediaUrl: `/api/videos/${video.id}/midia?tipo=completo`,
      status: "pending",
      postId,
      metadata: {
        destino: DESTINO_COMPLETO.id,
        destinoRotulo: DESTINO_COMPLETO.rotulo,
        completo: true,
        videoJobId: video.id,
        thumb: video.capaFonteUrl ? `/api/videos/${video.id}/midia?tipo=capa-fonte` : null,
      },
    },
  });
  return true;
}
