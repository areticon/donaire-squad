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

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const posts = await prisma.post.findMany({
    where: { projectId, status: "published" },
    include: { metrics: true },
    orderBy: { publishedAt: "desc" },
    take: 30,
  });

  const postsWithMetrics = posts.filter((p) => p.metrics);

  if (!postsWithMetrics.length) {
    return NextResponse.json({
      insight: "Ainda não há dados suficientes para gerar insights. Publique posts e sincronize as métricas primeiro.",
    });
  }

  // Aggregate by media type
  const byType: Record<string, { impressions: number; likes: number; comments: number; count: number }> = {};
  for (const p of postsWithMetrics) {
    const t = p.mediaType ?? "text";
    if (!byType[t]) byType[t] = { impressions: 0, likes: 0, comments: 0, count: 0 };
    byType[t].impressions += p.metrics!.impressions;
    byType[t].likes += p.metrics!.likes;
    byType[t].comments += p.metrics!.comments;
    byType[t].count++;
  }

  const byPlatform: Record<string, { impressions: number; likes: number; count: number }> = {};
  for (const p of postsWithMetrics) {
    if (!byPlatform[p.platform]) byPlatform[p.platform] = { impressions: 0, likes: 0, count: 0 };
    byPlatform[p.platform].impressions += p.metrics!.impressions;
    byPlatform[p.platform].likes += p.metrics!.likes;
    byPlatform[p.platform].count++;
  }

  const prompt = `Você é um estrategista de conteúdo sênior analisando dados de performance de redes sociais para o projeto "${project.name}" (nicho: ${project.niche ?? "geral"}).

DADOS DE PERFORMANCE:

Posts analisados: ${postsWithMetrics.length}

Por tipo de conteúdo:
${Object.entries(byType).map(([type, stats]) => `- ${type}: ${stats.count} posts, ${stats.impressions} impressões, ${stats.likes} likes, ${stats.comments} comentários (engaj/post: ${Math.round((stats.likes + stats.comments * 3) / stats.count)})`).join("\n")}

Por plataforma:
${Object.entries(byPlatform).map(([plat, stats]) => `- ${plat}: ${stats.count} posts, ${stats.impressions} impressões, taxa de like: ${((stats.likes / Math.max(stats.impressions, 1)) * 100).toFixed(2)}%`).join("\n")}

Com base nesses dados, gere um insight estratégico em 3-4 frases que:
1. Identifique qual tipo de conteúdo está gerando mais resultado
2. Sugira o que priorizar na próxima campanha
3. Aponte uma oportunidade de melhoria

Seja direto, use números específicos dos dados. Responda em português sem markdown.`;

  const insight = await askClaude(
    "Você é um estrategista de marketing digital especializado em análise de dados de redes sociais no Brasil.",
    prompt,
    { maxTokens: 512 }
  );

  // Save to project memory
  await prisma.projectMemory.upsert({
    where: { projectId_type_key: { projectId, type: "analytics", key: "latest_insight" } },
    create: { projectId, type: "analytics", key: "latest_insight", value: { insight, generatedAt: new Date().toISOString() } },
    update: { value: { insight, generatedAt: new Date().toISOString() } },
  });

  return NextResponse.json({ insight });
}
