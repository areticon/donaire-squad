export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/admin/guarda";
import { prisma } from "@/lib/db/prisma";
import { textoDoContrato } from "@/lib/contratos/contratos";

type Ctx = { params: Promise<{ id: string }> };

/**
 * O texto do contrato como vai (ou foi) para assinatura, em Markdown, para o
 * admin conferir antes de enviar. O hash no cabeçalho é o mesmo que o envio
 * grava: se ele mudar depois do envio, o modelo mudou.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  if (!(await exigirAdmin())) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const { id } = await params;
  const c = await prisma.contrato.findUnique({ where: { id }, include: { user: { select: { acessosExtras: true } } } });
  if (!c) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
  const t = textoDoContrato({ ...c, acessosExtras: c.user.acessosExtras });
  return new NextResponse(t.texto, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Hash-Do-Texto": t.hash, "X-Versao-Do-Modelo": encodeURIComponent(t.versao), "Cache-Control": "no-store" },
  });
}
