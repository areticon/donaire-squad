export const dynamic = "force-dynamic";
// Aplicar monta o pedido do corte com o código de produção (os efeitos do
// trecho são uma chamada de modelo), como as outras rotas de re-corte.
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { aplicarControleDoCorte, lerControleDoCorte, RecusaDoControle } from "@/lib/media/controle-do-corte-servidor";
import type { EscolhaDoCorte } from "@/lib/media/controle-do-corte";

/**
 * O CONTROLE DO CORTE (03/10/2026): o cliente puxa o começo e o fim de um
 * corte com precisão de palavra (e ajuste fino de 0,1 s), tira ou devolve
 * trechos do meio, ouve antes e aplica. Ver lib/media/controle-do-corte.ts.
 *
 *   GET  ?trecho=i            a fala em volta do corte, o que a IA tirou e o que está valendo
 *   POST { trecho, escolha }  aplica: no roteiro (antes da aprovação) ou refaz o corte
 */
function falha(e: unknown) {
  if (e instanceof RecusaDoControle) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("[controle-do-corte]", e);
  return NextResponse.json({ error: "Não consegui abrir o controle deste corte agora. Tente de novo." }, { status: 500 });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const trecho = Number(req.nextUrl.searchParams.get("trecho"));
  if (!Number.isInteger(trecho) || trecho < 0) return NextResponse.json({ error: "Informe o corte." }, { status: 400 });
  try {
    return NextResponse.json(await lerControleDoCorte(id, userId, trecho));
  } catch (e) {
    return falha(e);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const corpo = (await req.json().catch(() => ({}))) as { trecho?: number; escolha?: EscolhaDoCorte };
  if (typeof corpo.trecho !== "number" || !corpo.escolha) return NextResponse.json({ error: "Informe o corte e a escolha." }, { status: 400 });
  try {
    return NextResponse.json(await aplicarControleDoCorte(id, userId, corpo.trecho, corpo.escolha));
  } catch (e) {
    return falha(e);
  }
}
