import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { KanbanBoard } from "@/components/kanban/kanban-board";

export default async function ProjectPage({
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
      agents: true,
      socialAccounts: true,
      _count: { select: { posts: true, runs: true } },
    },
  });

  if (!project || project.userId !== userId) notFound();

  if (project.status === "active") {
    redirect(`/projects/${id}/posts`);
  }

  return <KanbanBoard project={project} />;
}
