import { headers } from "next/headers";
import { auth as authInstance } from "@/lib/auth";

/**
 * Drop-in replacement para o `auth()` do Clerk.
 * Mesma assinatura de retorno usada nas rotas: `const { userId } = await auth()`.
 */
export async function auth(): Promise<{ userId: string | null }> {
  const session = await authInstance.api.getSession({
    headers: await headers(),
  });
  return { userId: session?.user?.id ?? null };
}

/**
 * Drop-in replacement para o `currentUser()` do Clerk.
 * Retorna o usuário da sessão ativa ou null.
 */
export async function currentUser() {
  const session = await authInstance.api.getSession({
    headers: await headers(),
  });
  return session?.user ?? null;
}
