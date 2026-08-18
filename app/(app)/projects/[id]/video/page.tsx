import { auth } from "@/lib/auth/server";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { VideoPanel } from "@/components/video/video-panel";

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
      clips: true,
    },
  });

  return (
    <VideoPanel
      projectId={project.id}
      videos={videos.map((v) => ({
        ...v,
        createdAt: v.createdAt.toISOString(),
        clips: (v.clips as never) ?? null,
      }))}
    />
  );
}
