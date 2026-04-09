export const dynamic = 'force-dynamic'

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";

interface DayInput {
  dayOfWeek: string; // "1"-"7"
  dayName: string;
  contentType: string;
}

/** Busca tendências do nicho via Gemini 2.5 Flash + Google Search Grounding */
async function fetchTrendingForNiche(
  niche: string,
  targetAudience: string,
  geminiKey: string
): Promise<string> {
  if (!geminiKey) return "";
  const today = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const currentYear = new Date().getFullYear();
  const prompt = `INSTRUÇÃO CRÍTICA: Use APENAS os resultados do Google Search agora. NÃO use treinamento.
Hoje é ${today}. O que está em alta no nicho "${niche}" para "${targetAudience}" no Brasil nas últimas 4 semanas?
Traga: notícias recentes, temas virais no LinkedIn/X, dados de ${currentYear}, debates quentes.
Seja específico com datas, números e fontes reais.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tools: [{ googleSearch: {} }],
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
      }),
      signal: AbortSignal.timeout(35_000),
    }
  );

  if (!res.ok) return "";
  const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("") || "";
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, days } = await req.json() as { projectId: string; days: DayInput[] };
  if (!projectId || !Array.isArray(days) || days.length === 0) {
    return NextResponse.json({ error: "projectId and days required" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true, niche: true, targetAudience: true, voice: true, name: true,
      posts: { select: { content: true }, orderBy: { createdAt: "desc" }, take: 5 } },
  });

  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const recentTopics = project.posts.map((p) => p.content.slice(0, 60)).join("; ");

  // Fetch real-time trending data for the niche
  let trendingContext = "";
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      trendingContext = await fetchTrendingForNiche(
        project.niche ?? "geral",
        project.targetAudience ?? "profissionais",
        geminiKey
      );
    } catch { /* continue without real-time data */ }
  }

  const trendingBlock = trendingContext
    ? `\n=== TENDÊNCIAS REAIS ENCONTRADAS NA INTERNET AGORA ===\n${trendingContext}\n=== FIM ===\n`
    : "";

  const daysBlock = days
    .map((d) => `- ${d.dayName} (${d.contentType === "image" ? "post com imagem" : d.contentType === "poll" ? "enquete" : d.contentType === "infographic" ? "infográfico" : d.contentType === "video" ? "vídeo" : "post de texto"})`)
    .join("\n");

  const prompt = `Você é um estrategista de conteúdo. Sugira UM tema específico e atual para cada dia abaixo.
Projeto: ${project.name} | Nicho: ${project.niche} | Público: ${project.targetAudience}
${recentTopics ? `Temas recentes (evite repetir): ${recentTopics}` : ""}
${trendingBlock}
Dias para gerar tema:
${daysBlock}

REGRAS:
- Cada tema deve ser diferente dos outros (ângulos distintos)
- Baseie-se nas tendências reais acima quando possível
- Temas devem ser específicos, não genéricos
- Adapte ao formato do dia (imagem = visual e impactante, enquete = polarizante, etc.)

Responda SOMENTE com JSON válido neste formato (sem markdown):
{
  ${days.map((d) => `"${d.dayOfWeek}": "Tema para ${d.dayName}"`).join(",\n  ")}
}`;

  const raw = await askClaude("Você é um estrategista de conteúdo.", prompt, { maxTokens: 800 });

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const topicsPerDay = JSON.parse(jsonMatch?.[0] ?? "{}") as Record<string, string>;
    return NextResponse.json({ topicsPerDay });
  } catch {
    return NextResponse.json({ error: "Erro ao processar temas" }, { status: 500 });
  }
}
