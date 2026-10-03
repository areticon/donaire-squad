import { auth } from "@/lib/auth/server";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { PortasDoProjeto } from "@/components/criar/portas-do-projeto";
import { podeUsarProjeto } from "@/lib/equipe/conta";

/** A aba Criar: as três portas de entrada do projeto (29/09). */
export default async function CriarPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id }, select: { id: true, userId: true, status: true } });
  if (!project || !(await podeUsarProjeto(userId, project))) notFound();
  // Projeto ainda no setup não tem por onde criar: o assistente vem antes.
  if (project.status !== "active") redirect(`/projects/${id}`);

  return (
    <div className="px-4 py-10 lg:px-8">
      <PortasDoProjeto projectId={id} />
    </div>
  );
}
