import { conferirResposta, marcarChamadaOk } from "@/lib/fornecedores/aviso-de-saldo";
/**
 * A APIFY, por API (01/10). Roda um ator com teto de itens e de gasto, espera
 * terminar e devolve os itens e o custo da execução.
 *
 * Medido em 01/10 no plano grátis:
 *   • a execução devolve `usageTotalUsd` com o custo dos eventos cobrados
 *     (instagram-scraper: 4 posts = US$ 0,0108, a US$ 0,0027 cada), mas às vezes
 *     ele chega atrasado (TikTok e LinkedIn vieram com 0 logo após terminar). Por
 *     isso o custo gravado é o MAIOR entre o informado e a estimativa pela
 *     tabela de preço por item abaixo: superestimar é seguro, subestimar é o
 *     que esconde prejuízo;
 *   • o ator do TikTok recusa teto de gasto abaixo de US$ 0,50 por execução
 *     ("max-total-charge-usd-below-minimum"); o limite real ali é o maxItems.
 *
 * O token nunca vai para log nem para resposta.
 */

export const ATORES = {
  instagramPosts: "apify~instagram-scraper",
  instagramReels: "apify~instagram-reel-scraper",
  instagramPerfil: "apify~instagram-profile-scraper",
  instagramHashtag: "apify~instagram-hashtag-scraper",
  tiktok: "clockworks~tiktok-scraper",
  linkedinEmpresa: "harvestapi~linkedin-company-posts",
} as const;

/** Preço por item no plano grátis (o mais caro), mais a partida do ator, lidos em 01/10. */
const PRECO_POR_ITEM: Record<string, { item: number; partida: number; tetoMinimo?: number }> = {
  [ATORES.instagramPosts]: { item: 0.0027, partida: 0 },
  [ATORES.instagramReels]: { item: 0.0026, partida: 0.001 },
  [ATORES.instagramPerfil]: { item: 0.0026, partida: 0 },
  [ATORES.instagramHashtag]: { item: 0.0026, partida: 0 },
  [ATORES.tiktok]: { item: 0.0037, partida: 0.001, tetoMinimo: 0.5 },
  [ATORES.linkedinEmpresa]: { item: 0.002, partida: 0.00005 },
};

export function estimativaDoAtor(ator: string, itens: number): number {
  const p = PRECO_POR_ITEM[ator] ?? { item: 0.005, partida: 0.001 };
  return p.partida + p.item * itens;
}

export function apifyConfigurada(): boolean {
  return Boolean(process.env.APIFY_TOKEN);
}

export type ResultadoDoAtor<T> = { itens: T[]; custoUsd: number; status: string; erro?: string };

const TERMINAIS = ["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"];

export async function rodarAtor<T = Record<string, unknown>>(
  ator: string,
  entrada: Record<string, unknown>,
  opcoes: { maxItens: number; maxUsd: number; prazoMs?: number }
): Promise<ResultadoDoAtor<T>> {
  const token = process.env.APIFY_TOKEN;
  if (!token) return { itens: [], custoUsd: 0, status: "erro", erro: "APIFY_TOKEN ausente" };
  const h = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const minimo = PRECO_POR_ITEM[ator]?.tetoMinimo ?? 0;
  const teto = Math.max(minimo, opcoes.maxUsd).toFixed(4);
  const estimado = estimativaDoAtor(ator, opcoes.maxItens);
  const prazo = Date.now() + (opcoes.prazoMs ?? 240_000);

  try {
    const r = await fetch(`https://api.apify.com/v2/acts/${ator}/runs?waitForFinish=60&maxItems=${opcoes.maxItens}&maxTotalChargeUsd=${teto}`, {
      method: "POST",
      headers: h,
      body: JSON.stringify(entrada),
      signal: AbortSignal.timeout(90_000),
    });
    const corpo = (await r.json().catch(() => ({}))) as { data?: ExecucaoDaApify; error?: { type?: string; message?: string } };
    let run = corpo.data;
    if (!r.ok) await conferirResposta("apify", { status: r.status, corpo }, `leitura pública pela Apify (${ator})`);
    else marcarChamadaOk("apify");
    if (!r.ok || !run) return { itens: [], custoUsd: 0, status: "erro", erro: `${r.status} ${corpo.error?.type ?? ""} ${corpo.error?.message ?? ""}`.trim().slice(0, 300) };

    while (!TERMINAIS.includes(run.status) && Date.now() < prazo) {
      const atual: ExecucaoDaApify = run;
      const x: Response = await fetch(`https://api.apify.com/v2/actor-runs/${atual.id}?waitForFinish=60`, { headers: h, signal: AbortSignal.timeout(90_000) });
      const lido = ((await x.json().catch(() => ({}))) as { data?: ExecucaoDaApify }).data;
      run = lido ?? atual;
    }
    if (!TERMINAIS.includes(run.status)) {
      // Passou do prazo: aborta para não continuar gastando sem ninguém ler.
      await fetch(`https://api.apify.com/v2/actor-runs/${run.id}/abort`, { method: "POST", headers: h }).catch(() => {});
      return { itens: [], custoUsd: estimado, status: "erro", erro: "prazo esgotado; execução abortada" };
    }
    const d = await fetch(`https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?clean=true&limit=${opcoes.maxItens}`, {
      headers: h,
      signal: AbortSignal.timeout(60_000),
    });
    const itens = ((await d.json().catch(() => [])) as T[]) ?? [];
    const lista = Array.isArray(itens) ? itens : [];
    // O custo informado pode chegar atrasado: relê uma vez e fica com o maior
    // entre o informado e a estimativa pelos itens entregues.
    const relido = ((await (await fetch(`https://api.apify.com/v2/actor-runs/${run.id}`, { headers: h })).json().catch(() => ({}))) as { data?: ExecucaoDaApify }).data;
    const informado = Number(relido?.usageTotalUsd ?? run.usageTotalUsd ?? 0);
    const custoUsd = Math.max(informado, estimativaDoAtor(ator, lista.length));
    return { itens: lista, custoUsd, status: run.status === "SUCCEEDED" ? (lista.length ? "ok" : "vazio") : "erro", erro: run.status === "SUCCEEDED" ? undefined : run.status };
  } catch (e) {
    return { itens: [], custoUsd: 0, status: "erro", erro: e instanceof Error ? e.message.slice(0, 300) : "falha na Apify" };
  }
}

type ExecucaoDaApify = { id: string; status: string; defaultDatasetId: string; usageTotalUsd?: number };
