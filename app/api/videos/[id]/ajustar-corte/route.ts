export const dynamic = "force-dynamic";
// Monta o pedido com o código de produção (a limpeza roda de novo no trecho),
// então precisa da folga das outras rotas de vídeo.
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { refazerCorte } from "@/lib/media/refazer";

/**
 * O ajuste fino que o Bruno pediu em 01/09 ("igual tem no CapCut"): recomeçar
 * o corte uns segundos depois, terminar antes. A tela manda deltas; o trecho é
 * refeito no worker com o MESMO pipeline do corte original, e o resto do vídeo
 * não é tocado.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const corpo = (await req.json().catch(() => ({}))) as {
    trecho?: number;
    inicioDelta?: number;
    fimDelta?: number;
  };
  if (typeof corpo.trecho !== "number") {
    return NextResponse.json({ error: "Informe o corte." }, { status: 400 });
  }
  const limitado = (n: unknown) =>
    Math.max(-30, Math.min(30, typeof n === "number" && Number.isFinite(n) ? n : 0));

  try {
    const novo = await refazerCorte(id, userId, corpo.trecho, {
      inicioDelta: limitado(corpo.inicioDelta),
      fimDelta: limitado(corpo.fimDelta),
    });
    return NextResponse.json({ ok: true, ...novo });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Não consegui ajustar agora." },
      { status: 400 }
    );
  }
}
