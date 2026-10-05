export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/admin/guarda";
import { prisma } from "@/lib/db/prisma";
import { textoDoAditivoPorId } from "@/lib/contratos/aditivos";

type Ctx = { params: Promise<{ id: string; aditivoId: string }> };

/** O texto do aditivo como vai (ou foi) para assinatura, em Markdown (04/10). */
export async function GET(_req: NextRequest, { params }: Ctx) {
  if (!(await exigirAdmin())) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const { id, aditivoId } = await params;
  const a = await prisma.aditivoDoContrato.findFirst({ where: { id: aditivoId, contratoId: id }, select: { id: true } });
  if (!a) return NextResponse.json({ error: "Aditivo não encontrado" }, { status: 404 });
  const t = await textoDoAditivoPorId(aditivoId);
  return new NextResponse(t.texto, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Hash-Do-Texto": t.hash, "X-Versao-Do-Modelo": encodeURIComponent(t.versao), "Cache-Control": "no-store" },
  });
}
