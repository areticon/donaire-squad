export const dynamic = 'force-dynamic'

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await req.json();
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      userId: true,
      niche: true,
      targetAudience: true,
      voice: true,
      name: true,
      posts: {
        select: { content: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const recentTopics = project.posts
    .map((p) => p.content.slice(0, 80))
    .join("\n");

  const prompt = `Você é um estrategista de conteúdo especialista em redes sociais no Brasil.

Projeto: ${project.name}
Nicho: ${project.niche || "não definido"}
Público-alvo: ${project.targetAudience || "não definido"}
Tom de voz: ${project.voice || "profissional"}
${recentTopics ? `\nÚltimos posts criados (para evitar repetição):\n${recentTopics}` : ""}

Sugira exatamente 5 temas de conteúdo para essa semana. Os temas devem:
- Estar em alta no Brasil agora (tendências, hype, notícias relevantes do setor)
- Ser específicos e acionáveis (não genéricos)
- Variar em formato: dados/estatística, opinião provocativa, dica prática, case/história, tendência
- Ser diferentes dos posts recentes acima

Responda APENAS com um JSON válido neste formato exato (sem markdown, sem explicações):
[
  {"title": "Tema curto", "description": "Por que está em alta e ângulo sugerido (1 frase)", "format": "dado|opinião|dica|case|tendência"},
  ...
]`;

  const raw = await askClaude("Você é um estrategista de conteúdo.", prompt, { maxTokens: 1024 });

  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    const topics = JSON.parse(jsonMatch?.[0] ?? "[]");
    return NextResponse.json({ topics });
  } catch {
    return NextResponse.json({ error: "Erro ao processar sugestões" }, { status: 500 });
  }
}
