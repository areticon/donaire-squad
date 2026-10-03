export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { planoDoUsuario } from "@/lib/plano-do-usuario";

/**
 * O resumo do plano para a faixa do topo se atualizar sozinha (28/09).
 *
 * A faixa era só de servidor, e o layout não se redesenha ao trocar de tela:
 * o Bruno virou cliente Pro, continuou vendo "Acesso interno" e o saldo antigo
 * na aba aberta, e concluiu que a cobrança não funcionava. A faixa agora pede
 * este resumo a cada minuto e quando a aba volta ao foco.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await planoDoUsuario(userId));
}
