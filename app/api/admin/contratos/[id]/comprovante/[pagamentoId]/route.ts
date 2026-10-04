export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/admin/guarda";
import { prisma } from "@/lib/db/prisma";
import { abrirMidia } from "@/lib/media/storage";

type Ctx = { params: Promise<{ id: string; pagamentoId: string }> };

/** O comprovante de um pagamento do contrato (04/10), do store privado, só para admin. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  if (!(await exigirAdmin())) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const { id, pagamentoId } = await params;
  const p = await prisma.pagamentoDoContrato.findFirst({ where: { id: pagamentoId, contratoId: id }, select: { comprovanteUrl: true, comprovanteNome: true } });
  if (!p?.comprovanteUrl) return NextResponse.json({ error: "Sem comprovante" }, { status: 404 });
  const m = await abrirMidia(p.comprovanteUrl);
  if (!m) return NextResponse.json({ error: "Comprovante indisponível" }, { status: 404 });
  const nome = (p.comprovanteNome ?? "comprovante").replace(/[^\w.\-]+/g, "_");
  return new NextResponse(m.stream, {
    headers: {
      "Content-Type": m.mimeType,
      "Content-Disposition": `inline; filename="${nome}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
