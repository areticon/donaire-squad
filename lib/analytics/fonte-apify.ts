import { prisma } from "@/lib/db/prisma";
import { coletarReferencia } from "@/lib/referencias/coletar";
import { apifyConfigurada, rodarAtor } from "@/lib/referencias/apify";
import { Caixa } from "@/lib/referencias/config";
import type { FonteDaLeitura, NumerosLidos } from "@/lib/analytics/fontes-da-leitura";

/**
 * OS NÚMEROS PELO PERFIL PÚBLICO (01/10), camada 3 da medição: a reserva.
 *
 * Entra só para o que o Blotato e as APIs oficiais não entregam: o perfil
 * pessoal do LinkedIn (o LinkedIn não libera esses números a aplicativos;
 * medido em 01/10: socialActions 403 e memberCreatorPostAnalytics 403), o
 * Facebook enquanto a Meta não aprova a leitura da página, o TikTok (o nosso
 * id é o do envio, não o do vídeo, e o app está em sandbox) e o Instagram
 * quando o token não lê.
 *
 * Reaproveita a camada do trilho de referências (lib/referencias): Instagram e
 * TikTok por `coletarReferencia` no perfil público do PRÓPRIO cliente,
 * casando os posts pelo link; LinkedIn e Facebook por `rodarAtor`, com atores
 * que leem o post pelo link (LinkedIn) ou a página (Facebook).
 *
 * Lei Geral de Proteção de Dados: os atores devolvem nomes de quem curtiu e
 * comentou; daqui só saem os NÚMEROS do post do próprio cliente. Nada de
 * pessoa é gravado.
 *
 * Custo (plano grátis da Apify, US$ 5 por mês, lido em 01/10): Instagram
 * US$ 0,0027 por post, TikTok 0,0037, LinkedIn por link 0,002, Facebook 0,005.
 * Três travas: teto por execução (METRICAS_APIFY_GASTO_MAX_USD, padrão 0,30),
 * teto do mês somando todas as coletas de métricas (METRICAS_APIFY_MES_USD,
 * padrão 3) e no máximo uma leitura por perfil a cada 20 horas.
 */

const ATOR_LINKEDIN_POST = "supreme_coder~linkedin-post";
const ATOR_FACEBOOK_PAGINA = "apify~facebook-posts-scraper";
const INTERVALO_POR_PERFIL_MS = 20 * 3600_000;
const INTERVALO_SEM_ACHADO_MS = 7 * 24 * 3600_000;

export type AlvoDaApify = {
  postId: string;
  platform: string;
  externalUrl: string | null;
  externalId: string | null;
  publishedAt: Date;
  content: string;
  /** usuário do Instagram ou TikTok, ou id da página do Facebook */
  perfil: string | null;
};

export type LidoNaApify =
  | { tipo: "ok"; fonte: FonteDaLeitura; numeros: NumerosLidos; custoUsd: number }
  | { tipo: "pendente"; fonte: FonteDaLeitura; motivo: string };

function tetoPorExecucao(): number {
  const n = Number(process.env.METRICAS_APIFY_GASTO_MAX_USD ?? 0.3);
  return Number.isFinite(n) && n > 0 ? n : 0.3;
}

function tetoDoMes(): number {
  const n = Number(process.env.METRICAS_APIFY_MES_USD ?? 3);
  return Number.isFinite(n) && n > 0 ? n : 3;
}

export async function gastoDoMesNaApify(agora = new Date()): Promise<number> {
  const inicio = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
  const r = await prisma.coletaDeMetrica.aggregate({ where: { criadoEm: { gte: inicio } }, _sum: { custoUsd: true } });
  return r._sum.custoUsd ?? 0;
}

const n = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const x = typeof v === "string" ? Number(v.replace(/[^\d.]/g, "")) : Number(v);
  return Number.isFinite(x) && x >= 0 ? x : null;
};

/** O código do post do Instagram no link (/p/XXX, /reel/XXX, /tv/XXX). */
function codigoDoInstagram(url: string | null | undefined): string | null {
  return url?.match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([\w-]+)/i)?.[1] ?? null;
}

/** Texto comparável: minúsculo, sem acento, só letras e números. */
function textoComparavel(t: string): string {
  return t
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** Quantos posts do perfil ler para alcançar o alvo mais antigo (o perfil vem do mais novo para o mais velho). */
async function itensParaAlcancar(projectId: string, platform: string, alvos: AlvoDaApify[]): Promise<number> {
  const maisAntigo = alvos.reduce((m, a) => (a.publishedAt < m ? a.publishedAt : m), alvos[0].publishedAt);
  const depois = await prisma.post.count({ where: { projectId, platform, publishedAt: { gte: maisAntigo } } });
  // Folga de 4 para post que o cliente publicou direto na rede, fora daqui.
  return Math.max(6, Math.min(30, depois + 4));
}

type Grupo = { fonte: FonteDaLeitura; perfil: string; alvos: AlvoDaApify[] };

async function lerInstagram(projectId: string, g: Grupo, caixa: Caixa): Promise<{ lidos: Map<string, LidoNaApify>; custo: number; status: string; erro?: string; itens: number }> {
  const maxItens = await itensParaAlcancar(projectId, "instagram", g.alvos);
  const r = await coletarReferencia("instagram", g.perfil, { maxItens, caixa });
  const porCodigo = new Map(r.posts.map((p) => [codigoDoInstagram(p.url), p]));
  const lidos = new Map<string, LidoNaApify>();
  const casados = g.alvos.filter((a) => porCodigo.has(codigoDoInstagram(a.externalUrl)));
  for (const a of g.alvos) {
    const p = porCodigo.get(codigoDoInstagram(a.externalUrl));
    if (!p) {
      lidos.set(a.postId, { tipo: "pendente", fonte: g.fonte, motivo: r.status === "ok" ? `O post não aparece entre os ${maxItens} mais recentes do perfil público @${g.perfil} (pode ter sido apagado ou arquivado na rede).` : `Leitura do perfil público falhou (${r.erro ?? r.status}).` });
      continue;
    }
    lidos.set(a.postId, {
      tipo: "ok",
      fonte: g.fonte,
      // Salvamento só quando o ator trouxer (o do Instagram não traz hoje).
      numeros: { curtidas: p.curtidas, comentarios: p.comentarios, visualizacoes: p.visualizacoes, salvamentos: p.extras?.salvamentos ?? null },
      custoUsd: r.custoUsd / Math.max(1, casados.length),
    });
  }
  return { lidos, custo: r.custoUsd, status: r.status, erro: r.erro, itens: r.posts.length };
}

async function lerTiktok(projectId: string, g: Grupo, caixa: Caixa): Promise<{ lidos: Map<string, LidoNaApify>; custo: number; status: string; erro?: string; itens: number }> {
  const maxItens = await itensParaAlcancar(projectId, "tiktok", g.alvos);
  const r = await coletarReferencia("tiktok", g.perfil, { maxItens, caixa });
  const lidos = new Map<string, LidoNaApify>();
  const achados = new Map<string, (typeof r.posts)[number]>();
  for (const a of g.alvos) {
    // O nosso externalId do TikTok é o número do ENVIO (v_pub_file...), e o
    // link gravado é o do perfil: casa pelo id do vídeo quando o link tem, e
    // senão pelo começo da legenda com a hora da publicação perto (6 h).
    const idDoVideo = a.externalUrl?.match(/\/video\/(\d+)/)?.[1];
    const inicio = textoComparavel(a.content).slice(0, 40);
    const p =
      r.posts.find((x) => idDoVideo && x.externoId === idDoVideo) ??
      r.posts.find((x) => {
        const perto = x.publicadoEm ? Math.abs(new Date(x.publicadoEm).getTime() - a.publishedAt.getTime()) < 6 * 3600_000 : false;
        const mesmoTexto = inicio.length >= 12 && textoComparavel(x.legenda).startsWith(inicio.slice(0, 30));
        return perto && (mesmoTexto || inicio.length < 12);
      });
    if (p && ![...achados.values()].includes(p)) achados.set(a.postId, p);
  }
  for (const a of g.alvos) {
    const p = achados.get(a.postId);
    if (!p) {
      lidos.set(a.postId, { tipo: "pendente", fonte: g.fonte, motivo: !r.posts.length
          ? `O perfil público @${g.perfil} não mostrou nenhum vídeo a quem não está logado (perfil privado, ou vídeo publicado como privado: app do TikTok em teste só publica privado).`
          : r.status === "ok" ? `O vídeo não aparece entre os ${maxItens} mais recentes do perfil público @${g.perfil}.` : `Leitura do perfil público falhou (${r.erro ?? r.status}).` });
      continue;
    }
    lidos.set(a.postId, {
      tipo: "ok",
      fonte: g.fonte,
      // collectCount do TikTok é o salvamento: já vinha na mesma leitura (06/10).
      numeros: { visualizacoes: p.visualizacoes, curtidas: p.curtidas, comentarios: p.comentarios, compartilhamentos: p.compartilhamentos, salvamentos: p.extras?.salvamentos ?? null },
      custoUsd: r.custoUsd / Math.max(1, achados.size),
    });
  }
  return { lidos, custo: r.custoUsd, status: r.status, erro: r.erro, itens: r.posts.length };
}

type ItemDoLinkedinPost = { inputUrl?: string; shareUrn?: string; urn?: string; numLikes?: number; numComments?: number; numShares?: number };

/** O link canônico do post do LinkedIn a partir do urn gravado na publicação. */
function linkDoLinkedin(a: AlvoDaApify): string | null {
  const urn = a.externalId?.match(/urn:li:(?:share|ugcPost|activity):\d+/)?.[0];
  if (urn) return `https://www.linkedin.com/feed/update/${urn}/`;
  return a.externalUrl;
}

async function lerLinkedin(g: Grupo, caixa: Caixa): Promise<{ lidos: Map<string, LidoNaApify>; custo: number; status: string; erro?: string; itens: number }> {
  const porLink = new Map<string, AlvoDaApify>();
  for (const a of g.alvos) {
    const l = linkDoLinkedin(a);
    if (l) porLink.set(l, a);
  }
  const lidos = new Map<string, LidoNaApify>();
  const urls = [...porLink.keys()].slice(0, 40);
  if (!urls.length) return { lidos, custo: 0, status: "vazio", itens: 0 };
  // Lê o POST pelo link (não o perfil): sem precisar do endereço do perfil, e
  // pagando só pelos posts que interessam. deepScrape desligado: os números
  // vêm igual, e nomes de quem reagiu ficam de fora.
  const r = await rodarAtor<ItemDoLinkedinPost>(ATOR_LINKEDIN_POST, { urls, deepScrape: false, limitPerSource: 1 }, { maxItens: urls.length, maxUsd: caixa.teto - caixa.gasto });
  caixa.anotar(r.custoUsd);
  const casados = new Map<string, ItemDoLinkedinPost>();
  // O número do post dentro do link ou do urn: o ator devolve o link de
  // entrada às vezes codificado (%3A), e o post de vídeo (ugcPost) não traz
  // shareUrn. Casar pelo número evita perder o post por grafia.
  const numeroDe = (s: string | null | undefined): string | null => {
    let t = s ?? "";
    try {
      t = decodeURIComponent(t);
    } catch {
      // link com % solto: lê como veio
    }
    return t.match(/urn:li:(?:share|ugcPost|activity):(\d+)/)?.[1] ?? null;
  };
  for (const it of r.itens) {
    const chaves = [numeroDe(it.inputUrl), numeroDe(it.shareUrn), numeroDe(it.urn)].filter(Boolean);
    const alvo = g.alvos.find((a) => chaves.includes(numeroDe(a.externalId) ?? numeroDe(a.externalUrl)));
    if (alvo) casados.set(alvo.postId, it);
  }
  for (const a of g.alvos) {
    const it = casados.get(a.postId);
    if (!it) {
      lidos.set(a.postId, { tipo: "pendente", fonte: g.fonte, motivo: r.status === "ok" || r.status === "vazio" ? "O post público não foi encontrado pelo link (pode ter sido apagado ou estar restrito)." : `Leitura do post público falhou (${r.erro ?? r.status}).` });
      continue;
    }
    lidos.set(a.postId, {
      tipo: "ok",
      fonte: g.fonte,
      numeros: { curtidas: n(it.numLikes), comentarios: n(it.numComments), compartilhamentos: n(it.numShares) },
      custoUsd: r.custoUsd / Math.max(1, casados.size),
    });
  }
  return { lidos, custo: r.custoUsd, status: r.status, erro: r.erro, itens: r.itens.length };
}

type ItemDoFacebook = { postId?: string; url?: string; topLevelUrl?: string; likes?: number; topReactionsCount?: number; comments?: number; shares?: number; viewsCount?: number; time?: string; error?: string; errorDescription?: string };

async function lerFacebook(g: Grupo, caixa: Caixa): Promise<{ lidos: Map<string, LidoNaApify>; custo: number; status: string; erro?: string; itens: number }> {
  const maisAntigo = g.alvos.reduce((m, a) => (a.publishedAt < m ? a.publishedAt : m), g.alvos[0].publishedAt);
  const desde = new Date(maisAntigo.getTime() - 86400_000).toISOString().slice(0, 10);
  const maxItens = Math.max(5, Math.min(30, g.alvos.length + 5));
  const r = await rodarAtor<ItemDoFacebook>(
    ATOR_FACEBOOK_PAGINA,
    { startUrls: [{ url: `https://www.facebook.com/${g.perfil}` }], resultsLimit: maxItens, onlyPostsNewerThan: desde },
    { maxItens, maxUsd: caixa.teto - caixa.gasto }
  );
  caixa.anotar(r.custoUsd);
  // O ator devolve um item de erro quando a página não mostra nada deslogada
  // (medido em 01/10 na página da Demandou: "no_items, Empty or private data").
  const semPosts = r.itens.length > 0 && r.itens.every((x) => x.error);
  r.itens = r.itens.filter((x) => !x.error);
  const lidos = new Map<string, LidoNaApify>();
  const casados = new Map<string, ItemDoFacebook>();
  for (const a of g.alvos) {
    // Nosso id é "pagina_post" (post comum) ou o id do vídeo (vídeo e reel).
    const id = a.externalId?.split("_").pop() ?? "";
    const it = r.itens.find((x) => x.postId === id || (id && (x.url?.includes(id) || x.topLevelUrl?.includes(id))));
    if (it) casados.set(a.postId, it);
  }
  for (const a of g.alvos) {
    const it = casados.get(a.postId);
    if (!it) {
      lidos.set(a.postId, { tipo: "pendente", fonte: g.fonte, motivo: semPosts
          ? "A página pública não mostra posts deste período a quem não está logado no Facebook."
          : r.status === "ok" || r.status === "vazio" ? "O post não apareceu na leitura da página pública." : `Leitura da página pública falhou (${r.erro ?? r.status}).` });
      continue;
    }
    lidos.set(a.postId, {
      tipo: "ok",
      fonte: g.fonte,
      numeros: { curtidas: n(it.topReactionsCount ?? it.likes), comentarios: n(it.comments), compartilhamentos: n(it.shares), visualizacoes: n(it.viewsCount) },
      custoUsd: r.custoUsd / Math.max(1, casados.size),
    });
  }
  return { lidos, custo: r.custoUsd, status: semPosts ? "vazio" : r.status, erro: r.erro, itens: r.itens.length };
}

const FONTE_POR_REDE: Record<string, FonteDaLeitura> = {
  instagram: "apify:instagram",
  tiktok: "apify:tiktok",
  linkedin: "apify:linkedin",
  facebook: "apify:facebook",
};

/**
 * Lê pela Apify os posts que as outras camadas não mediram, um grupo por
 * (rede, perfil), em paralelo, cada grupo com o seu teto.
 */
export async function lerPelaApify(
  projectId: string,
  alvos: AlvoDaApify[],
  opcoes: { forcar?: boolean } = {}
): Promise<{ lidos: Map<string, LidoNaApify>; custoUsd: number; coletas: number }> {
  const lidos = new Map<string, LidoNaApify>();
  const grupos = new Map<string, Grupo>();
  for (const a of alvos) {
    const fonte = FONTE_POR_REDE[a.platform];
    if (!fonte) continue;
    // LinkedIn lê pelo link do post: um grupo só por projeto.
    const perfil = a.platform === "linkedin" ? "posts" : a.perfil;
    if (!perfil) {
      lidos.set(a.postId, { tipo: "pendente", fonte, motivo: "Não sabemos o perfil público deste post (a conta que publicou não está mais conectada)." });
      continue;
    }
    const k = `${a.platform}:${perfil}`;
    const g = grupos.get(k) ?? { fonte, perfil, alvos: [] };
    g.alvos.push(a);
    grupos.set(k, g);
  }
  if (!grupos.size) return { lidos, custoUsd: 0, coletas: 0 };

  const pendenteParaTodos = (g: Grupo, motivo: string) => {
    for (const a of g.alvos) lidos.set(a.postId, { tipo: "pendente", fonte: g.fonte, motivo });
  };
  if (!apifyConfigurada()) {
    for (const g of grupos.values()) pendenteParaTodos(g, "A leitura do perfil público está desligada (sem APIFY_TOKEN).");
    return { lidos, custoUsd: 0, coletas: 0 };
  }

  const restante = tetoDoMes() - (await gastoDoMesNaApify());
  if (restante <= 0.01) {
    for (const g of grupos.values()) pendenteParaTodos(g, "O teto do mês para leitura de perfil público foi atingido; volta no mês que vem.");
    return { lidos, custoUsd: 0, coletas: 0 };
  }

  // Uma leitura por perfil a cada 20 h: o perfil traz todos os posts de uma
  // vez, então ler de novo no mesmo dia só gasta.
  // E quando a última leitura do perfil não achou NENHUM post nosso (perfil
  // privado, página que não mostra nada deslogada), espera 7 dias: repetir
  // todo dia só pagaria pela mesma resposta vazia.
  const recentes = opcoes.forcar
    ? []
    : await prisma.coletaDeMetrica.findMany({
        where: { projectId, criadoEm: { gte: new Date(Date.now() - INTERVALO_SEM_ACHADO_MS) }, status: { in: ["ok", "vazio"] } },
        orderBy: { criadoEm: "desc" },
        select: { fonte: true, perfil: true, criadoEm: true, casados: true },
      });
  const aRodar: Grupo[] = [];
  for (const g of grupos.values()) {
    const ultima = recentes.find((c) => c.fonte === g.fonte && c.perfil === g.perfil);
    const idade = ultima ? Date.now() - ultima.criadoEm.getTime() : Infinity;
    const quando = ultima?.criadoEm.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
    if (ultima && ultima.casados > 0 && idade < INTERVALO_POR_PERFIL_MS) pendenteParaTodos(g, `O perfil público foi lido em ${quando}; a próxima leitura sai no próximo marco (no máximo uma por dia).`);
    else if (ultima && ultima.casados === 0) pendenteParaTodos(g, `A leitura do perfil público em ${quando} não achou estes posts; tentamos de novo 7 dias depois.`);
    else aRodar.push(g);
  }

  const tetoDoGrupo = Math.min(tetoPorExecucao(), restante / Math.max(1, aRodar.length));
  let custoUsd = 0;
  await Promise.all(
    aRodar.map(async (g) => {
      const caixa = new Caixa(tetoDoGrupo);
      const r =
        g.fonte === "apify:instagram" ? await lerInstagram(projectId, g, caixa)
        : g.fonte === "apify:tiktok" ? await lerTiktok(projectId, g, caixa)
        : g.fonte === "apify:linkedin" ? await lerLinkedin(g, caixa)
        : await lerFacebook(g, caixa);
      custoUsd += r.custo;
      let casados = 0;
      for (const [id, l] of r.lidos) {
        lidos.set(id, l);
        if (l.tipo === "ok") casados++;
      }
      await prisma.coletaDeMetrica.create({
        data: { projectId, fonte: g.fonte, perfil: g.perfil, status: r.status, erro: r.erro?.slice(0, 300) ?? null, itens: r.itens, casados, custoUsd: r.custo },
      });
    })
  );
  return { lidos, custoUsd, coletas: aRodar.length };
}
