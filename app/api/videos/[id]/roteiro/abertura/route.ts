export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { ajustarAbertura, RecusaDoRoteiro, type AcaoNaAbertura } from "@/lib/media/roteiro-da-edicao";

/**
 * A abertura com os melhores momentos na tela de roteiro (01/10): trocar ou
 * tirar um momento do completo, pôr mais um, desligar a abertura inteira, e
 * trocar ou desligar o gancho de um corte. Nada aqui chama IA (as frases de
 * reserva vieram na escolha do diretor); devolve a tela inteira já refeita.
 */
const ACOES = new Set(["trocar", "tirar", "acrescentar", "desligar", "ligar"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const corpo = (await req.json().catch(() => ({}))) as Partial<AcaoNaAbertura>;
  if ((corpo.alvo !== "completo" && corpo.alvo !== "corte") || !corpo.acao || !ACOES.has(corpo.acao)) {
    return NextResponse.json({ error: "Pedido incompleto." }, { status: 400 });
  }
  try {
    const tela = await ajustarAbertura(id, userId, corpo as AcaoNaAbertura);
    return NextResponse.json({ tela });
  } catch (e) {
    if (e instanceof RecusaDoRoteiro) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(`[roteiro/abertura][${id}]`, e);
    return NextResponse.json({ error: "Não consegui mudar a abertura agora. Tente de novo em um minuto." }, { status: 500 });
  }
}
