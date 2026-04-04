import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { TrainingPanel } from "@/components/training/training-panel";

export default async function TrainingPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { contexts: { orderBy: { createdAt: "desc" } } },
  });

  if (!project || project.userId !== userId) redirect("/projects");

  return <TrainingPanel project={project} initialContexts={project.contexts} />;
}
