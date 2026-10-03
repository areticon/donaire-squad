import { auth } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { projetoVisivel } from "@/lib/equipe/conta";
import { prisma } from "@/lib/db/prisma";

/**
 * O item "Linha editorial" da barra lateral (29/09, pedido do Bruno). A barra
 * é da conta, e a linha editorial é de um projeto: leva para a do projeto ativo
 * mexido por último. Sem projeto ativo, para a lista de projetos.
 */
export default async function LinhaEditorialDaConta() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const projeto = await prisma.project.findFirst({
    // Dono ou membro da equipe (01/10).
    where: { ...projetoVisivel(userId), status: "active" },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  redirect(projeto ? `/projects/${projeto.id}/linha-editorial` : "/projects");
}
