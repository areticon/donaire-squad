export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { cancelarPeca } from "@/lib/pipeline/cancelar-campanha";

/**
 * "CANCELAR ESTA PEÇA" (05/10/2026): o cliente tira do quadro uma peça que
 * ainda não saiu, pelo cartão da semana ou pela janela do card.
 *
 * O `id` é o do card principal da peça; `postIds` são os posts dela (os
 * destinos que a tela já agrupa) que também saem da fila se ainda não
 * foram publicados. Só com sessão e com o projeto liberado para a pessoa;
 * a regra e o aviso no sino moram em lib/pipeline/cancelar-campanha.ts.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { postIds?: unknown };
  const postIds = Array.isArray(body.postIds) ? body.postIds.filter((p): p is string => typeof p === "string") : [];
  try {
    const r = await cancelarPeca(id, userId, postIds);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json(r);
  } catch (e) {
    console.error(`[cancelar-peca][${id}]`, e);
    return NextResponse.json({ error: "Não consegui cancelar agora. Nada mudou: tente de novo em instantes." }, { status: 500 });
  }
}
