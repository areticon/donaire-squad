import { auth } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { soODono } from "@/lib/equipe/permissoes";

/**
 * Confere projeto, papel e que o agente é DESTE projeto (01/10, acabamento).
 * O squad é configuração: só o dono muda. E o agente precisa pertencer ao
 * projeto da URL; até aqui bastava ter acesso a um projeto qualquer para mexer
 * no agente de outro pelo id.
 */
async function conferir(userId: string, id: string, agentId: string): Promise<NextResponse | null> {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || !(await podeUsarProjeto(userId, project))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const recusa = await soODono(userId, project, "mudar o squad deste projeto");
  if (recusa) return recusa;
  const agente = await prisma.projectAgent.findFirst({ where: { id: agentId, projectId: id }, select: { id: true } });
  if (!agente) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; agentId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, agentId } = await params;
  const barrado = await conferir(userId, id, agentId);
  if (barrado) return barrado;

  const body = await req.json();
  const agent = await prisma.projectAgent.update({
    where: { id: agentId },
    data: {
      name: body.name,
      role: body.role,
      persona: body.persona,
      style: body.style,
      skills: body.skills,
      tasks: body.tasks,
      isActive: body.isActive,
    },
  });

  return NextResponse.json({ agent });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; agentId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, agentId } = await params;
  const barrado = await conferir(userId, id, agentId);
  if (barrado) return barrado;

  await prisma.projectAgent.delete({ where: { id: agentId } });
  return NextResponse.json({ success: true });
}
