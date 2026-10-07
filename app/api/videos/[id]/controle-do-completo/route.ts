export const dynamic = "force-dynamic";
// Aplicar depois da entrega monta o pedido só do completo e despacha ao
// worker, como a rota de refazer o completo.
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { RecusaDoControle } from "@/lib/media/controle-do-corte-servidor";
import { aplicarControleDoCompleto, lerControleDoCompleto } from "@/lib/media/controle-do-completo-servidor";
import type { EscolhaDoCorte } from "@/lib/media/controle-do-corte";

/**
 * O CONTROLE DO CORTE NO VÍDEO COMPLETO (08/10/2026): o mesmo controle dos
 * cortes (começo e fim por palavra com ajuste fino de 0,1 s, tirar e devolver
 * trechos do meio, ouvir pulando o que sai, aplicar), para o vídeo inteiro.
 * Ver lib/media/controle-do-completo-servidor.ts.
 *
 *   GET               a fala da gravação inteira, o que a IA tirou, o que está valendo e os elementos da edição
 *   POST { escolha }  aplica: no roteiro (antes da aprovação) ou refaz só o completo
 */
function falha(e: unknown) {
  if (e instanceof RecusaDoControle) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("[controle-do-completo]", e);
  return NextResponse.json({ error: "Não consegui abrir o controle do vídeo completo agora. Tente de novo." }, { status: 500 });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await lerControleDoCompleto(id, userId));
  } catch (e) {
    return falha(e);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const corpo = (await req.json().catch(() => ({}))) as { escolha?: EscolhaDoCorte };
  if (!corpo.escolha) return NextResponse.json({ error: "Informe a escolha." }, { status: 400 });
  try {
    return NextResponse.json(await aplicarControleDoCompleto(id, userId, corpo.escolha));
  } catch (e) {
    return falha(e);
  }
}
