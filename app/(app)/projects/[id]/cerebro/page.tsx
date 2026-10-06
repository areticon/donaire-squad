import { auth } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { carregarCerebro } from "@/lib/cerebro/carregar";
import { GrafoDoCerebro } from "@/components/cerebro/grafo-do-cerebro";

/**
 * O SEGUNDO CÉREBRO DO PROJETO (06/10/2026): a tela igual ao Donaire Brains do
 * Bruno, com tudo o que foi pedido, aprovado, recusado e decidido aqui, em
 * notas ligadas. O dono corrige, apaga e baixa a cópia; o membro consulta.
 */
export const dynamic = "force-dynamic";

export default async function CerebroPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!project || !(await podeUsarProjeto(userId, project))) redirect("/projects");
  const cerebro = await carregarCerebro(id);
  if (!cerebro) redirect("/projects");
  return <GrafoDoCerebro projectId={id} inicial={cerebro} souDono={project.userId === userId} />;
}
