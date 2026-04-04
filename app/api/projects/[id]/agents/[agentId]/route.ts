import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; agentId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, agentId } = await params;

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.projectAgent.delete({ where: { id: agentId } });
  return NextResponse.json({ success: true });
}
