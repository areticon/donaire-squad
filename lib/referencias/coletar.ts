import { ATORES, estimativaDoAtor, rodarAtor } from "@/lib/referencias/apify";
import { postsDoYoutube } from "@/lib/referencias/youtube";
import { extrasDoInstagram, extrasDoTiktok } from "@/lib/referencias/extras-da-coleta";
import type { Caixa } from "@/lib/referencias/config";
import type { PostDeReferencia, RedeDeReferencia } from "@/lib/referencias/tipos";

/**
 * A CAMADA POR REDE DO TRILHO DE REFERÊNCIAS (01/10).
 *
 * `coletarReferencia(rede, perfil)` devolve SEMPRE o mesmo formato
 * (PostDeReferencia), venha de um ator da Apify ou de uma API oficial. Trocar o
 * ator, ou trocar a Apify pela Business Discovery da Meta quando o app for
 * aprovado, muda só a função da rede aqui dentro.
 *
 * O que NUNCA sai daqui: comentário, quem comentou, quem curtiu, marcação de
 * pessoa. Os atores devolvem `latestComments`, `firstComment` e `taggedUsers`
 * (medido em 01/10); o mapeamento abaixo descarta tudo isso antes de qualquer
 * gravação. Lei Geral de Proteção de Dados: guardar só o post e as métricas da
 * conta de referência, nunca dado de pessoa que só passou por ali.
 */

export type ResultadoDaColeta = {
  posts: PostDeReferencia[];
  custoUsd: number;
  fonte: string;
  status: "ok" | "vazio" | "erro" | "sem_orcamento";
  erro?: string;
};

/** O jeito canônico de guardar o perfil: @usuario sem @, ou o link da página. */
export function perfilCanonico(rede: RedeDeReferencia, entrada: string): string {
  const e = entrada.trim();
  if (rede === "linkedin") {
    const m = e.match(/linkedin\.com\/(company|school|showcase)\/([^/?#]+)/i);
    return m ? `https://www.linkedin.com/${m[1].toLowerCase()}/${m[2]}/` : e;
  }
  if (rede === "youtube") {
    const m = e.match(/youtube\.com\/(@[^/?#]+|channel\/(UC[\w-]+))/i);
    if (m) return m[2] ?? m[1];
    return e.startsWith("@") || e.startsWith("UC") ? e : `@${e}`;
  }
  return e
    .replace(/^https?:\/\/(www\.)?(instagram\.com|tiktok\.com|x\.com|twitter\.com)\//i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "")
    .toLowerCase();
}

export function urlDoPerfil(rede: RedeDeReferencia, perfil: string): string {
  switch (rede) {
    case "instagram":
      return `https://www.instagram.com/${perfil}/`;
    case "tiktok":
      return `https://www.tiktok.com/@${perfil}`;
    case "x":
      return `https://x.com/${perfil}`;
    case "youtube":
      return perfil.startsWith("UC") ? `https://www.youtube.com/channel/${perfil}` : `https://www.youtube.com/${perfil}`;
    case "linkedin":
      return perfil;
  }
}

const num = (v: unknown): number | null => {
  // Ausente é "não sabemos", nunca zero (02/10): Number(null) dá 0, e a foto do
  // Instagram (que não tem visualização) virava "0 visualizações" e ganho 0.
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v.replace(/[^\d.]/g, "")) : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

type ItemDoInstagram = {
  id?: string;
  shortCode?: string;
  type?: string;
  productType?: string;
  caption?: string;
  url?: string;
  likesCount?: number;
  commentsCount?: number;
  videoViewCount?: number;
  videoPlayCount?: number;
  videoDuration?: number;
  timestamp?: string;
  /** O arquivo do vídeo no CDN do Instagram (expira em horas): só para a medida, nunca gravado. */
  videoUrl?: string;
};

async function instagram(perfil: string, maxItens: number, caixa: Caixa): Promise<ResultadoDaColeta> {
  const fonte = `apify:${ATORES.instagramPosts}`;
  if (!caixa.cabe(estimativaDoAtor(ATORES.instagramPosts, maxItens))) return { posts: [], custoUsd: 0, fonte, status: "sem_orcamento" };
  const r = await rodarAtor<ItemDoInstagram>(
    ATORES.instagramPosts,
    { directUrls: [urlDoPerfil("instagram", perfil)], resultsType: "posts", resultsLimit: maxItens, addParentData: false },
    { maxItens, maxUsd: caixa.teto - caixa.gasto }
  );
  caixa.anotar(r.custoUsd);
  const posts: PostDeReferencia[] = r.itens.map((i) => ({
    rede: "instagram",
    perfil,
    externoId: String(i.id ?? i.shortCode ?? ""),
    url: i.url ?? (i.shortCode ? `https://www.instagram.com/p/${i.shortCode}/` : null),
    formato: i.productType === "clips" ? "reel" : i.type === "Sidecar" ? "carrossel" : i.type === "Video" ? "video" : "imagem",
    legenda: (i.caption ?? "").slice(0, 4000),
    duracaoSeg: i.videoDuration ? Math.round(i.videoDuration) : null,
    publicadoEm: i.timestamp ?? null,
    // Curtida escondida volta -1: vira "não sabemos", nunca zero.
    curtidas: i.likesCount !== undefined && i.likesCount >= 0 ? i.likesCount : null,
    comentarios: num(i.commentsCount),
    visualizacoes: num(i.videoPlayCount ?? i.videoViewCount),
    compartilhamentos: null,
    seguidoresDoAutor: null,
    midiaUrl: i.videoUrl ?? null,
    extras: extrasDoInstagram(i),
  }));
  return { posts: posts.filter((p) => p.externoId), custoUsd: r.custoUsd, fonte, status: r.status as ResultadoDaColeta["status"], erro: r.erro };
}

type ItemDoTiktok = {
  id?: string;
  text?: string;
  webVideoUrl?: string;
  isSlideshow?: boolean;
  createTimeISO?: string;
  diggCount?: number;
  commentCount?: number;
  playCount?: number;
  shareCount?: number;
  videoMeta?: { duration?: number };
  authorMeta?: { fans?: number };
};

async function tiktok(perfil: string, maxItens: number, caixa: Caixa): Promise<ResultadoDaColeta> {
  const fonte = `apify:${ATORES.tiktok}`;
  if (!caixa.cabe(estimativaDoAtor(ATORES.tiktok, maxItens))) return { posts: [], custoUsd: 0, fonte, status: "sem_orcamento" };
  const r = await rodarAtor<ItemDoTiktok>(
    ATORES.tiktok,
    { profiles: [perfil], resultsPerPage: maxItens, profileSorting: "latest", excludePinnedPosts: true },
    { maxItens, maxUsd: caixa.teto - caixa.gasto }
  );
  caixa.anotar(r.custoUsd);
  const posts: PostDeReferencia[] = r.itens.map((i) => ({
    rede: "tiktok",
    perfil,
    externoId: String(i.id ?? ""),
    url: i.webVideoUrl ?? null,
    formato: i.isSlideshow ? "carrossel" : "video",
    legenda: (i.text ?? "").slice(0, 4000),
    duracaoSeg: i.videoMeta?.duration ? Math.round(i.videoMeta.duration) : null,
    publicadoEm: i.createTimeISO ?? null,
    curtidas: num(i.diggCount),
    comentarios: num(i.commentCount),
    visualizacoes: num(i.playCount),
    compartilhamentos: num(i.shareCount),
    seguidoresDoAutor: num(i.authorMeta?.fans),
    extras: extrasDoTiktok(i),
  }));
  return { posts: posts.filter((p) => p.externoId), custoUsd: r.custoUsd, fonte, status: r.status as ResultadoDaColeta["status"], erro: r.erro };
}

type ItemDoLinkedin = {
  id?: string;
  linkedinUrl?: string;
  content?: string;
  postedAt?: { date?: string };
  postImages?: unknown[];
  postVideo?: unknown;
  document?: unknown;
  engagement?: { likes?: number; comments?: number; shares?: number };
  author?: { info?: string };
};

async function linkedin(perfil: string, maxItens: number, caixa: Caixa): Promise<ResultadoDaColeta> {
  const fonte = `apify:${ATORES.linkedinEmpresa}`;
  if (!caixa.cabe(estimativaDoAtor(ATORES.linkedinEmpresa, maxItens))) return { posts: [], custoUsd: 0, fonte, status: "sem_orcamento" };
  // Só página de empresa: perfil pessoal no LinkedIn é o maior risco jurídico
  // da pesquisa de 01/10 (LinkedIn contra hiQ e Proxycurl).
  if (!/linkedin\.com\/(company|school|showcase)\//i.test(perfil)) {
    return { posts: [], custoUsd: 0, fonte, status: "erro", erro: "só página de empresa do LinkedIn" };
  }
  const r = await rodarAtor<ItemDoLinkedin>(
    ATORES.linkedinEmpresa,
    { targetUrls: [perfil], maxPosts: maxItens, scrapeReactions: false, scrapeComments: false, includeReposts: false },
    { maxItens, maxUsd: caixa.teto - caixa.gasto }
  );
  caixa.anotar(r.custoUsd);
  const posts: PostDeReferencia[] = r.itens.map((i) => {
    const imagens = Array.isArray(i.postImages) ? i.postImages.length : 0;
    return {
      rede: "linkedin",
      perfil,
      externoId: String(i.id ?? ""),
      url: i.linkedinUrl ?? null,
      formato: i.postVideo ? "video" : i.document ? "documento" : imagens > 1 ? "carrossel" : imagens === 1 ? "imagem" : "texto",
      legenda: (i.content ?? "").slice(0, 4000),
      duracaoSeg: null,
      publicadoEm: i.postedAt?.date ?? null,
      curtidas: num(i.engagement?.likes),
      comentarios: num(i.engagement?.comments),
      // O LinkedIn não mostra impressões de terceiros a ninguém.
      visualizacoes: null,
      compartilhamentos: num(i.engagement?.shares),
      seguidoresDoAutor: i.author?.info ? num(i.author.info.split(" ")[0]) : null,
    };
  });
  return { posts: posts.filter((p) => p.externoId), custoUsd: r.custoUsd, fonte, status: r.status as ResultadoDaColeta["status"], erro: r.erro };
}

/** Preço da API do X por uso (fev/2026): US$ 0,005 por post lido e US$ 0,010 por perfil. */
const X_POR_POST = 0.005;
const X_POR_PERFIL = 0.01;

async function x(perfil: string, maxItens: number, caixa: Caixa): Promise<ResultadoDaColeta> {
  const fonte = "api:x";
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return { posts: [], custoUsd: 0, fonte, status: "erro", erro: "X_BEARER_TOKEN ausente" };
  const n = Math.max(5, Math.min(100, maxItens));
  if (!caixa.cabe(X_POR_PERFIL + n * X_POR_POST)) return { posts: [], custoUsd: 0, fonte, status: "sem_orcamento" };
  const h = { Authorization: `Bearer ${token}` };
  const u = await fetch(`https://api.twitter.com/2/users/by/username/${encodeURIComponent(perfil)}?user.fields=public_metrics`, { headers: h }).catch(() => null);
  const usuario = ((await u?.json().catch(() => ({}))) as { data?: { id: string; public_metrics?: { followers_count?: number } } })?.data;
  caixa.anotar(X_POR_PERFIL);
  if (!usuario) return { posts: [], custoUsd: X_POR_PERFIL, fonte, status: "erro", erro: `perfil não encontrado (${u?.status ?? "sem resposta"})` };
  const t = await fetch(
    `https://api.twitter.com/2/users/${usuario.id}/tweets?max_results=${n}&exclude=retweets,replies&tweet.fields=public_metrics,created_at`,
    { headers: h }
  ).catch(() => null);
  const dados = ((await t?.json().catch(() => ({}))) as {
    data?: Array<{ id: string; text: string; created_at?: string; public_metrics?: { like_count?: number; reply_count?: number; retweet_count?: number; quote_count?: number; impression_count?: number } }>;
  }) ?? {};
  const lidos = dados.data ?? [];
  const custo = X_POR_PERFIL + lidos.length * X_POR_POST;
  caixa.anotar(lidos.length * X_POR_POST);
  const posts: PostDeReferencia[] = lidos.map((p) => ({
    rede: "x",
    perfil,
    externoId: p.id,
    url: `https://x.com/${perfil}/status/${p.id}`,
    formato: "texto",
    legenda: p.text.slice(0, 4000),
    duracaoSeg: null,
    publicadoEm: p.created_at ?? null,
    curtidas: num(p.public_metrics?.like_count),
    comentarios: num(p.public_metrics?.reply_count),
    visualizacoes: num(p.public_metrics?.impression_count),
    compartilhamentos: (p.public_metrics?.retweet_count ?? 0) + (p.public_metrics?.quote_count ?? 0),
    seguidoresDoAutor: num(usuario.public_metrics?.followers_count),
  }));
  return { posts, custoUsd: custo, fonte, status: posts.length ? "ok" : "vazio" };
}

async function youtube(perfil: string, maxItens: number): Promise<ResultadoDaColeta> {
  const fonte = "api:youtube";
  const posts = await postsDoYoutube(perfil, maxItens);
  if (posts === null) return { posts: [], custoUsd: 0, fonte, status: "erro", erro: "canal não encontrado ou API do YouTube indisponível" };
  return { posts, custoUsd: 0, fonte, status: posts.length ? "ok" : "vazio" };
}

/** A porta única: um perfil de uma rede, no formato de sempre. */
export async function coletarReferencia(
  rede: RedeDeReferencia,
  perfil: string,
  opcoes: { maxItens: number; caixa: Caixa }
): Promise<ResultadoDaColeta> {
  switch (rede) {
    case "instagram":
      return instagram(perfil, opcoes.maxItens, opcoes.caixa);
    case "tiktok":
      return tiktok(perfil, opcoes.maxItens, opcoes.caixa);
    case "linkedin":
      return linkedin(perfil, opcoes.maxItens, opcoes.caixa);
    case "x":
      return x(perfil, opcoes.maxItens, opcoes.caixa);
    case "youtube":
      return youtube(perfil, opcoes.maxItens);
  }
}

export type DadosDoPerfilDoInstagram = {
  perfil: string;
  nome: string | null;
  bio: string | null;
  seguidores: number | null;
  posts: number | null;
  categoria: string | null;
  site: string | null;
};

/**
 * Os dados do PERFIL no Instagram (03/10): seguidores, total de posts, nome e
 * bio. O ator de posts não traz seguidores, e sem eles não existe taxa de
 * engajamento nem comparação justa entre uma conta de 2 mil e uma de 200 mil.
 * Um item por perfil, US$ 0,0026 cada (tabela de 01/10), numa execução só.
 */
export async function dadosDoInstagram(perfis: string[], caixa: Caixa): Promise<{ dados: DadosDoPerfilDoInstagram[]; custoUsd: number; erro?: string }> {
  const lista = [...new Set(perfis.map((p) => perfilCanonico("instagram", p)).filter(Boolean))];
  if (!lista.length) return { dados: [], custoUsd: 0 };
  if (!caixa.cabe(estimativaDoAtor(ATORES.instagramPerfil, lista.length))) return { dados: [], custoUsd: 0, erro: "sem_orcamento" };
  const r = await rodarAtor<{ username?: string; fullName?: string; biography?: string; followersCount?: number; postsCount?: number; businessCategoryName?: string; externalUrl?: string }>(
    ATORES.instagramPerfil,
    { usernames: lista },
    { maxItens: lista.length, maxUsd: caixa.teto - caixa.gasto }
  );
  caixa.anotar(r.custoUsd);
  const dados = r.itens
    .filter((i) => i.username)
    .map((i) => ({
      perfil: String(i.username).toLowerCase(),
      nome: i.fullName?.trim() || null,
      bio: i.biography?.trim() || null,
      seguidores: num(i.followersCount),
      posts: num(i.postsCount),
      categoria: i.businessCategoryName?.trim() || null,
      site: i.externalUrl?.trim() || null,
    }));
  return { dados, custoUsd: r.custoUsd, erro: r.erro };
}
