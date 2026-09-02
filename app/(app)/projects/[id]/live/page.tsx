import { auth } from "@/lib/auth/server";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { ContentManager } from "@/components/content/content-manager";
import { whereSocialAccountCanPublish } from "@/lib/social/account-filters";
import { varrerExpirados } from "@/lib/media/video-sweep";
import { estaTrabalhando } from "@/lib/media/video-state";

function getMonday(d: Date): Date {
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + diff * 86400000);
}

export default async function LivePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      socialAccounts: {
        where: whereSocialAccountCanPublish,
        select: { id: true, platform: true, displayName: true, accountType: true },
      },
    },
  });

  if (!project || project.userId !== userId) notFound();

  // Antes de mostrar qualquer coisa, declara mortos os trabalhos que passaram
  // do prazo. Quem abre a tela é o relógio do sistema: trabalho derrubado pela
  // plataforma não consegue gravar o próprio erro, então sem isto ele ficaria
  // "rodando" para sempre. A varredura veio junto com o processo de vídeo, que
  // desde 02/09 acontece aqui e não numa tela própria.
  await varrerExpirados(id);

  const videos = await prisma.videoJob.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      status: true,
      error: true,
      attempts: true,
      durationSec: true,
      createdAt: true,
      startedAt: true,
      originalName: true,
      completoUrl: true,
      clips: true,
    },
  });

  // Load cards for the current week (UTC-safe)
  const monday = getMonday(new Date());
  const sunday = new Date(monday.getTime() + 6 * 86400000);
  sunday.setUTCHours(23, 59, 59, 999);

  const cards = await prisma.campaignCard.findMany({
    where: {
      projectId: id,
      scheduledDate: { gte: monday, lte: sunday },
      run: { archived: false },
    },
    orderBy: [{ dayOfWeek: "asc" }, { createdAt: "asc" }],
  });

  // Check for active running pipeline or recent failed/cancelled run
  const [activeRun, lastFailedRun] = await Promise.all([
    prisma.pipelineRun.findFirst({
      where: { projectId: id, status: "running" },
      orderBy: { startedAt: "desc" },
    }),
    prisma.pipelineRun.findFirst({
      where: { projectId: id, status: { in: ["failed", "cancelled"] }, archived: false },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  const serializeRun = (r: NonNullable<typeof activeRun>) => ({
    id: r.id,
    status: r.status,
    topic: r.topic,
    campaignMode: r.campaignMode,
    weekStart: r.weekStart?.toISOString() ?? null,
  });

  return (
    <ContentManager
      projectId={id}
      projectName={project.name}
      socialAccounts={project.socialAccounts}
      initialCards={cards.map((c) => ({
        ...c,
        scheduledDate: c.scheduledDate?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
        chatHistory: Array.isArray(c.chatHistory) ? (c.chatHistory as { role: "user" | "assistant"; content: string; timestamp: string }[]) : [],
      }))}
      activeRun={activeRun ? serializeRun(activeRun) : null}
      lastFailedRun={lastFailedRun ? serializeRun(lastFailedRun) : null}
      videos={videos.map((v) => {
        const trechos = (Array.isArray(v.clips) ? v.clips : []) as Array<{
          publicar?: boolean;
          posts?: unknown;
          midia?: { vertical?: unknown };
        }>;
        const comMidia = trechos.filter((t) => t.midia?.vertical);
        return {
          id: v.id,
          status: v.status,
          error: v.error,
          attempts: v.attempts,
          durationSec: v.durationSec,
          criadoEm: v.createdAt.toISOString(),
          originalName: v.originalName,
          trechosEscolhidos: trechos.length,
          cortesProntos: comMidia.length,
          cortesQueVaoAoAr: comMidia.filter((t) => t.publicar !== false).length,
          temTranscricao: v.durationSec !== null,
          temTrechos: trechos.length > 0,
          temCortes: comMidia.length > 0,
          temTrechosComPosts: trechos.some((t) => t.posts),
          temCompleto: Boolean(v.completoUrl),
          // Nulo aqui de propósito: o cronômetro da faixa conta do envio, e a
          // primeira consulta traz o resto. Ler o relógio na renderização do
          // servidor a tornaria impura.
          rodandoHaSegundos:
            estaTrabalhando(v.status) && v.startedAt
              ? Math.max(0, Math.round((Date.now() - v.startedAt.getTime()) / 1000))
              : null,
        };
      })}
      videoEstilo={project.videoStyle}
      videoMusica={project.videoMusicName}
      videoTermos={project.videoTerms}
    />
  );
}
