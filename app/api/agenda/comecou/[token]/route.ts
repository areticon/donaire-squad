export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { reuniaoDoComecou } from "@/lib/agenda/segredos";

/**
 * A PESSOA DO TIME MARCOU QUE A DEMONSTRAÇÃO COMEÇOU (01/10, régua de
 * alertas), pelo formulário de /demonstracao/comecou/[token]. Volta para a
 * mesma página com "?ok=1" (formulário puro, sem JavaScript).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const id = reuniaoDoComecou(token);
  if (!id) return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  await prisma.reuniaoDeDemonstracao.updateMany({
    where: { id, comecouEm: null, status: { in: ["marcada", "realizada"] } },
    data: { comecouEm: new Date() },
  });
  return NextResponse.redirect(new URL(`/demonstracao/comecou/${encodeURIComponent(token)}?ok=1`, req.url), 303);
}
