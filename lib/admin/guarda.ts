import { currentUser } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import type { Admin } from "@/lib/admin/acoes";

/**
 * Quem está chamando é admin? O papel é lido do BANCO a cada chamada, e não da
 * sessão: tirar o acesso de alguém precisa valer no clique seguinte, e não
 * quando a sessão dele expirar.
 */
export async function exigirAdmin(): Promise<Admin | null> {
  const user = await currentUser();
  if (!user) return null;
  const eu = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true, email: true, role: true } });
  return eu?.role === "admin" ? { id: eu.id, email: eu.email } : null;
}
