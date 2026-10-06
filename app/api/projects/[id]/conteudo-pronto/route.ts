export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { cancelarSerie, criarConteudoPronto } from "@/lib/posts/conteudo-pronto-servidor";

/**
 * O CONTEÚDO PRONTO DO CLIENTE ENTRA NO QUADRO (06/10/2026).
 *
 * O arquivo já subiu pelo navegador (rota assinada /api/campanha/material,
 * pasta `conteudo-pronto/<projeto>/`). Este POST recebe as URLs, as medidas,
 * os destinos, a data e hora, a legenda e a recorrência, e grava run, posts
 * e cards (uma peça por ocorrência). Sem IA, sem crédito: o que custa é só o
 * armazenamento, conferido na hora do envio. Ver
 * lib/posts/conteudo-pronto-servidor.ts.
 *
 * DELETE ?runId=<run> cancela a série inteira (ou a peça única): o que ainda
 * não saiu vai para o arquivo de Posts, os cards somem do quadro, o run é
 * arquivado. O que já foi ao ar fica.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const pedido = await req.json().catch(() => null);
  const r = await criarConteudoPronto({ userId, projectId: id, pedido });
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.status });
  return NextResponse.json({ runId: r.runId, postIds: r.postIds, cardIds: r.cardIds, ocorrencias: r.ocorrencias });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const runId = req.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId é obrigatório" }, { status: 400 });
  const r = await cancelarSerie({ userId, projectId: id, runId });
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.status });
  return NextResponse.json({ cancelados: r.cancelados, ficaram: r.ficaram });
}
