export const dynamic = "force-dynamic";
// Uma reescrita curta pelo Sonnet e uma pergunta ao JEV (segundos).
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { ajustarElementoDaJornada, RecusaDoRoteiro, type AcaoNoElemento } from "@/lib/media/roteiro-da-edicao";

/**
 * O PASSO 5 DA JORNADA (E3, EDITOR_JORNADA=1): o cliente revisa o plano
 * elemento a elemento. "mudar" (texto livre: o JEV decide a intenção, o Sonnet
 * reescreve a descrição e ela volta na tela antes de aprovar), "remover",
 * "restaurar" ou "novo" (um elemento pedido num momento sem elemento).
 * Devolve a tela inteira.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const corpo = (await req.json().catch(() => ({}))) as Partial<AcaoNoElemento>;
  if (!corpo.acao || !["mudar", "remover", "restaurar", "novo"].includes(corpo.acao)) return NextResponse.json({ error: "Pedido incompleto." }, { status: 400 });
  try {
    const tela = await ajustarElementoDaJornada(id, userId, corpo as AcaoNoElemento);
    return NextResponse.json({ tela });
  } catch (e) {
    if (e instanceof RecusaDoRoteiro) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(`[roteiro/elemento][${id}]`, e);
    return NextResponse.json({ error: "Não consegui mudar este elemento agora. Tente de novo em um minuto." }, { status: 500 });
  }
}
