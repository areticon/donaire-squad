export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { normalizarAparencia } from "@/lib/squad/aparencia-do-boneco";

/**
 * O boneco de massinha da pessoa no escritório 3D (28/09/2026).
 *
 * GET devolve a aparência gravada, já normalizada (o padrão, de laranja,
 * quando nunca personalizou). PUT grava a escolha do editor. A normalização
 * roda nos dois lados: o que entra no banco é sempre uma aparência válida, e o
 * que sai também, mesmo que um dia o formato mude.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { aparenciaDoBoneco: true } });
  return NextResponse.json({
    aparencia: normalizarAparencia(u?.aparenciaDoBoneco ?? null),
    personalizado: Boolean(u?.aparenciaDoBoneco),
  });
}

export async function PUT(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const corpo = await req.json().catch(() => null);
  const aparencia = normalizarAparencia(corpo?.aparencia);
  await prisma.user.update({ where: { id: userId }, data: { aparenciaDoBoneco: aparencia } });
  return NextResponse.json({ ok: true, aparencia });
}
