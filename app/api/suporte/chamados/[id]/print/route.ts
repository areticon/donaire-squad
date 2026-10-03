export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { abrirMidia } from "@/lib/media/storage";

type Ctx = { params: Promise<{ id: string }> };

/**
 * O PRINT DO CHAMADO, servido só a quem abriu e aos admins. Ele mora no store
 * privado (tela de cliente pode ter dado de cliente) e passa por aqui, nunca
 * por link direto.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const [c, eu] = await Promise.all([
    prisma.chamado.findUnique({ where: { id }, select: { userId: true, printUrl: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
  ]);
  if (!c?.printUrl || (c.userId !== userId && eu?.role !== "admin")) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }
  const midia = await abrirMidia(c.printUrl);
  if (!midia) return NextResponse.json({ error: "Print indisponível" }, { status: 404 });
  return new NextResponse(midia.stream, {
    headers: { "Content-Type": midia.mimeType || "image/png", "Cache-Control": "private, max-age=300" },
  });
}
