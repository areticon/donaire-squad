import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";

// GET — list all project contexts
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || project.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const contexts = await prisma.projectContext.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ contexts });
}

// POST — create a new context (AI compiles rawInput -> markdown)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || project.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { type, title, rawInput } = await req.json();
  if (!type || !title || !rawInput?.trim()) {
    return NextResponse.json({ error: "type, title and rawInput required" }, { status: 400 });
  }

  const TYPE_LABELS: Record<string, string> = {
    brand: "Manual de Marca",
    references: "Referências e Inspirações",
    regulations: "Regulamentações e Compliance",
    editorial: "Linha Editorial",
    examples: "Exemplos de Posts",
  };

  const system = `Você é um especialista em estratégia de conteúdo e branding.
Sua tarefa é transformar informações brutas fornecidas pelo usuário em um documento markdown estruturado, profissional e utilizável como contexto de sistema para agentes de IA que criam conteúdo.

Projeto: ${project.name}
Nicho: ${project.niche ?? "geral"}
Tipo de documento: ${TYPE_LABELS[type] ?? type}

Regras:
- Organize com títulos e subtítulos claros
- Use listas quando adequado
- Preserve todas as informações importantes do input
- Adicione estrutura e clareza sem inventar informações
- Escreva em português com acentuação correta
- O resultado será injetado diretamente no prompt de agentes de IA — seja objetivo e rico em contexto`;

  const compiled = await askClaude(
    system,
    `Transforme o seguinte conteúdo bruto em um documento markdown estruturado:\n\n${rawInput}`,
    { maxTokens: 3000 }
  );

  const context = await prisma.projectContext.create({
    data: { projectId: id, type, title, rawInput, compiled },
  });

  return NextResponse.json({ context });
}

// PATCH — update a context
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;
  const { contextId, rawInput, title } = await req.json();
  if (!contextId) return NextResponse.json({ error: "contextId required" }, { status: 400 });

  const context = await prisma.projectContext.findUnique({ where: { id: contextId } });
  if (!context || context.projectId !== projectId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let compiled = context.compiled;
  if (rawInput && rawInput !== context.rawInput) {
    compiled = await askClaude(
      `Transforme em documento markdown estruturado, mantendo todas informações, escrevendo em português:`,
      rawInput,
      { maxTokens: 3000 }
    );
  }

  const updated = await prisma.projectContext.update({
    where: { id: contextId },
    data: { rawInput: rawInput ?? context.rawInput, title: title ?? context.title, compiled },
  });

  return NextResponse.json({ context: updated });
}

// DELETE — remove a context
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;
  const { contextId } = await req.json();

  const context = await prisma.projectContext.findUnique({ where: { id: contextId } });
  if (!context || context.projectId !== projectId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.projectContext.delete({ where: { id: contextId } });
  return NextResponse.json({ ok: true });
}
