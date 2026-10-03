export const dynamic = "force-dynamic";
// "Outra ideia" chama o diretor para uma cena (esforço baixo, ~20 a 60 s).
export const maxDuration = 180;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { SaldoInsuficiente } from "@/lib/credits";
import { ajustarCena, RecusaDoRoteiro, type AcaoNaCena } from "@/lib/media/roteiro-da-edicao";
import { ajustarCenaNaReedicao, reedicaoAberta } from "@/lib/media/reedicao";

/**
 * O cliente mexe numa cena do roteiro (30/09): tira o efeito, reescreve a
 * ideia, desfaz, ou pede outra ideia ao diretor (a única que custa, e o botão
 * diz quanto antes do clique). Devolve a tela inteira, já com a mudança.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const corpo = (await req.json().catch(() => ({}))) as Partial<AcaoNaCena>;
  if (!corpo.alvo || typeof corpo.cena !== "number" || !corpo.acao) {
    return NextResponse.json({ error: "Pedido incompleto." }, { status: 400 });
  }
  try {
    // Vídeo já aprovado com a edição reaberta (30/09): a mudança vai para o rascunho.
    const tela = (await reedicaoAberta(id)) ? await ajustarCenaNaReedicao(id, userId, corpo as AcaoNaCena) : await ajustarCena(id, userId, corpo as AcaoNaCena);
    return NextResponse.json({ tela });
  } catch (e) {
    if (e instanceof RecusaDoRoteiro) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof SaldoInsuficiente) return NextResponse.json({ error: e.message }, { status: 402 });
    console.error(`[roteiro/cena][${id}]`, e);
    // O motivo técnico fica no log; o cliente recebe o que fazer.
    return NextResponse.json({ error: "Não consegui trocar esta cena agora. Tente de novo em um minuto." }, { status: 500 });
  }
}
