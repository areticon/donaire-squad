import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { levarParaALinha } from "@/lib/referencias/tendencias";

/**
 * POST: leva a sugestão de uma tendência da semana para a linha editorial
 * (02/10). Vira um roteiro pronto, com as cenas na voz do cliente, de origem
 * "tendência da semana". Quem usa o projeto pode levar: é o mesmo que gerar
 * uma ideia na linha editorial.
 */
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; tendenciaId: string }> }) {
  const { id, tendenciaId } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const projeto = await prisma.project.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!projeto || !(await podeUsarProjeto(userId, projeto))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const r = await levarParaALinha(id, userId, tendenciaId);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Não consegui levar agora." }, { status: 400 });
  }
}
