import { prisma } from "@/lib/db/prisma";
import { resolveSocialAccountAccessToken } from "@/lib/publish/oauth-post";
import { numerosDosVideos } from "@/lib/referencias/youtube";
import { lerDoBlotato } from "@/lib/analytics/fonte-blotato";
import { lerPelaApify, type AlvoDaApify } from "@/lib/analytics/fonte-apify";
import { ONDE_SAIU, temNumero, type FonteDaLeitura, type NumerosLidos } from "@/lib/analytics/fontes-da-leitura";

/**
 * A SINCRONIZAÇÃO DE MÉTRICAS, rede por rede, dizendo o que não veio (28/09),
 * agora em camadas e com histórico (01/10).
 *
 * 28/09: o Bruno clicou em "Sincronizar métricas" e não vieram os resultados
 * dos últimos posts. Toda falha virava ZERO gravado, contado como
 * "sincronizado". A falha passou a não gravar nada, e a resposta diz, por
 * rede, quantos vieram e por que o resto não veio.
 *
 * 01/10: "as métricas, não consigo ver; se não funcionar o Blotato, precisa
 * funcionar a Apify". Três causas juntas:
 *   1. a busca era `status: "published"`, e arquivar grava "cancelled": 83
 *      posts publicados do Bruno sumiram de toda tela de números;
 *   2. post do Blotato ("ponte:"), conta sem token, perfil pessoal do LinkedIn,
 *      YouTube e TikTok eram pulados sem outra tentativa;
 *   3. cada leitura sobrescrevia a anterior (post_metrics guarda um número).
 *
 * Agora, para cada post que foi ao ar (arquivado ou não), em ordem:
 *   1. BLOTATO, quando o post saiu por ele (lib/analytics/fonte-blotato.ts);
 *   2. API OFICIAL: LinkedIn (estatísticas da página, com impressões e
 *      cliques), X (métricas públicas pelo token do app, sem depender do token
 *      do cliente), YouTube (Data API pela conta de serviço), Instagram e
 *      Facebook pelo token da conta;
 *   3. PERFIL PÚBLICO pela Apify, só para o que sobrou (fonte-apify.ts).
 * Cada leitura vira uma linha em leituras_de_metrica com a fonte; o que não
 * veio vira linha "pendente" com o motivo (pendente é diferente de zero). O
 * post_metrics continua existindo como o "último número" consolidado, para as
 * telas que ainda o leem.
 */

export type ResultadoDaRede = { ok: number; falhou: number; motivo: string | null; fontes?: Record<string, number> };

/**
 * COMPLETAR PELO PERFIL PÚBLICO (06/10), DESLIGADO por padrão.
 *
 * Hoje a Apify só lê o post que as outras camadas NÃO mediram. No Instagram e
 * no Facebook a API oficial responde só curtida e comentário (visualização,
 * alcance e salvamento pedem a permissão de insights, em revisão na Meta),
 * então o post "medido" pela API nunca ganha visualização, embora o perfil
 * público mostre. Com METRICAS_APIFY_COMPLETAR=1, esses posts também entram na
 * leitura do perfil público, só para somar o que faltou.
 *
 * Custa: cada leitura de perfil cobra por post lido (tabela em fonte-apify.ts).
 * Continua valendo a trava de uma leitura por perfil a cada 20 h e o teto do
 * mês (METRICAS_APIFY_MES_USD). Ligar só com o OK do Bruno para o valor.
 */
export function completarPeloPerfilPublico(env: Record<string, string | undefined> = process.env): boolean {
  return env.METRICAS_APIFY_COMPLETAR === "1";
}

/** O post medido pela API que o perfil público ainda pode completar. */
export function faltaNoPerfilPublico(platform: string, numeros: NumerosLidos | undefined): boolean {
  if (!["instagram", "facebook", "tiktok"].includes(platform)) return false;
  return !numeros || typeof numeros.visualizacoes !== "number";
}

class SemPermissao extends Error {}

async function jsonOuErro(res: Response, rede: string): Promise<Record<string, unknown>> {
  const corpo = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string; code?: number } };
  if (!res.ok || corpo.error) {
    const msg = corpo.error?.message ?? (typeof corpo.message === "string" ? corpo.message : `HTTP ${res.status}`);
    // A Meta responde "does not exist, cannot be loaded due to missing
    // permissions" para post APAGADO na rede (medido em 01/10 com três posts
    // do @prdonaire que não estão mais no perfil). Não é falta de permissão, e
    // mandar reconectar não resolveria.
    if (/does not exist/i.test(msg)) throw new Error(`O ${rede} não encontrou este post (apagado ou arquivado na rede).`);
    if (res.status === 401 || res.status === 403 || corpo.error?.code === 10 || /permission|scope/i.test(msg)) throw new SemPermissao(msg);
    throw new Error(`${rede}: ${msg}`);
  }
  return corpo;
}

/* ── API oficial, rede por rede ─────────────────────────────────────────── */

/**
 * As versões da API do LinkedIn valem cerca de um ano e a mais nova muda todo
 * mês: tenta a do mês e volta mês a mês enquanto a resposta for 426 ("versão
 * não está ativa"), o mesmo desenho de lib/oauth/linkedin.ts.
 */
function versoesDoLinkedin(agora = new Date()): string[] {
  const v: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - i, 1));
    v.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return v;
}

/**
 * Página de empresa: estatísticas da organização, com impressões, alcance e
 * cliques (medido em 01/10: 200 com a versão 202609; a socialActions só dá
 * curtida e comentário).
 */
async function linkedinPagina(token: string, orgId: string, urn: string): Promise<NumerosLidos> {
  const tipo = urn.includes("ugcPost") ? "ugcPosts" : "shares";
  const url = `https://api.linkedin.com/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(`urn:li:organization:${orgId}`)}&${tipo}=List(${encodeURIComponent(urn)})`;
  for (const versao of versoesDoLinkedin()) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, "X-Restli-Protocol-Version": "2.0.0", "LinkedIn-Version": versao }, signal: AbortSignal.timeout(20_000) });
    if (res.status === 426) continue;
    const d = await jsonOuErro(res, "LinkedIn");
    const s = ((d.elements as Array<{ totalShareStatistics?: Record<string, number> }> | undefined)?.[0]?.totalShareStatistics ?? null) as Record<string, number> | null;
    if (!s) throw new Error("LinkedIn: a página não devolveu estatística deste post");
    return {
      impressoes: s.impressionCount ?? null,
      alcance: s.uniqueImpressionsCount ?? null,
      curtidas: s.likeCount ?? null,
      comentarios: s.commentCount ?? null,
      compartilhamentos: s.shareCount ?? null,
      cliques: s.clickCount ?? null,
    };
  }
  throw new Error("LinkedIn: nenhuma versão da API ativa");
}

/** Curtidas e comentários pela socialActions (o que sobra quando a estatística da página falha). */
async function linkedinAcoes(token: string, urn: string): Promise<NumerosLidos> {
  const d = await jsonOuErro(
    await fetch(`https://api.linkedin.com/v2/socialActions/${encodeURIComponent(urn)}`, {
      headers: { Authorization: `Bearer ${token}`, "X-Restli-Protocol-Version": "2.0.0" },
      signal: AbortSignal.timeout(20_000),
    }),
    "LinkedIn"
  );
  return {
    curtidas: (d.likesSummary as { totalLikes?: number } | undefined)?.totalLikes ?? null,
    comentarios: (d.commentsSummary as { aggregatedTotalComments?: number } | undefined)?.aggregatedTotalComments ?? null,
  };
}

async function instagram(token: string, id: string): Promise<NumerosLidos> {
  const d = await jsonOuErro(await fetch(`https://graph.instagram.com/v21.0/${id}?fields=like_count,comments_count&access_token=${token}`), "Instagram");
  const base: NumerosLidos = { curtidas: d.like_count === undefined ? null : Number(d.like_count), comentarios: d.comments_count === undefined ? null : Number(d.comments_count) };
  // Alcance e visualizações pedem instagram_business_manage_insights, que a
  // revisão do Meta ainda não deu. Quando der, vem junto; sem ela, fica o básico.
  try {
    const ins = await jsonOuErro(await fetch(`https://graph.instagram.com/v21.0/${id}/insights?metric=reach,shares,views,saved&access_token=${token}`), "Instagram");
    for (const m of (ins.data as Array<{ name: string; values?: Array<{ value: number }> }>) ?? []) {
      const v = m.values?.[0]?.value;
      if (v === undefined) continue;
      if (m.name === "reach") base.alcance = v;
      if (m.name === "shares") base.compartilhamentos = v;
      if (m.name === "views") base.visualizacoes = v;
      if (m.name === "saved") base.salvamentos = v;
    }
  } catch {
    /* sem a permissão de insights: segue com curtidas e comentários */
  }
  return base;
}

async function facebook(token: string, id: string): Promise<NumerosLidos> {
  // Vídeo e reel (id sem "pagina_") não têm o campo shares: pedir derruba a
  // chamada inteira ("nonexisting field", medido em 01/10).
  const campos = id.includes("_") ? "likes.summary(true).limit(0),comments.summary(true).limit(0),shares" : "likes.summary(true).limit(0),comments.summary(true).limit(0)";
  const d = await jsonOuErro(await fetch(`https://graph.facebook.com/v21.0/${id}?fields=${campos}&access_token=${token}`), "Facebook");
  return {
    curtidas: (d.likes as { summary?: { total_count?: number } } | undefined)?.summary?.total_count ?? null,
    comentarios: (d.comments as { summary?: { total_count?: number } } | undefined)?.summary?.total_count ?? null,
    // Sem compartilhamento, o Facebook omite o campo: em post comum, ausente é
    // zero de fato; em vídeo, o campo nem existe (fica nulo).
    compartilhamentos: id.includes("_") ? (d.shares as { count?: number } | undefined)?.count ?? 0 : null,
  };
}

/** Preço da API do X por uso (fev/2026): US$ 0,005 por post lido. */
const X_POR_POST = 0.005;

/**
 * X: as métricas PÚBLICAS de até 100 posts por chamada, pelo token do app
 * (X_BEARER_TOKEN). Não depende do token do cliente, que dura 2 horas e se
 * gasta ao renovar; e lê também os posts de conta que já foi desconectada.
 */
async function xPublico(ids: string[]): Promise<Map<string, NumerosLidos> | Error> {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return new Error("A leitura pública do X está desligada (sem X_BEARER_TOKEN).");
  const mapa = new Map<string, NumerosLidos>();
  for (let i = 0; i < ids.length; i += 100) {
    const res = await fetch(`https://api.twitter.com/2/tweets?ids=${ids.slice(i, i + 100).join(",")}&tweet.fields=public_metrics`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null);
    if (!res) return new Error("O X não respondeu.");
    const d = (await res.json().catch(() => ({}))) as { data?: Array<{ id: string; public_metrics?: Record<string, number> }>; title?: string; detail?: string };
    if (!res.ok) return new Error(`X: ${d.detail ?? d.title ?? `HTTP ${res.status}`}`);
    for (const t of d.data ?? []) {
      const m = t.public_metrics ?? {};
      mapa.set(t.id, {
        impressoes: m.impression_count ?? null,
        curtidas: m.like_count ?? null,
        comentarios: m.reply_count ?? null,
        compartilhamentos: m.retweet_count === undefined && m.quote_count === undefined ? null : (m.retweet_count ?? 0) + (m.quote_count ?? 0),
        salvamentos: m.bookmark_count ?? null,
      });
    }
  }
  return mapa;
}

/** O que dizer ao cliente quando a rede recusa por permissão. */
const MOTIVO_SEM_PERMISSAO: Record<string, string> = {
  twitter: "O X recusou o acesso: reconecte a conta do X em Configurações para voltar a ler os números.",
  instagram: "O Instagram recusou o acesso: reconecte a conta em Configurações.",
  facebook: "O Facebook ainda não liberou a leitura dos números da página: depende da aprovação do app pela Meta, que está em análise.",
  tiktok: "O TikTok ainda não liberou a leitura dos vídeos: a permissão entra na próxima revisão do app.",
  linkedin: "O LinkedIn recusou o acesso: reconecte a conta em Configurações.",
};

/* ── A orquestração ─────────────────────────────────────────────────────── */

type Linha = {
  postId: string;
  projectId: string;
  platform: string;
  fonte: FonteDaLeitura;
  status: "ok" | "pendente" | "erro";
  motivo?: string | null;
  lidoEm: Date;
  numeros?: NumerosLidos;
  extras?: Record<string, unknown> | null;
  custoUsd?: number;
};

export type OpcoesDaSincronizacao = {
  /** Só estes posts (o cron manda os que chegaram a um marco). */
  postIds?: string[];
  /** Permite a camada paga do perfil público (padrão: sim). */
  usarApify?: boolean;
  /** Ignora a trava de 20 h por perfil (só para prova manual). */
  forcarApify?: boolean;
  /** Teto de posts por sincronização (padrão 100, os mais recentes). */
  limite?: number;
};

export async function sincronizarMetricas(
  projectId: string,
  opcoes: OpcoesDaSincronizacao = {}
): Promise<{ synced: number; total: number; porRede: Record<string, ResultadoDaRede>; custoUsd: number }> {
  const agora = new Date();
  const posts = await prisma.post.findMany({
    // TODO post que foi ao ar, arquivado ou não: arquivar é limpeza de tela.
    where: { projectId, ...ONDE_SAIU, ...(opcoes.postIds ? { id: { in: opcoes.postIds } } : {}) },
    orderBy: { publishedAt: "desc" },
    take: opcoes.limite ?? 100,
    select: { id: true, platform: true, externalId: true, externalUrl: true, socialAccountId: true, publishedAt: true, content: true, metadata: true },
  });
  const contas = await prisma.socialAccount.findMany({ where: { projectId } });
  const tokens = new Map<string, string | Error>();
  const linhas: Linha[] = [];
  const medidos = new Set<string>();
  // O último motivo por post, para a linha "pendente" quando nada vier.
  const pendencia = new Map<string, { fonte: FonteDaLeitura; motivo: string }>();
  let custoUsd = 0;

  const anotarOk = (p: (typeof posts)[number], fonte: FonteDaLeitura, numeros: NumerosLidos, extra: Partial<Linha> = {}) => {
    if (!temNumero(numeros)) {
      pendencia.set(p.id, { fonte, motivo: "A fonte respondeu sem nenhum número para este post." });
      return;
    }
    linhas.push({ postId: p.id, projectId, platform: p.platform, fonte, status: "ok", lidoEm: agora, numeros, ...extra });
    medidos.add(p.id);
  };
  const anotarPendente = (p: (typeof posts)[number], fonte: FonteDaLeitura, motivo: string) => {
    pendencia.set(p.id, { fonte, motivo: motivo.slice(0, 300) });
  };

  // A conta do post (perfil ou página). Post de conta já desconectada lê com a
  // conta ativa da mesma rede no projeto, só para ler: se recusar, a falha
  // fica registrada e a camada do perfil público tenta.
  //
  // Qual conta ativa: a que MAIS publicou nesta rede no projeto. Medido em
  // 01/10: o projeto Demandou tem @prdonaire e @demandoupostou no Instagram, e
  // a primeira da lista (@prdonaire) não lê os posts antigos da @demandoupostou
  // ("Object does not exist").
  const usos = new Map<string, number>();
  for (const p of posts) if (p.socialAccountId) usos.set(p.socialAccountId, (usos.get(p.socialAccountId) ?? 0) + 1);
  const contaDo = (p: (typeof posts)[number]) =>
    (p.socialAccountId ? contas.find((c) => c.id === p.socialAccountId) : undefined) ??
    contas
      .filter((c) => c.platform === p.platform && c.isActive && c.accessToken)
      .sort((a, b) => (usos.get(b.id) ?? 0) - (usos.get(a.id) ?? 0))[0];
  const tokenDa = async (conta: (typeof contas)[number]): Promise<string | Error> => {
    // Um token por conta por sincronização: renovar o X a cada post gastaria o
    // refresh token, que é de uso único.
    if (!tokens.has(conta.id)) {
      tokens.set(conta.id, await resolveSocialAccountAccessToken(conta).then((x) => x.accessToken).catch((e) => (e instanceof Error ? e : new Error(String(e)))));
    }
    return tokens.get(conta.id)!;
  };

  /* 1. Blotato: o post que saiu por ele. */
  const doBlotato = posts.filter((p) => {
    const conta = contaDo(p);
    return p.externalId?.startsWith("ponte:") || Boolean((p.metadata as { ponte?: unknown } | null)?.ponte) || Boolean(conta?.blotatoAccountId && !conta.accessToken);
  });
  if (doBlotato.length) {
    const lidos = await lerDoBlotato(doBlotato);
    for (const p of doBlotato) {
      const l = lidos.get(p.id);
      if (!l) continue;
      if (l.tipo === "pendente") {
        anotarPendente(p, "blotato", l.motivo);
        continue;
      }
      for (const f of l.fotos) {
        linhas.push({ postId: p.id, projectId, platform: p.platform, fonte: "blotato", status: "ok", lidoEm: f.lidoEm, numeros: f.numeros, extras: { ...f.extras, blotatoId: l.blotatoId } });
      }
      if (l.fotos.some((f) => temNumero(f.numeros))) medidos.add(p.id);
    }
  }

  /* 2. API oficial. */
  const faltam = () => posts.filter((p) => !medidos.has(p.id));

  // X: em lote, pelo token do app.
  const tweets = faltam().filter((p) => p.platform === "twitter");
  if (tweets.length) {
    const idDe = (p: (typeof tweets)[number]) => (/^\d+$/.test(p.externalId ?? "") ? p.externalId! : p.externalUrl?.match(/status(?:es)?\/(\d+)/)?.[1] ?? null);
    const ids = [...new Set(tweets.map(idDe).filter(Boolean) as string[])];
    const r = ids.length ? await xPublico(ids) : new Map<string, NumerosLidos>();
    for (const p of tweets) {
      const id = idDe(p);
      if (r instanceof Error) anotarPendente(p, "api:x", r.message);
      else if (!id) anotarPendente(p, "api:x", "O post não tem o número do X gravado.");
      else if (!r.has(id)) anotarPendente(p, "api:x", "O X não devolveu este post (apagado ou de conta protegida).");
      else {
        anotarOk(p, "api:x", r.get(id)!, { custoUsd: X_POR_POST });
        custoUsd += X_POR_POST;
      }
    }
  }

  // YouTube: em lote, pela Data API (grátis, números públicos).
  const videos = faltam().filter((p) => p.platform === "youtube");
  if (videos.length) {
    const idDe = (p: (typeof videos)[number]) =>
      (/^[\w-]{11}$/.test(p.externalId ?? "") ? p.externalId : null) ?? p.externalUrl?.match(/(?:[?&]v=|youtu\.be\/|\/shorts\/)([\w-]{11})/)?.[1] ?? null;
    const ids = [...new Set(videos.map(idDe).filter(Boolean) as string[])];
    const r = ids.length ? await numerosDosVideos(ids) : new Map();
    for (const p of videos) {
      const id = idDe(p);
      if (!r) anotarPendente(p, "api:youtube", "A API do YouTube não respondeu agora.");
      else if (!id) anotarPendente(p, "api:youtube", "O post não tem o id do vídeo do YouTube gravado.");
      else if (!r.has(id)) anotarPendente(p, "api:youtube", "O YouTube não devolveu este vídeo (privado, não listado sem acesso ou apagado).");
      else anotarOk(p, "api:youtube", r.get(id)!);
    }
  }

  // LinkedIn, Instagram, Facebook e TikTok: pelo token da conta.
  for (const p of faltam()) {
    if (!["linkedin", "instagram", "facebook", "tiktok"].includes(p.platform)) continue;
    const fonte = `api:${p.platform}` as FonteDaLeitura;
    const conta = contaDo(p);
    if (p.platform === "linkedin" && (!conta || conta.accountType === "personal" || !p.socialAccountId)) {
      // Perfil pessoal: o LinkedIn não dá números de post de membro a app de
      // terceiros (403 em socialActions e em memberCreatorPostAnalytics, medido
      // em 01/10). Post sem conta: não sabemos se era página ou perfil. Os dois
      // vão para o post público.
      anotarPendente(p, fonte, conta?.accountType === "personal" ? "O LinkedIn não libera os números de posts do perfil pessoal para aplicativos." : "A conta que publicou este post não está mais conectada.");
      continue;
    }
    if (p.platform === "tiktok" && !/^\d+$/.test(p.externalId ?? "")) {
      // O id gravado é o do ENVIO (v_pub_file...), que a API de consulta não aceita.
      anotarPendente(p, fonte, "O TikTok não devolve o id do vídeo publicado pela API de envio; os números vêm do perfil público.");
      continue;
    }
    if (!conta?.accessToken) {
      anotarPendente(p, fonte, conta ? "Esta conta foi ligada sem token próprio; os números vêm do Blotato ou do perfil público." : "A conta que publicou este post não está mais conectada.");
      continue;
    }
    const token = await tokenDa(conta);
    if (token instanceof Error) {
      anotarPendente(p, fonte, MOTIVO_SEM_PERMISSAO[p.platform] ?? token.message);
      continue;
    }
    try {
      const id = p.externalId!;
      const numeros =
        p.platform === "linkedin"
          ? conta.accountType === "organization" && conta.organizationId
            ? await linkedinPagina(token, conta.organizationId, id).catch(() => linkedinAcoes(token, id))
            : await linkedinAcoes(token, id)
          : p.platform === "instagram" ? await instagram(token, id)
          : p.platform === "facebook" ? await facebook(token, id)
          : await tiktokPorId(token, id);
      anotarOk(p, fonte, numeros);
    } catch (e) {
      anotarPendente(p, fonte, e instanceof SemPermissao ? MOTIVO_SEM_PERMISSAO[p.platform] ?? e.message : e instanceof Error ? e.message : "falha desconhecida");
    }
  }

  /* 3. Perfil público (Apify), só para o que sobrou. */
  if (opcoes.usarApify !== false) {
    // Desligado por padrão: o medido pela API sem visualização também vai ao perfil público.
    const paraCompletar = completarPeloPerfilPublico()
      ? posts.filter((p) => medidos.has(p.id) && faltaNoPerfilPublico(p.platform, linhas.filter((l) => l.postId === p.id && l.status === "ok").at(-1)?.numeros))
      : [];
    const completar = new Set(paraCompletar.map((p) => p.id));
    const alvos: AlvoDaApify[] = [...faltam(), ...paraCompletar]
      .filter((p) => ["linkedin", "instagram", "facebook", "tiktok"].includes(p.platform))
      .map((p) => {
        const conta = contaDo(p);
        const perfil =
          p.platform === "instagram" ? conta?.username ?? null
          : p.platform === "tiktok" ? p.externalUrl?.match(/tiktok\.com\/@([\w.]+)/)?.[1] ?? conta?.username ?? null
          : p.platform === "facebook"
            ? (p.externalId?.includes("_") ? p.externalId.split("_")[0] : null) ?? p.externalUrl?.match(/facebook\.com\/(\d{6,})\//)?.[1] ?? conta?.platformUserId ?? null
            : null;
        return { postId: p.id, platform: p.platform, externalUrl: p.externalUrl, externalId: p.externalId, publishedAt: p.publishedAt!, content: p.content, perfil };
      });
    if (alvos.length) {
      const r = await lerPelaApify(projectId, alvos, { forcar: opcoes.forcarApify });
      custoUsd += r.custoUsd;
      // O que veio para completar soma uma leitura; o que não veio não vira pendente (o post já tem número).
      for (const p of paraCompletar) {
        const l = r.lidos.get(p.id);
        if (l?.tipo === "ok") anotarOk(p, l.fonte, l.numeros, { custoUsd: l.custoUsd });
      }
      for (const p of faltam()) {
        if (completar.has(p.id)) continue;
        const l = r.lidos.get(p.id);
        if (!l) continue;
        if (l.tipo === "ok") anotarOk(p, l.fonte, l.numeros, { custoUsd: l.custoUsd });
        else {
          // O motivo da camada oficial costuma explicar melhor o porquê; o da
          // Apify vai junto quando ela também não trouxe.
          const antes = pendencia.get(p.id);
          anotarPendente(p, l.fonte, antes ? `${antes.motivo} ${l.motivo}` : l.motivo);
        }
      }
    }
  }

  /* 4. O que não veio de lugar nenhum: uma linha "pendente" com o motivo. */
  // Post que JÁ tem número lido há menos de 20 h (o perfil público só é lido
  // uma vez por dia) não ganha linha "pendente": não está pendente, só não foi
  // relido agora. Sem isto o aviso da tela dizia "12 pendentes" sobre posts
  // medidos minutos antes.
  const recentes = new Set(
    (
      await prisma.leituraDeMetrica.findMany({
        where: { postId: { in: faltam().map((p) => p.id) }, status: "ok", criadoEm: { gte: new Date(agora.getTime() - 20 * 3600_000) } },
        select: { postId: true },
        distinct: ["postId"],
      })
    ).map((l) => l.postId)
  );
  for (const p of faltam()) {
    if (recentes.has(p.id)) continue;
    const pend = pendencia.get(p.id) ?? { fonte: "nenhuma" as FonteDaLeitura, motivo: "Nenhuma fonte de números para esta rede ainda." };
    linhas.push({ postId: p.id, projectId, platform: p.platform, fonte: pend.fonte, status: "pendente", motivo: pend.motivo, lidoEm: agora });
  }

  if (linhas.length) {
    await prisma.leituraDeMetrica.createMany({
      data: linhas.map((l) => ({
        postId: l.postId,
        projectId: l.projectId,
        platform: l.platform,
        fonte: l.fonte,
        status: l.status,
        motivo: l.motivo ?? null,
        lidoEm: l.lidoEm,
        ...(l.numeros ?? {}),
        extras: (l.extras ?? undefined) as never,
        custoUsd: l.custoUsd ?? 0,
      })),
      // A foto do Blotato que já está gravada (mesmo post, fonte e hora) não repete.
      skipDuplicates: true,
    });
  }
  await consolidarUltimoNumero([...medidos]);

  const porRede: Record<string, ResultadoDaRede> = {};
  for (const p of posts) {
    const r = (porRede[p.platform] ??= { ok: 0, falhou: 0, motivo: null, fontes: {} });
    if (medidos.has(p.id) || recentes.has(p.id)) {
      r.ok++;
      const f = linhas.filter((l) => l.postId === p.id && l.status === "ok").at(-1)?.fonte ?? (recentes.has(p.id) ? "lido nas últimas 20 h" : "blotato");
      r.fontes![f] = (r.fontes![f] ?? 0) + 1;
    } else {
      r.falhou++;
      r.motivo ??= pendencia.get(p.id)?.motivo ?? null;
    }
  }
  return { synced: medidos.size, total: posts.length, porRede, custoUsd };
}

async function tiktokPorId(token: string, id: string): Promise<NumerosLidos> {
  const res = await fetch("https://open.tiktokapis.com/v2/video/query/?fields=id,view_count,like_count,comment_count,share_count", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ filters: { video_ids: [id] } }),
  });
  const d = (await res.json().catch(() => ({}))) as { data?: { videos?: Array<Record<string, number>> }; error?: { code?: string; message?: string } };
  if (d.error?.code && d.error.code !== "ok") {
    if (/scope/i.test(d.error.code)) throw new SemPermissao(d.error.message ?? d.error.code);
    throw new Error(`TikTok: ${d.error.message ?? d.error.code}`);
  }
  const v = d.data?.videos?.[0];
  if (!v) throw new Error("TikTok: vídeo não encontrado");
  return { visualizacoes: v.view_count ?? null, curtidas: v.like_count ?? null, comentarios: v.comment_count ?? null, compartilhamentos: v.share_count ?? null };
}

/**
 * O "último número" de cada post no post_metrics (as telas antigas, o painel
 * inicial e o insight leem dali): para cada campo, a leitura mais recente que
 * trouxe aquele campo, de qualquer fonte.
 */
export async function consolidarUltimoNumero(postIds: string[]): Promise<void> {
  if (!postIds.length) return;
  const leituras = await prisma.leituraDeMetrica.findMany({
    where: { postId: { in: postIds }, status: "ok" },
    orderBy: { lidoEm: "desc" },
  });
  const porPost = new Map<string, typeof leituras>();
  for (const l of leituras) {
    const lista = porPost.get(l.postId) ?? [];
    lista.push(l);
    porPost.set(l.postId, lista);
  }
  for (const [postId, lista] of porPost) {
    const ultimo = <K extends keyof (typeof lista)[number]>(k: K) => lista.find((l) => l[k] !== null && l[k] !== undefined)?.[k] as number | undefined;
    const dados = {
      impressions: ultimo("impressoes") ?? ultimo("alcance") ?? 0,
      likes: ultimo("curtidas") ?? 0,
      comments: ultimo("comentarios") ?? 0,
      shares: ultimo("compartilhamentos") ?? 0,
      clicks: ultimo("cliques") ?? 0,
      videoViews: ultimo("visualizacoes") ?? 0,
      syncedAt: lista[0].lidoEm,
    };
    await prisma.postMetric.upsert({ where: { postId }, create: { postId, ...dados }, update: dados });
  }
}
