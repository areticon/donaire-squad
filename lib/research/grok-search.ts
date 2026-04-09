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
    signal: AbortSignal.timeout(40_000),
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
 * Uma única chamada abrangente que cobre: posts do X hoje, notícias, debates e hype.
 * Usar uma chamada evita timeout acumulado de 3 paralelas.
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

  // Uma única chamada abrangente — mais rápido e mais confiável que 3 paralelas
  const prompt = `Hoje é ${today}. Faça uma pesquisa completa e atual sobre "${topic}" cobrindo TODOS os itens abaixo:

1. POSTS DO X AGORA: Quais são os posts mais recentes e virais no X (Twitter) sobre "${topic}" nos últimos 7 dias? Cite autores reais (@usuário), datas, métricas de engajamento e o que estão dizendo.

2. NOTÍCIAS DO DIA: Quais notícias e artigos foram publicados nos últimos 7 dias sobre "${topic}"? Cite título real, veículo, data e principais dados/números.

3. DEBATES E HYPE ATUAL: O que está sendo mais debatido agora sobre "${topic}"? Quais as polêmicas, controvérsias ou lançamentos mais recentes? O que está dividindo opiniões?

4. TENDÊNCIAS BRASIL: O que está em alta especificamente no Brasil sobre "${topic}" para ${targetAudience} no nicho de ${niche}? Casos reais, eventos, movimentos atuais.

IMPORTANTE: Use APENAS dados encontrados agora. Inclua datas reais, nomes reais de pessoas/empresas, URLs quando disponível. NÃO use dados de 2023 ou anteriores se houver algo mais recente.`;

  return await searchGrok(prompt, apiKey, 4096);
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
