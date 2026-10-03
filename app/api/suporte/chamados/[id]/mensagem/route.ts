export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { RecusaDoChamado, mensagemDoCliente } from "@/lib/suporte/chamados";

type Ctx = { params: Promise<{ id: string }> };

/** A pessoa complementa o próprio chamado (resolvido volta a aberto). */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { texto } = (await req.json().catch(() => ({}))) as { texto?: string };
  try {
    return NextResponse.json(await mensagemDoCliente(userId, id, String(texto ?? "")));
  } catch (e) {
    if (e instanceof RecusaDoChamado) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
