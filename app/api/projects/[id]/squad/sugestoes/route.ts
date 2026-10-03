import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { soODono } from "@/lib/equipe/permissoes";
import { prisma } from "@/lib/db/prisma";
import { sugestoesDoSquad, decidirSugestao } from "@/lib/squad/sugestoes-do-squad";

/**
 * As sugestões que os agentes levam até a sua sala no escritório (29/09).
 * GET lista; POST { id, acao: "aceitar" | "recusar" } decide.
 * Ver lib/squad/sugestoes-do-squad.ts para de onde cada uma sai.
 */
export const dynamic = "force-dynamic";

async function donoDoProjeto(projectId: string): Promise<boolean> {
  const { userId } = await auth();
  if (!userId) return false;
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, userId: true } });
  // Dono ou membro da equipe com o projeto liberado (01/10).
  return podeUsarProjeto(userId, p);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await donoDoProjeto(id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ sugestoes: await sugestoesDoSquad(id) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await donoDoProjeto(id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Aceitar uma sugestão muda o documento do projeto, que é configuração da
  // marca: o membro vê as sugestões, mas quem decide é o dono (01/10).
  const { userId } = await auth();
  const recusa = userId ? await soODono(userId, id, "decidir as sugestões do squad") : null;
  if (recusa) return recusa;
  const corpo = (await req.json().catch(() => ({}))) as { id?: string; acao?: string };
  if (!corpo.id || (corpo.acao !== "aceitar" && corpo.acao !== "recusar")) {
    return NextResponse.json({ error: "Informe id e acao (aceitar ou recusar)." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, ...(await decidirSugestao(id, corpo.id, corpo.acao)) });
}
