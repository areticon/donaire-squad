import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { prisma } from "@/lib/db/prisma";
import { gerarIdeias } from "@/lib/editorial/linha-editorial";

/**
 * A linha editorial do projeto (29/09). GET lista ideias e roteiros (sem os
 * descartados); POST gera ideias novas (radar da semana, X, pesquisas,
 * curiosidades, perguntas do público, documento e padrões de referência, mais
 * a memória de 8 semanas, sem repetir). Ver lib/editorial/linha-editorial.ts.
 *
 * 300 s porque o radar, quando não está guardado, faz quatro buscas no Google
 * e as fontes extras mais três (em paralelo) antes da chamada do Claude.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function dono(projectId: string): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, userId: true } });
  // Dono ou membro da equipe com o projeto liberado (01/10).
  return (await podeUsarProjeto(userId, p)) ? userId : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await dono(id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const roteiros = await prisma.roteiro.findMany({
    where: { projectId: id, status: { not: "descartada" } },
    orderBy: [{ updatedAt: "desc" }],
    take: 60,
  });
  return NextResponse.json({ roteiros });
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await dono(id);
  if (!userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    // Devolve os ids da rodada para a tela marcar as novas, e quantas vieram
    // de cada origem (01/10).
    const r = await gerarIdeias(id, userId);
    return NextResponse.json({ ok: true, novas: r.novas, ids: r.ids, rodada: r.rodada, origens: r.origens });
  } catch (e) {
    console.error(`[linha-editorial][ideias] ${e instanceof Error ? e.message : e}`);
    return NextResponse.json({ error: "Não consegui gerar as ideias agora. Tente de novo em instantes." }, { status: 502 });
  }
}
