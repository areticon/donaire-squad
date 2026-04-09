/**
 * Grok Live Search Module (xAI)
 *
 * Uses Grok-3 with live search enabled — sources: X/Twitter, news, web.
 * Grok has native access to real-time X posts, trending topics, and current news.
 * This is the primary research engine; Gemini is the fallback.
 *
 * Env: XAI_API_KEY
 */

export interface GrokSearchResult {
  summary: string;
  sources: Array<{ title: string; url: string }>;
  rawText: string;
}

interface XAIMessage {
  content: string;
  citations?: Array<{ url: string; title?: string; text?: string }>;
}

interface XAIResponse {
  choices?: Array<{ message?: XAIMessage }>;
  error?: { message?: string };
}

/**
 * Executa uma busca live com Grok-3 (xAI).
 * Retorna texto sintetizado + fontes reais (X posts, artigos de notícia, web).
 */
export async function searchGrok(
  prompt: string,
  apiKey: string,
  maxTokens = 4096
): Promise<GrokSearchResult> {
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-3",
      messages: [{ role: "user", content: prompt }],
      search_parameters: {
        mode: "on",
        return_citations: true,
        sources: [
          { type: "x" },
          { type: "news" },
          { type: "web" },
        ],
        max_search_results: 20,
      },
      max_tokens: maxTokens,
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(12_000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Grok Search failed (${res.status}): ${err.slice(0, 300)}`);
  }

  const data = (await res.json()) as XAIResponse;

  if (data.error) {
    throw new Error(`Grok Search error: ${data.error.message}`);
  }

  const message = data.choices?.[0]?.message;
  const rawText = message?.content ?? "";

  const sources: Array<{ title: string; url: string }> = (message?.citations ?? [])
    .filter((c) => c.url)
    .map((c) => ({ title: c.title ?? c.url, url: c.url }))
    .filter((s, i, arr) => arr.findIndex((x) => x.url === s.url) === i) // deduplica
    .slice(0, 10);

  return { summary: rawText, sources, rawText };
}

/**
 * Pesquisa completa para Roberto Radar usando Grok live search.
 * Cobre: posts do X hoje, notícias de hoje, debates atuais, dados recentes.
 */
export async function researchTopicGrok(
  topic: string,
  niche: string,
  targetAudience: string,
  apiKey: string
): Promise<GrokSearchResult> {
  const today = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const searches = [
    // 1. X/Twitter — posts de hoje e tendências
    `Hoje é ${today}. Busque os posts mais recentes e virais do X (Twitter) sobre "${topic}" publicados nos últimos 7 dias.
Nicho: ${niche}. Público-alvo: ${targetAudience} no Brasil.
Traga: posts com alto engajamento, threads em alta, hashtags populares agora, opiniões de líderes de opinião.
Inclua: usuário/autor, data do post, métricas se disponível (curtidas, retweets). Seja específico.`,

    // 2. Notícias de hoje — o que foi publicado agora
    `Hoje é ${today}. Busque notícias e artigos publicados nos últimos 7 dias sobre "${topic}".
Nicho: ${niche}. Contexto Brasil e global.
Traga: título real do artigo, veículo de mídia, data de publicação, dados e números concretos.
Foque em fatos novos, não em retrospectivas antigas.`,

    // 3. Debates, controvérsias e hype atual
    `Hoje é ${today}. O que está sendo debatido AGORA sobre "${topic}" no LinkedIn, X e mídia especializada?
Nicho: ${niche}. Público: ${targetAudience}.
Traga: controvérsias, polarizações, cases recentes, lançamentos da semana, events desta semana.
Cite datas e fontes reais. Prefira conteúdo de ${today} ou dos últimos 7 dias.`,
  ];

  const results = await Promise.allSettled(
    searches.map((prompt) => searchGrok(prompt, apiKey))
  );

  const successful = results
    .filter((r): r is PromiseFulfilledResult<GrokSearchResult> => r.status === "fulfilled")
    .map((r) => r.value);

  if (successful.length === 0) {
    throw new Error("Todas as buscas Grok falharam — verifique a XAI_API_KEY.");
  }

  const allSources = successful
    .flatMap((r) => r.sources)
    .filter((s, i, arr) => arr.findIndex((x) => x.url === s.url) === i)
    .slice(0, 10);

  const combinedSummary = successful
    .map((r, i) => {
      const labels = [
        "POSTS DO X E TENDÊNCIAS AGORA",
        "NOTÍCIAS PUBLICADAS HOJE",
        "DEBATES E HYPE ATUAL",
      ];
      return `=== ${labels[i] ?? `PESQUISA ${i + 1}`} ===\n\n${r.summary}`;
    })
    .join("\n\n");

  return { summary: combinedSummary, sources: allSources, rawText: combinedSummary };
}

/**
 * Busca rápida de tendências do nicho para sugestão de temas (topics route).
 */
export async function fetchNicheTrendingGrok(
  niche: string,
  targetAudience: string,
  apiKey: string
): Promise<string> {
  const today = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const prompt = `Hoje é ${today}. Busque o que está em alta AGORA no nicho de "${niche}" para "${targetAudience}" no Brasil.
Use posts do X, notícias do dia, LinkedIn, e web.
Traga os 5-8 temas mais quentes desta semana com:
- Tema/assunto em alta
- Por que está em alta (fato, evento, debate)
- Quando foi publicado/iniciado (data real)
- Dados ou números se houver
Seja específico. Sem generalizações. Prefira conteúdo das últimas 2 semanas.`;

  const result = await searchGrok(prompt, apiKey, 2048);
  return result.rawText;
}
