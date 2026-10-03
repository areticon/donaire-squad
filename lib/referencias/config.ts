import { REDES_DE_REFERENCIA, type RedeDeReferencia } from "@/lib/referencias/tipos";

/**
 * AS CHAVES DO TRILHO DE REFERÊNCIAS (01/10), no estilo do PUBLICAR_VIA_BLOTATO.
 *
 *   REFERENCIAS_REDES          redes ligadas, separadas por vírgula
 *                              ("instagram,tiktok,linkedin,youtube,x" ou "todas").
 *                              Vazia ou ausente: o trilho inteiro fica desligado.
 *   APIFY_TOKEN                obrigatório para Instagram, TikTok e LinkedIn.
 *   REFERENCIAS_MAX_ITENS      posts por perfil em cada coleta (padrão 20).
 *   REFERENCIAS_GASTO_MAX_USD  teto de gasto por execução, somando Apify e X
 *                              (padrão 0,50). Passou do teto, a execução para e
 *                              grava a coleta como "sem_orcamento".
 *
 * YouTube e X vão pelas APIs oficiais que já temos (conta de serviço do Google
 * e X_BEARER_TOKEN), nunca pela Apify: a pesquisa de 01/10 mostrou que, onde
 * há API oficial que lê terceiros, ela ganha em custo e em risco.
 */

/** Dias que o dado bruto de terceiro fica guardado. */
export const RETENCAO_DIAS = 90;

/** Post mais novo que isto ainda não entra no cálculo de ganho (não amadureceu). */
export const IDADE_MINIMA_DIAS = 7;

const APIFY_REDES: RedeDeReferencia[] = ["instagram", "tiktok", "linkedin"];

export function redesLigadas(): RedeDeReferencia[] {
  const bruto = (process.env.REFERENCIAS_REDES ?? "").trim().toLowerCase();
  if (!bruto) return [];
  const pedidas = bruto === "todas" ? REDES_DE_REFERENCIA : (bruto.split(/[,\s]+/).filter(Boolean) as RedeDeReferencia[]);
  return pedidas.filter((r) => {
    if (!REDES_DE_REFERENCIA.includes(r)) return false;
    if (APIFY_REDES.includes(r)) return Boolean(process.env.APIFY_TOKEN);
    if (r === "x") return Boolean(process.env.X_BEARER_TOKEN);
    return true;
  });
}

export function trilhoLigado(): boolean {
  return redesLigadas().length > 0;
}

export function maxItensPorPerfil(): number {
  const n = Number(process.env.REFERENCIAS_MAX_ITENS ?? 20);
  return Number.isFinite(n) && n > 0 ? Math.min(60, Math.round(n)) : 20;
}

export function gastoMaximoPorExecucao(): number {
  const n = Number(process.env.REFERENCIAS_GASTO_MAX_USD ?? 0.5);
  return Number.isFinite(n) && n > 0 ? n : 0.5;
}

/**
 * O caixa de uma execução: cada chamada paga pergunta antes se cabe e anota
 * depois quanto custou. Uma execução nunca passa do teto por mais que o preço
 * de UMA chamada (a que estava em curso quando o teto foi atingido).
 */
export class Caixa {
  gasto = 0;
  constructor(readonly teto = gastoMaximoPorExecucao()) {}
  cabe(estimado: number): boolean {
    return this.gasto + estimado <= this.teto;
  }
  anotar(valor: number) {
    this.gasto += Math.max(0, valor);
  }
}
