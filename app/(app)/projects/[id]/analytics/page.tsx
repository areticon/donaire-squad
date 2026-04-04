import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || project.userId !== userId) redirect("/dashboard");

  const posts = await prisma.post.findMany({
    where: { projectId: id, status: "published" },
    include: { metrics: true },
    orderBy: { publishedAt: "desc" },
  });

  const recentRuns = await prisma.pipelineRun.findMany({
    where: { projectId: id },
    orderBy: { startedAt: "desc" },
    take: 10,
    select: {
      id: true,
      topic: true,
      status: true,
      config: true,
      startedAt: true,
      endedAt: true,
      _count: { select: { posts: true } },
    },
  });

  return (
    <AnalyticsDashboard
      project={{ id: project.id, name: project.name }}
      posts={posts}
      recentRuns={recentRuns}
    />
  );
}
