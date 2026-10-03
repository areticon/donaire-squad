import { chaveDoBlotato } from "@/lib/blotato";
import type { NumerosLidos } from "@/lib/analytics/fontes-da-leitura";

/**
 * OS NÚMEROS PELO BLOTATO (01/10), camada 1 da medição.
 *
 * O Blotato só mede o que ele mesmo publicou, na conta da Demandou (pesquisa
 * de 01/10). O nosso post publicado por ele guarda `externalId =
 * "ponte:<postSubmissionId>"` quando o link não trouxe o id da rede, e esse
 * número NÃO serve para a análise: `/posts/{id}/analytics` pede o id do post
 * publicado, que só aparece em `/published-posts`. O casamento é pelo link
 * (`postUrl` deles contra o nosso `externalUrl`).
 *
 * Segurança: `GET /users/me` devolve a própria chave no corpo. Este arquivo
 * nunca chama essa rota e nunca registra corpo de resposta em log.
 *
 * Contagem vem como texto ("18400"); campo ausente é ausente, e zero é zero
 * de verdade (documentação do Blotato). `metrics: null` é "ainda não lido".
 */

const BASE = (process.env.BLOTATO_API_BASE ?? "https://backend.blotato.com/v2").replace(/\/$/, "");

type ItemPublicado = {
  id: string;
  platform?: string;
  postUrl?: string | null;
  createdAt?: string;
  latestMetrics?: { fetchedAt?: string; metrics?: Record<string, unknown> | null } | null;
  metricsHistory?: Array<{ fetchedAt?: string; metrics?: Record<string, unknown> | null }>;
};

async function get<T>(caminho: string): Promise<{ ok: boolean; status: number; corpo: T | null; mensagem: string | null }> {
  const chave = chaveDoBlotato();
  if (!chave) return { ok: false, status: 0, corpo: null, mensagem: "sem chave do Blotato" };
  const r = await fetch(`${BASE}${caminho}`, {
    headers: { "blotato-api-key": chave, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!r) return { ok: false, status: 0, corpo: null, mensagem: "sem resposta do Blotato" };
  const j = (await r.json().catch(() => null)) as (T & { message?: string }) | null;
  return { ok: r.ok, status: r.status, corpo: r.ok ? j : null, mensagem: r.ok ? null : typeof j?.message === "string" ? j.message.slice(0, 200) : `HTTP ${r.status}` };
}

/** O link sem protocolo, www, barra final e parâmetros, para casar x.com com twitter.com etc. */
export function linkNormalizado(url: string | null | undefined): string | null {
  if (!url) return null;
  let u = url.trim();
  try {
    u = decodeURIComponent(u);
  } catch {
    // link com % solto: fica como veio
  }
  return u
    .replace(/^https?:\/\//i, "")
    .replace(/^(www\.|m\.)/i, "")
    .replace(/^twitter\.com\//i, "x.com/")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

const contagem = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** As métricas do Blotato no nosso formato; os campos próprios vão para extras. */
export function numerosDoBlotato(m: Record<string, unknown> | null | undefined): { numeros: NumerosLidos; extras: Record<string, unknown> } | null {
  if (!m) return null;
  const soma = (...vs: Array<number | null>) => (vs.every((v) => v === null) ? null : vs.reduce<number>((s, v) => s + (v ?? 0), 0));
  const numeros: NumerosLidos = {
    impressoes: contagem(m.impressionsCount),
    alcance: contagem(m.reachCount),
    visualizacoes: contagem(m.viewsCount) ?? contagem(m.playsCount),
    curtidas: contagem(m.likesCount),
    comentarios: contagem(m.commentsCount) ?? contagem(m.repliesCount),
    compartilhamentos: soma(contagem(m.sharesCount), contagem(m.twitterRetweetsCount), contagem(m.twitterQuotesCount)),
    salvamentos: contagem(m.savesCount),
    cliques: contagem(m.clicksCount),
  };
  const usados = new Set(["impressionsCount", "reachCount", "viewsCount", "playsCount", "likesCount", "commentsCount", "repliesCount", "sharesCount", "twitterRetweetsCount", "twitterQuotesCount", "savesCount", "clicksCount"]);
  const extras = Object.fromEntries(Object.entries(m).filter(([k]) => !usados.has(k)));
  return { numeros, extras };
}

export type FotoDoBlotato = { lidoEm: Date; numeros: NumerosLidos; extras: Record<string, unknown> };
export type LeituraDoBlotato =
  | { tipo: "ok"; blotatoId: string; fotos: FotoDoBlotato[] }
  | { tipo: "pendente"; motivo: string };

/**
 * Os posts publicados da conta (até 500, de 100 em 100), indexados pelo link.
 * Uma chamada por sincronização, não uma por post.
 */
async function publicadosPorLink(): Promise<{ mapa: Map<string, ItemPublicado>; erro: string | null }> {
  const mapa = new Map<string, ItemPublicado>();
  for (let offset = 0; offset < 500; offset += 100) {
    const r = await get<{ items?: ItemPublicado[]; count?: number }>(`/published-posts?limit=100&offset=${offset}&sortBy=newest`);
    if (!r.ok) return { mapa, erro: r.mensagem };
    const itens = r.corpo?.items ?? [];
    for (const i of itens) {
      const k = linkNormalizado(i.postUrl);
      if (k) mapa.set(k, i);
    }
    if (itens.length < 100 || offset + 100 >= (r.corpo?.count ?? 0)) break;
  }
  return { mapa, erro: null };
}

/**
 * Lê os posts do Blotato: acha o id publicado pelo link e traz a foto mais
 * recente e o histórico inteiro (cada foto vira uma linha de leitura).
 */
export async function lerDoBlotato(posts: Array<{ id: string; externalUrl: string | null }>): Promise<Map<string, LeituraDoBlotato>> {
  const saida = new Map<string, LeituraDoBlotato>();
  if (!posts.length) return saida;
  if (!chaveDoBlotato()) {
    for (const p of posts) saida.set(p.id, { tipo: "pendente", motivo: "A leitura pelo Blotato está desligada (sem chave no ambiente)." });
    return saida;
  }
  const { mapa, erro } = await publicadosPorLink();
  for (const p of posts) {
    const k = linkNormalizado(p.externalUrl);
    const item = k ? mapa.get(k) : undefined;
    if (!item) {
      saida.set(p.id, {
        tipo: "pendente",
        motivo: erro
          ? `O Blotato não respondeu à lista de publicados (${erro}).`
          : p.externalUrl
            ? "O Blotato ainda não lista este post entre os publicados da conta."
            : "O post não tem link publicado para casar com o Blotato.",
      });
      continue;
    }
    const a = await get<{ lastFetchedAt?: string | null; lastError?: string | null; metrics?: Record<string, unknown> | null; history?: Array<{ fetchedAt?: string; metrics?: Record<string, unknown> | null }> }>(
      `/posts/${encodeURIComponent(item.id)}/analytics`
    );
    // 404 com "have not yet synced": o Blotato lê nos marcos do plano (dias 1,
    // 7, 14 e 30 no Starter); antes disso não há foto, e isso é pendente.
    const fotosBrutas = a.ok ? [...(a.corpo?.history ?? [])] : [...(item.metricsHistory ?? [])];
    if (a.ok && a.corpo?.metrics && a.corpo.lastFetchedAt && !fotosBrutas.some((f) => f.fetchedAt === a.corpo!.lastFetchedAt)) {
      fotosBrutas.push({ fetchedAt: a.corpo.lastFetchedAt, metrics: a.corpo.metrics });
    }
    if (!a.ok && item.latestMetrics?.metrics && item.latestMetrics.fetchedAt) fotosBrutas.push(item.latestMetrics);
    const fotos: FotoDoBlotato[] = [];
    for (const f of fotosBrutas) {
      const n = numerosDoBlotato(f.metrics);
      if (!n || !f.fetchedAt) continue;
      fotos.push({ lidoEm: new Date(f.fetchedAt), ...n });
    }
    if (fotos.length) saida.set(p.id, { tipo: "ok", blotatoId: item.id, fotos });
    else saida.set(p.id, { tipo: "pendente", motivo: a.mensagem && !a.ok ? `Blotato: ${a.mensagem}` : "O Blotato ainda não leu os números deste post (ele lê nos dias 1, 7, 14 e 30)." });
  }
  return saida;
}
