import { auth } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { soODono } from "@/lib/equipe/permissoes";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || !(await podeUsarProjeto(userId, project))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const agents = await prisma.projectAgent.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ agents });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || !(await podeUsarProjeto(userId, project))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // O squad é configuração do projeto: só o dono muda (01/10, acabamento).
  const recusa = await soODono(userId, project, "mudar o squad deste projeto");
  if (recusa) return recusa;

  const body = await req.json();
  const agent = await prisma.projectAgent.create({
    data: {
      projectId: id,
      agentId: body.agentId,
      name: body.name,
      role: body.role,
      persona: body.persona,
      style: body.style,
      skills: body.skills ?? [],
      tasks: body.tasks ?? [],
    },
  });

  return NextResponse.json({ agent });
}
