export const dynamic = 'force-dynamic'

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";

/** Busca tendências em tempo real via Gemini 2.5 Flash + Google Search Grounding */
async function fetchTrendingTopics(
  niche: string,
  targetAudience: string,
  geminiKey: string
): Promise<string> {
  if (!geminiKey) return "";
  const today = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const currentYear = new Date().getFullYear();

  const prompt = `INSTRUÇÃO CRÍTICA: Use APENAS os resultados do Google Search retornados agora. NÃO use seu conhecimento de treinamento.

Hoje é ${today}. Busque o que está em alta NESTE MOMENTO no nicho de "${niche}" para "${targetAudience}" no Brasil.
Traga apenas das últimas 4 semanas:
1. Notícias recentes com título, data e fonte real
2. Temas com alto engajamento no LinkedIn e X (posts virais, hashtags)
3. Relatórios publicados em ${currentYear} com dados numéricos
4. Debates ou controvérsias atuais no setor
Para cada item: cite a fonte, a data e os números reais.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tools: [{ googleSearch: {} }],
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
      }),
      signal: AbortSignal.timeout(40_000),
    }
  );

  if (!res.ok) return "";
  const data = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("") || "";
}

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

  // Busca dados em tempo real do que está em alta agora no nicho
  let trendingContext = "";
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      trendingContext = await fetchTrendingTopics(
        project.niche ?? "geral",
        project.targetAudience ?? "profissionais",
        geminiKey
      );
    } catch {
      // Continua sem dados em tempo real se falhar
    }
  }

  const trendingBlock = trendingContext
    ? `\n=== O QUE ESTÁ EM ALTA AGORA (dados reais da internet) ===\n${trendingContext}\n=== FIM DOS DADOS EM TEMPO REAL ===\n`
    : "";

  const prompt = `Você é um estrategista de conteúdo especialista em redes sociais no Brasil.

Projeto: ${project.name}
Nicho: ${project.niche || "não definido"}
Público-alvo: ${project.targetAudience || "não definido"}
Tom de voz: ${project.voice || "profissional"}
${recentTopics ? `\nÚltimos posts criados (para evitar repetição):\n${recentTopics}` : ""}
${trendingBlock}
Baseado nos dados em tempo real acima, sugira exatamente 5 temas de conteúdo para essa semana. Os temas devem:
- Ser baseados no que está em alta AGORA (use os dados reais fornecidos acima)
- Ser específicos e acionáveis — citar dados, nomes, números reais
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
