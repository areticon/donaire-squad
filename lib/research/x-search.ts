import { askClaude } from "@/lib/claude";

/**
 * A BUSCA NO X DE VERDADE, pela API oficial (28/09).
 *
 * Até aqui o Roberto dizia toda semana "a busca em X, LinkedIn, Instagram não
 * retornou posts": a pesquisa era Google (que quase não indexa posts do X) e o
 * código antigo do Grok estava desligado desde que a xAI aposentou a busca ao
 * vivo (HTTP 410). Com o token de aplicativo do X (`X_BEARER_TOKEN`), a busca
 * recente devolve os posts dos últimos 7 dias com as métricas públicas, e é
 * daí que sai "quem está falando disso agora, e o que pegou".
 *
 * O token vai EXATAMENTE como o portal do X mostra (com %2B e %3D): medido em
 * 28/09, a forma decodificada toma 401 e a original funciona.
 *
 * Custo: cada busca lê até 50 posts. A cota do plano da API do X é por posts
 * lidos no mês, então o radar guarda o resultado por 6 horas e o Roberto faz
 * uma busca por campanha, não uma por dia.
 */

export type PostDoX = {
  id: string;
  texto: string;
  autor: string;
  seguidores: number;
  data: string;
  curtidas: number;
  reposts: number;
  respostas: number;
  citacoes: number;
  impressoes: number;
  url: string;
};

type RespostaDaBusca = {
  data?: Array<{
    id: string;
    text: string;
    author_id: string;
    created_at: string;
    public_metrics?: { like_count?: number; retweet_count?: number; reply_count?: number; quote_count?: number; impression_count?: number };
  }>;
  includes?: { users?: Array<{ id: string; username: string; public_metrics?: { followers_count?: number } }> };
  title?: string;
  detail?: string;
};

export function xConfigurado(): boolean {
  return Boolean(process.env.X_BEARER_TOKEN);
}

/** Busca recente (7 dias). Devolve [] em qualquer falha: o X é reforço, não requisito. */
export async function buscarNoX(query: string, maximo = 50): Promise<PostDoX[]> {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return [];
  const params = new URLSearchParams({
    query,
    max_results: String(Math.min(100, Math.max(10, maximo))),
    "tweet.fields": "public_metrics,created_at,author_id",
    expansions: "author_id",
    "user.fields": "username,public_metrics",
    // Por RELEVÂNCIA, e não os mais novos: sem isto vinham os 60 posts dos
    // últimos minutos, e quase nenhum tinha engajamento para dizer algo.
    sort_order: "relevancy",
  });
  try {
    const res = await fetch(`https://api.twitter.com/2/tweets/search/recent?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    const d = (await res.json().catch(() => ({}))) as RespostaDaBusca;
    if (!res.ok) {
      console.warn(`[x-search] ${res.status} ${d.title ?? ""} ${d.detail ?? ""}`);
      return [];
    }
    const usuarios = new Map((d.includes?.users ?? []).map((u) => [u.id, u]));
    return (d.data ?? []).map((t) => {
      const u = usuarios.get(t.author_id);
      const m = t.public_metrics ?? {};
      return {
        id: t.id,
        texto: t.text,
        autor: u?.username ?? t.author_id,
        seguidores: u?.public_metrics?.followers_count ?? 0,
        data: t.created_at,
        curtidas: m.like_count ?? 0,
        reposts: m.retweet_count ?? 0,
        respostas: m.reply_count ?? 0,
        citacoes: m.quote_count ?? 0,
        impressoes: m.impression_count ?? 0,
        url: `https://x.com/${u?.username ?? "i"}/status/${t.id}`,
      };
    });
  } catch (e) {
    console.warn("[x-search] falhou:", e instanceof Error ? e.message : e);
    return [];
  }
}

/** O que pesa: repost e citação espalham, resposta é conversa, curtida é o mínimo. */
export function pesoDoPost(p: PostDoX): number {
  return p.curtidas + p.reposts * 3 + p.citacoes * 3 + p.respostas * 2;
}

/**
 * Termos curtos para a busca, a partir de um texto longo (o nicho, o público
 * ou o tema do dia). A busca do X casa palavras, e uma frase de 200 caracteres
 * não casa com nada: "consultores que querem autoridade no LinkedIn" vira
 * "marca pessoal", "autoridade no LinkedIn", "conteúdo B2B".
 */
export async function termosDeBusca(texto: string, quantos = 5): Promise<string[]> {
  try {
    const bruto = await askClaude(
      "Você extrai termos de busca para a API do X (Twitter) em português do Brasil. Responda só com os termos, um por linha, sem numeração e sem aspas.",
      // Termos de NEGÓCIO (28/09). A primeira versão pedia "termos do dia a
      // dia" e voltou "não sei o que postar", "sumi do instagram": frases que
      // aparecem em qualquer conversa pessoal, e a busca trouxe fã-clube e
      // desabafo. O termo precisa só existir em post sobre o trabalho.
      `Texto: """${texto.slice(0, 1500)}"""\n\nDevolva ${quantos} termos de 1 a 3 palavras que só apareceriam num post no X sobre o TRABALHO desse público (o mercado, a profissão, a estratégia, as ferramentas), por exemplo "marketing B2B", "geração de leads", "LinkedIn orgânico". Evite frases do cotidiano que aparecem em qualquer assunto pessoal ("não sei o que postar", "parei de postar", "gravar vídeo"). Nada de hashtag.`,
      { maxTokens: 4000 }
    );
    return bruto
      .split("\n")
      .map((l) => l.replace(/^[-•\d.)\s"]+|["\s]+$/g, "").trim())
      .filter((l) => l.length >= 3 && l.length <= 40)
      .slice(0, quantos);
  } catch {
    return [];
  }
}

/** A consulta: os termos com OU, só português, sem repost e sem resposta. */
export function consultaDoX(termos: string[]): string {
  const partes = termos.map((t) => (t.includes(" ") ? `"${t.replace(/"/g, "")}"` : t));
  return `(${partes.join(" OR ")}) lang:pt -is:retweet -is:reply`;
}

/**
 * Post que diz alguma coisa: texto de verdade (não só link ou uma linha) e de
 * quem tem alguém ouvindo. É o filtro que separa "quem está falando disso com
 * alcance" de ruído.
 */
function valeOPost(p: PostDoX, minSeguidores = 100): boolean {
  const semLink = p.texto.replace(/https?:\/\/\S+/g, "").trim();
  return semLink.length >= 50 && p.seguidores >= minSeguidores && pesoDoPost(p) > 0;
}

/** Os posts que mais pegaram, em texto para o prompt, com autor, data e link. */
export function resumoDoX(posts: PostDoX[], limite = 8, minSeguidores = 100): string {
  const melhores = [...posts].filter((p) => valeOPost(p, minSeguidores)).sort((a, b) => pesoDoPost(b) - pesoDoPost(a)).slice(0, limite);
  if (melhores.length === 0) return "";
  return melhores
    .map((p) => {
      const data = new Date(p.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
      return `- @${p.autor} (${p.seguidores.toLocaleString("pt-BR")} seguidores), ${data}: "${p.texto.replace(/\s+/g, " ").slice(0, 280)}" [${p.curtidas} curtidas, ${p.reposts} reposts, ${p.respostas} respostas] ${p.url}`;
    })
    .join("\n");
}

/**
 * Busca completa a partir de um texto livre: termos, consulta, resumo.
 *
 * Opções de 01/10, para o radar: `termos` prontos (os subtemas do território
 * do projeto, sem gastar uma chamada do Claude para inventar termos) e
 * `minSeguidores` (o radar só quer quem tem plateia). `posts` devolve os
 * melhores um a um, para a linha editorial mostrar a fonte de cada ideia.
 */
export async function oQueSeFalaNoX(
  texto: string,
  opcoes?: { termos?: string[]; minSeguidores?: number }
): Promise<{ resumo: string; fontes: Array<{ titulo: string; url: string }>; termos: string[]; posts: PostDoX[] }> {
  if (!xConfigurado()) return { resumo: "", fontes: [], termos: [], posts: [] };
  const min = opcoes?.minSeguidores ?? 100;
  const termos = opcoes?.termos?.length ? opcoes.termos : await termosDeBusca(texto);
  if (termos.length === 0) return { resumo: "", fontes: [], termos, posts: [] };
  // 50, e não 100 (28/09): a conta da API do X é por uso, e até sabermos se a
  // busca é cobrada por pedido ou por post lido, cada busca lê a metade.
  const posts = await buscarNoX(consultaDoX(termos), 50);
  const resumo = resumoDoX(posts, 8, min);
  const melhores = posts
    .filter((p) => valeOPost(p, min))
    .sort((a, b) => pesoDoPost(b) - pesoDoPost(a))
    .slice(0, 8);
  const fontes = melhores.slice(0, 5).map((p) => ({ titulo: `@${p.autor} no X`, url: p.url }));
  return { resumo, fontes, termos, posts: melhores };
}
