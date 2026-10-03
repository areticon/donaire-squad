export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/admin/guarda";
import { prisma } from "@/lib/db/prisma";
import { abrirMidia } from "@/lib/media/storage";

type Ctx = { params: Promise<{ id: string }> };

/** O PDF assinado, do store privado, só para admin. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  if (!(await exigirAdmin())) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const { id } = await params;
  const c = await prisma.contrato.findUnique({ where: { id }, select: { pdfAssinadoUrl: true, numero: true } });
  if (!c?.pdfAssinadoUrl) return NextResponse.json({ error: "Sem PDF" }, { status: 404 });
  const m = await abrirMidia(c.pdfAssinadoUrl);
  if (!m) return NextResponse.json({ error: "PDF indisponível" }, { status: 404 });
  return new NextResponse(m.stream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="contrato-demandou-${String(c.numero).padStart(4, "0")}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
