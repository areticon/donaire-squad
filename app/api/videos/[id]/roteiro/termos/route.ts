export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { corrigirTermo, RecusaDoRoteiro } from "@/lib/media/roteiro-da-edicao";
import { corrigirTermoNaReedicao, reedicaoAberta } from "@/lib/media/reedicao";

/**
 * "Cloud" vira "Claude" (30/09): a troca vai para os termos do projeto
 * (legenda e fala de todo vídeo) e o texto do roteiro é refeito na hora, sem IA.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const corpo = (await req.json().catch(() => ({}))) as { errado?: string; certo?: string };
  if (!corpo.errado?.trim() || !corpo.certo?.trim()) {
    return NextResponse.json({ error: "Escreva como saiu e como é o certo." }, { status: 400 });
  }
  try {
    // Vídeo já aprovado com a edição reaberta (30/09): o rascunho de cada peça é refeito.
    const tela = (await reedicaoAberta(id))
      ? await corrigirTermoNaReedicao(id, userId, { errado: corpo.errado, certo: corpo.certo })
      : await corrigirTermo(id, userId, { errado: corpo.errado, certo: corpo.certo });
    return NextResponse.json({ tela });
  } catch (e) {
    if (e instanceof RecusaDoRoteiro) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(`[roteiro/termos][${id}]`, e);
    return NextResponse.json({ error: "Não consegui salvar a correção agora. Tente de novo." }, { status: 500 });
  }
}
