import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { AgentsConfig } from "@/components/agents/agents-config";

export default async function AgentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: { agents: { orderBy: { createdAt: "asc" } } },
  });

  if (!project || project.userId !== userId) notFound();

  // Normalize JsonValue arrays to unknown[]
  const agents = project.agents.map((a) => ({
    ...a,
    skills: Array.isArray(a.skills) ? a.skills : [],
    tasks: Array.isArray(a.tasks) ? a.tasks : [],
  }));

  return <AgentsConfig project={project} agents={agents} />;
}
