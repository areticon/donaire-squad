import { auth } from "@clerk/nextjs/server";
import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

const DEFAULT_AGENTS = [
  {
    agentId: "roberto-radar",
    name: "Roberto Radar",
    role: "Pesquisador",
    persona: "Analista curioso e metódico que encontra dados e tendências relevantes.",
    style: "Objetivo, baseado em dados, cita fontes.",
  },
  {
    agentId: "lucas-linkedin",
    name: "Lucas LinkedIn",
    role: "Redator LinkedIn",
    persona: "Redator experiente em conteúdo B2B para LinkedIn.",
    style: "Hook impactante, desenvolvimento com dados, CTA direto. Máximo 1300 chars.",
  },
  {
    agentId: "tiago-twitter",
    name: "Tiago Twitter",
    role: "Redator X",
    persona: "Especialista em threads virais para X/Twitter.",
    style: "Threads de 5-7 tweets, cada um com max 280 chars, numerados como 1/, 2/, etc.",
  },
  {
    agentId: "diana-design",
    name: "Diana Design",
    role: "Designer",
    persona: "Especialista em criar prompts visuais impactantes para redes sociais. Transforma textos em descrições visuais que geram engajamento.",
    style: "Prompts detalhados com estilo visual, iluminação, composição, paleta de cores e mood. Foco em conversão visual e identidade de marca.",
  },
  {
    agentId: "vera-veredito",
    name: "Vera Veredito",
    role: "Revisora",
    persona: "Revisora rigorosa focada em qualidade editorial e aderência ao tom de voz.",
    style: "Crítica construtiva, corrige e aprova ou devolve com melhorias.",
  },
  {
    agentId: "paulo-publicador",
    name: "Paulo Publicador",
    role: "Publicador",
    persona: "Responsável por organizar e entregar o conteúdo para publicação.",
    style: "Metódico, garante que tudo está pronto antes de publicar.",
  },
];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Allow only safe, user-editable fields
  const ALLOWED_FIELDS = [
    "name", "description", "status", "niche", "voice",
    "targetAudience", "colorPalette", "postFrequency", "timezone", "setupStep", "config",
  ] as const;
  type AllowedField = (typeof ALLOWED_FIELDS)[number];

  const data: Partial<Record<AllowedField, unknown>> = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in body) data[key] = body[key];
  }

  const updated = await prisma.project.update({
    where: { id },
    data: data as Prisma.ProjectUpdateInput,
  });

  // Create default agents when project is activated for the first time
  if (body.status === "active") {
    const existing = await prisma.projectAgent.count({ where: { projectId: id } });
    if (existing === 0) {
      await prisma.projectAgent.createMany({
        data: DEFAULT_AGENTS.map((a) => ({ ...a, projectId: id })),
      });
    }
  }

  return NextResponse.json({ project: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.project.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
