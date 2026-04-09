/**
 * Roberto Radar — Real-time Web Research Module
 *
 * Uses Gemini 2.0 Flash with Google Search Grounding to fetch live data:
 * - Google News (últimas notícias)
 * - Tendências do nicho no LinkedIn/X indexados pelo Google
 * - Estatísticas e relatórios recentes
 * - Posts virais e debates atuais
 *
 * Grounding retorna URLs reais usadas na resposta (evita fontes inventadas).
 */

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

/**
 * Executa uma busca web com Gemini 2.0 Flash + Google Search Grounding.
 * Retorna o texto sintetizado e as fontes reais usadas.
 */
async function searchGemini(
  prompt: string,
  apiKey: string,
  maxTokens = 4096
): Promise<WebSearchResult> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tools: [{ googleSearch: {} }],
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: maxTokens,
        },
      }),
      signal: AbortSignal.timeout(45_000),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini Search failed (${res.status}): ${err.slice(0, 300)}`);
  }

  const data = (await res.json()) as GeminiResponse;

  if (data.error) {
    throw new Error(`Gemini Search error: ${data.error.message}`);
  }

  const candidate = data.candidates?.[0];
  const rawText =
    (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("") || "";

  const sources: Array<{ title: string; url: string }> = (
    candidate?.groundingMetadata?.groundingChunks ?? []
  )
    .filter((c) => c.web?.uri)
    .map((c) => ({ title: c.web!.title ?? c.web!.uri!, url: c.web!.uri! }))
    .filter(
      (s, i, arr) => arr.findIndex((x) => x.url === s.url) === i // deduplica
    )
    .slice(0, 8);

  return { summary: rawText, sources, rawText };
}

/**
 * Pesquisa completa sobre um tópico para o Roberto Radar.
 * Executa múltiplas buscas paralelas cobrindo:
 * - Notícias recentes (últimos 30 dias)
 * - Tendências X/Twitter e LinkedIn
 * - Dados, relatórios e estatísticas recentes
 * - Debates e conteúdo viral do nicho
 */
export async function researchTopic(
  topic: string,
  niche: string,
  targetAudience: string,
  apiKey: string
): Promise<WebSearchResult> {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().toLocaleString("pt-BR", { month: "long" });

  const today = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  const searches = [
    // 1. Notícias e tendências recentes
    `IMPORTANTE: Use APENAS as informações retornadas pelo Google Search agora. Ignore seu conhecimento de treinamento.
Hoje é ${today}. Busque as últimas notícias e tendências sobre "${topic}" publicadas nos últimos 30 dias.
Nicho: ${niche}. Público: ${targetAudience}.
Inclua: títulos reais de notícias, datas de publicação, dados numéricos e percentuais com fonte.
Se não encontrar resultados recentes, diga explicitamente "Sem resultados recentes encontrados".`,

    // 2. Debates e hype nas redes sociais
    `IMPORTANTE: Use APENAS resultados do Google Search de ${currentMonth} de ${currentYear}. Não use memória de treinamento.
O que está em alta AGORA sobre "${topic}" no LinkedIn, X (Twitter) e outras redes sociais?
Nicho: ${niche}. Busque posts virais, hashtags, debates e engajamento recente.
Cite exemplos reais com datas. Se não houver dados recentes, indique claramente.`,

    // 3. Dados, pesquisas e relatórios recentes
    `IMPORTANTE: Busque via Google Search apenas. Hoje é ${today}.
Relatórios, pesquisas e estudos publicados em ${currentYear} sobre "${topic}".
Fontes: McKinsey, Gartner, IBGE, FGV, Statista, Forrester, IDC, etc.
Nicho: ${niche}. Traga números reais, % de mercado, projeções com ano de publicação.`,
  ];

  // Executa todas as buscas em paralelo
  const results = await Promise.allSettled(
    searches.map((prompt) => searchGemini(prompt, apiKey))
  );

  // Agrega os resultados bem-sucedidos
  const successfulResults = results
    .filter((r): r is PromiseFulfilledResult<WebSearchResult> => r.status === "fulfilled")
    .map((r) => r.value);

  if (successfulResults.length === 0) {
    throw new Error("Todas as buscas web falharam — verifique a GEMINI_API_KEY.");
  }

  // Consolida fontes únicas
  const allSources = successfulResults
    .flatMap((r) => r.sources)
    .filter((s, i, arr) => arr.findIndex((x) => x.url === s.url) === i)
    .slice(0, 8);

  // Consolida o texto de pesquisa
  const combinedSummary = successfulResults
    .map((r, i) => {
      const labels = ["NOTÍCIAS E TENDÊNCIAS RECENTES", "REDES SOCIAIS E HYPE", "DADOS E PESQUISAS"];
      return `=== ${labels[i] ?? `PESQUISA ${i + 1}`} ===\n\n${r.summary}`;
    })
    .join("\n\n");

  return {
    summary: combinedSummary,
    sources: allSources,
    rawText: combinedSummary,
  };
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
