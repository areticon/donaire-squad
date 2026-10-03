export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { RecusaDaEquipe, convidar, equipeNaTela } from "@/lib/equipe/convites";

/**
 * A EQUIPE DA CONTA (01/10/2026).
 *
 * GET: o painel de consumo do dono (acessos, cota da conta, cada membro com o
 * que gastou no mês), ou o resumo de quem é membro.
 * POST: convida uma pessoa (só o dono). Responde com o link do convite, para
 * o dono mandar por outro canal se o e-mail não chegar.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await equipeNaTela(userId));
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const r = await convidar(userId, {
      email: corpo.email,
      nome: corpo.nome,
      projetos: corpo.projetos,
      todosOsProjetos: corpo.todosOsProjetos,
      tetoGravacoes: corpo.tetoGravacoes,
      tetoCreditos: corpo.tetoCreditos,
    });
    return NextResponse.json({ ok: true, ...r, equipe: await equipeNaTela(userId) });
  } catch (e) {
    if (e instanceof RecusaDaEquipe) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[equipe/convidar]", e);
    return NextResponse.json({ error: "Não consegui mandar o convite agora. Tente de novo em um minuto." }, { status: 500 });
  }
}
