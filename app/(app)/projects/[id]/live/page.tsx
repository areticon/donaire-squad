import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { ContentManager } from "@/components/content/content-manager";

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
      socialAccounts: { where: { isActive: true }, select: { id: true, platform: true, displayName: true } },
    },
  });

  if (!project || project.userId !== userId) notFound();

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
    />
  );
}
