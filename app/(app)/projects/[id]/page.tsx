import { auth } from "@/lib/auth/server";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { podeUsarProjeto } from "@/lib/equipe/conta";

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
      // Sem os tokens (01/10): o projeto inteiro desce para o componente de
      // cliente, e com `true` o accessToken e o refreshToken iam no HTML.
      socialAccounts: { select: { id: true, platform: true, isActive: true } },
      _count: { select: { posts: true, runs: true } },
    },
  });

  if (!project || !(await podeUsarProjeto(userId, project))) notFound();

  // O projeto ativo abre na aba Criar desde 29/09 (as três portas de entrada).
  if (project.status === "active") {
    redirect(`/projects/${id}/criar`);
  }

  return <KanbanBoard project={project} />;
}
