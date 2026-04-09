/**
 * Roberto Radar — Real-time Research Module
 *
 * Priority:
 *   1. Grok-3 (xAI) — live X/Twitter posts, breaking news, web (XAI_API_KEY)
 *   2. Gemini 2.0 Flash + Google Search Grounding (GEMINI_API_KEY)
 *   3. Empty result (pipeline continues without research)
 */

// grok-search import removed — xAI live search API deprecated (use Agent Tools API)

export interface WebSearchResult {
  summary: string;
  sources: Array<{ title: string; url: string }>;
  rawText: string;
}

interface GeminiGroundingChunk {
  web?: { uri?: string; title?: string };
}

interface GeminiCandidate {
  content?: { parts?: Array<{ text?: string }> };
  groundingMetadata?: {
    groundingChunks?: GeminiGroundingChunk[];
    webSearchQueries?: string[];
  };
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  error?: { message?: string };
}

async function searchGemini(
  prompt: string,
  apiKey: string,
  maxTokens = 4096
): Promise<WebSearchResult> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tools: [{ googleSearch: {} }],
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: maxTokens },
      }),
      signal: AbortSignal.timeout(30_000),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini Search failed (${res.status}): ${err.slice(0, 300)}`);
  }

  const data = (await res.json()) as GeminiResponse;
  if (data.error) throw new Error(`Gemini Search error: ${data.error.message}`);

  const candidate = data.candidates?.[0];
  const rawText =
    (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("") || "";

  const sources: Array<{ title: string; url: string }> = (
    candidate?.groundingMetadata?.groundingChunks ?? []
  )
    .filter((c) => c.web?.uri)
    .map((c) => ({ title: c.web!.title ?? c.web!.uri!, url: c.web!.uri! }))
    .filter((s, i, arr) => arr.findIndex((x) => x.url === s.url) === i)
    .slice(0, 8);

  return { summary: rawText, sources, rawText };
}

async function researchTopicGemini(
  topic: string,
  niche: string,
  targetAudience: string,
  apiKey: string
): Promise<WebSearchResult> {
  const today = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().toLocaleString("pt-BR", { month: "long" });

  const searches = [
    `IMPORTANTE: Use APENAS as informações retornadas pelo Google Search agora. Ignore seu conhecimento de treinamento.
Hoje é ${today}. Busque as últimas notícias e tendências sobre "${topic}" publicadas nos últimos 30 dias.
Nicho: ${niche}. Público: ${targetAudience}.
Inclua: títulos reais de notícias, datas de publicação, dados numéricos e percentuais com fonte.
Se não encontrar resultados recentes, diga explicitamente "Sem resultados recentes encontrados".`,

    `IMPORTANTE: Use APENAS resultados do Google Search de ${currentMonth} de ${currentYear}. Não use memória de treinamento.
O que está em alta AGORA sobre "${topic}" no LinkedIn, X (Twitter) e outras redes sociais?
Nicho: ${niche}. Busque posts virais, hashtags, debates e engajamento recente.
Cite exemplos reais com datas. Se não houver dados recentes, indique claramente.`,

    `IMPORTANTE: Busque via Google Search apenas. Hoje é ${today}.
Relatórios, pesquisas e estudos publicados em ${currentYear} sobre "${topic}".
Fontes: McKinsey, Gartner, IBGE, FGV, Statista, Forrester, IDC, etc.
Nicho: ${niche}. Traga números reais, % de mercado, projeções com ano de publicação.`,
  ];

  const results = await Promise.allSettled(
    searches.map((prompt) => searchGemini(prompt, apiKey))
  );

  const successful = results
    .filter((r): r is PromiseFulfilledResult<WebSearchResult> => r.status === "fulfilled")
    .map((r) => r.value);

  if (successful.length === 0) {
    throw new Error("Todas as buscas Gemini falharam.");
  }

  const allSources = successful
    .flatMap((r) => r.sources)
    .filter((s, i, arr) => arr.findIndex((x) => x.url === s.url) === i)
    .slice(0, 8);

  const combinedSummary = successful
    .map((r, i) => {
      const labels = ["NOTÍCIAS E TENDÊNCIAS RECENTES", "REDES SOCIAIS E HYPE", "DADOS E PESQUISAS"];
      return `=== ${labels[i] ?? `PESQUISA ${i + 1}`} ===\n\n${r.summary}`;
    })
    .join("\n\n");

  return { summary: combinedSummary, sources: allSources, rawText: combinedSummary };
}

/**
 * Pesquisa completa sobre um tópico para o Roberto Radar.
 * Usa Gemini 2.5 Flash + Google Search Grounding (dados reais em tempo real).
 *
 * Nota: Grok (xAI) live search foi depreciado pela xAI em favor do "Agent Tools API"
 * que requer implementação de function calling — não compatível com nosso fluxo atual.
 * Removido para não desperdiçar créditos xAI a cada campanha.
 */
export async function researchTopic(
  topic: string,
  niche: string,
  targetAudience: string,
  apiKey: string // GEMINI_API_KEY
): Promise<WebSearchResult> {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY não configurada.");
  }
  return await researchTopicGemini(topic, niche, targetAudience, apiKey);
}

/**
 * Formata as fontes web para o brief do Roberto (seção FONTES).
 */
export function formatSourcesSection(sources: Array<{ title: string; url: string }>): string {
  if (sources.length === 0) return "";
  const lines = sources
    .slice(0, 5)
    .map((s) => `- [${s.title}](${s.url})`);
  return `\nFONTES:\n${lines.join("\n")}`;
}
