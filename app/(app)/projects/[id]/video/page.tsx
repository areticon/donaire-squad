import { auth } from "@/lib/auth/server";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { VideoPanel } from "@/components/video/video-panel";
import { varrerExpirados } from "@/lib/media/video-sweep";

export default async function VideoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, userId },
    select: { id: true, name: true },
  });
  if (!project) notFound();

  // Antes de mostrar qualquer coisa, declara mortos os trabalhos que passaram
  // do prazo. Quem abre a tela é o relógio do sistema: trabalho derrubado pela
  // plataforma não consegue gravar o próprio erro, então sem isto ele ficaria
  // "rodando" para sempre, que é exatamente o bug que esta tela expôs em 22/08.
  await varrerExpirados(id);

  const videos = await prisma.videoJob.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      status: true,
      originalName: true,
      durationSec: true,
      error: true,
      creditsCharged: true,
      createdAt: true,
      attempts: true,
      clips: true,
      // A transcrição inteira passa de 390 KB num vídeo de 27 minutos, e aqui
      // só interessa se ela existe. `durationSec` serve de sinal porque é
      // gravado na MESMA escrita que a transcrição, nos dois caminhos (direto e
      // por callback), então não há estado em que um exista sem o outro.
    },
  });

  return (
    <VideoPanel
      projectId={project.id}
      videos={videos.map((v) => ({
        id: v.id,
        status: v.status,
        originalName: v.originalName,
        durationSec: v.durationSec,
        error: v.error,
        creditsCharged: v.creditsCharged,
        createdAt: v.createdAt.toISOString(),
        attempts: v.attempts,
        temTranscricao: v.durationSec !== null,
        temTrechos: Array.isArray(v.clips) && v.clips.length > 0,
        // Nulo de propósito: o cronômetro chega na primeira consulta de
        // status, que acontece assim que a tela monta. Ler o relógio aqui
        // tornaria a renderização impura (o mesmo componente daria resultados
        // diferentes a cada render), e o relógio do navegador não serve de
        // substituto porque mente quando a máquina está dessincronizada.
        rodandoHaSegundos: null,
        clips: (v.clips as never) ?? null,
      }))}
    />
  );
}
