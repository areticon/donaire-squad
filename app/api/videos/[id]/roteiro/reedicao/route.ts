export const dynamic = "force-dynamic";
// Mover a borda refaz a fala do corte (sem IA); refazer manda ao worker.
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { SaldoInsuficiente } from "@/lib/credits";
import { RecusaDoRoteiro } from "@/lib/media/roteiro-da-edicao";
import { abrirReedicao, descartarReedicao, moverBordaNaReedicao, refazerComAjustes } from "@/lib/media/reedicao";

/**
 * "VOLTAR À EDIÇÃO" de um vídeo já aprovado (30/09): abrir, mover o começo ou
 * o fim de um corte por frase, descartar o rascunho, ou refazer só o que
 * mudou. Cena e palavra continuam nas rotas roteiro/cena e roteiro/termos,
 * que mandam para o rascunho quando a edição está reaberta.
 */
type Corpo = {
  acao?: "abrir" | "descartar" | "refazer" | "borda";
  trecho?: number;
  lado?: "inicio" | "fim";
  sentido?: "antes" | "depois";
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const c = (await req.json().catch(() => ({}))) as Corpo;
  try {
    if (c.acao === "abrir") return NextResponse.json({ tela: await abrirReedicao(id, userId) });
    if (c.acao === "descartar") return NextResponse.json({ tela: await descartarReedicao(id, userId) });
    if (c.acao === "refazer") return NextResponse.json(await refazerComAjustes(id, userId));
    if (c.acao === "borda" && typeof c.trecho === "number" && (c.lado === "inicio" || c.lado === "fim") && (c.sentido === "antes" || c.sentido === "depois")) {
      return NextResponse.json({ tela: await moverBordaNaReedicao(id, userId, { trecho: c.trecho, lado: c.lado, sentido: c.sentido }) });
    }
    return NextResponse.json({ error: "Pedido incompleto." }, { status: 400 });
  } catch (e) {
    if (e instanceof RecusaDoRoteiro) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof SaldoInsuficiente) return NextResponse.json({ error: e.message }, { status: 402 });
    console.error(`[roteiro/reedicao][${id}]`, e);
    return NextResponse.json({ error: "Não consegui fazer isso agora. Nada foi cobrado: tente de novo em um minuto." }, { status: 500 });
  }
}
