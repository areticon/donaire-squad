export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { RecusaDoRoteiro } from "@/lib/media/roteiro-da-edicao";
import { gravarSugestao, type PedidoDeSugestao } from "@/lib/media/sugestoes-do-completo";

/**
 * "Sugerir ajuste ou efeito" numa cena do vídeo completo (05/10) ou de um
 * corte (`trecho`, 06/10): grava o texto curto no roteiro, sem IA e sem
 * custo; texto vazio tira a sugestão. Na montagem, o pedido numa cena é lei.
 * Devolve a tela inteira já refeita.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const corpo = (await req.json().catch(() => ({}))) as Partial<PedidoDeSugestao>;
  if (typeof corpo.inicio !== "number" || typeof corpo.fim !== "number") {
    return NextResponse.json({ error: "Pedido incompleto." }, { status: 400 });
  }
  try {
    const tela = await gravarSugestao(id, userId, { inicio: corpo.inicio, fim: corpo.fim, texto: String(corpo.texto ?? ""), trecho: typeof corpo.trecho === "number" ? corpo.trecho : null });
    return NextResponse.json({ tela });
  } catch (e) {
    if (e instanceof RecusaDoRoteiro) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(`[roteiro/sugestao][${id}]`, e);
    return NextResponse.json({ error: "Não consegui guardar a sugestão agora. Tente de novo em um minuto." }, { status: 500 });
  }
}
