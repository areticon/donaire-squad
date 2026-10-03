export const dynamic = 'force-dynamic'

import { auth } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";
import { radarDaSemana, temasJaUsados, blocosDeNovidade, REGRAS_DE_NOVIDADE } from "@/lib/research/radar-da-semana";
import { podeUsarProjeto } from "@/lib/equipe/conta";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await req.json();
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true, userId: true,
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

  if (!project || !(await podeUsarProjeto(userId, project))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const recentTopics = project.posts
    .map((p) => p.content.slice(0, 80))
    .join("\n");

  // O radar da semana e a memória das últimas oito semanas, os mesmos do
  // sugeridor por dia (28/09). Ver lib/research/radar-da-semana.ts.
  const [radar, usados] = await Promise.all([
    radarDaSemana({ projectId, nicho: project.niche ?? "geral", publico: project.targetAudience ?? "profissionais" }).catch(() => null),
    temasJaUsados(projectId),
  ]);
  const trendingBlock = `
${blocosDeNovidade(radar, usados)}
`;

  const prompt = `Você é um estrategista de conteúdo especialista em redes sociais no Brasil.

Projeto: ${project.name}
Nicho: ${project.niche || "não definido"}
Público-alvo: ${project.targetAudience || "não definido"}
Tom de voz: ${project.voice || "profissional"}
${recentTopics ? `\nÚltimos posts criados (para evitar repetição):\n${recentTopics}` : ""}
${trendingBlock}
Baseado nos dados em tempo real acima, sugira exatamente 5 temas de conteúdo para essa semana. Os temas devem:
- Ser baseados no que está em alta AGORA (use os dados reais fornecidos acima)
- Ser específicos e acionáveis: citar dados, nomes, números reais
- Variar em formato: dados/estatística, opinião provocativa, dica prática, case/história, tendência
- Ser diferentes dos posts recentes acima

${REGRAS_DE_NOVIDADE}

Responda APENAS com um JSON válido neste formato exato (sem markdown, sem explicações):
[
  {"title": "Tema curto", "description": "Por que está em alta e ângulo sugerido (1 frase)", "format": "dado|opinião|dica|case|tendência"},
  ...
]`;

  const raw = await askClaude("Você é um estrategista de conteúdo.", prompt, { maxTokens: 6000 });

  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    const topics = JSON.parse(jsonMatch?.[0] ?? "[]");
    return NextResponse.json({ topics });
  } catch {
    return NextResponse.json({ error: "Erro ao processar sugestões" }, { status: 500 });
  }
}
