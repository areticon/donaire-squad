import { prisma } from "@/lib/db/prisma";
import { gastoMaximoPorExecucao } from "@/lib/referencias/config";

/**
 * OS TETOS DE GASTO DAS ANÁLISES DAS REFERÊNCIAS (02/10/2026).
 *
 * Regra do Bruno: saber o valor antes de gastar. Os tetos em vigor são os da
 * leitura de métricas (lib/analytics/fonte-apify.ts): US$ 0,30 por execução e
 * US$ 3 por mês. As execuções novas (descoberta, estudo e tendências pedidos
 * pelas análises) obedecem os dois, e cada uma é uma execução própria, com o
 * seu caixa de US$ 0,30.
 *
 *   REFERENCIAS_GASTO_MAX_USD  teto por execução (o menor entre ele e 0,30)
 *   REFERENCIAS_MES_USD        teto do mês somando TODAS as coletas de
 *                              referência da plataforma (padrão 3)
 *
 * Subir qualquer um dos dois é decisão do Bruno: o código nunca sobe sozinho.
 */

/** O teto de uma execução das análises: o menor entre o configurado e US$ 0,30. */
export function tetoPorExecucaoUsd(): number {
  return Math.min(gastoMaximoPorExecucao(), 0.3);
}

// US$ 12 por mês aprovado pelo Bruno em 02/10 ("apify ok"): uns 10 projetos
// com tendências toda semana, um estudo a cada 15 dias e 5 projetos novos.
// Era US$ 3. A variável de ambiente, se existir, ainda manda.
export function tetoDoMesUsd(): number {
  const n = Number(process.env.REFERENCIAS_MES_USD ?? 12);
  return Number.isFinite(n) && n > 0 ? n : 12;
}

/** Quanto a plataforma inteira gastou em coletas de referência no mês (UTC), somando todos os projetos. */
export async function gastoDoMesNasReferencias(agora = new Date()): Promise<number> {
  const inicio = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
  const r = await prisma.referenciaColeta.aggregate({ where: { createdAt: { gte: inicio } }, _sum: { custoUsd: true } });
  return Number(r._sum.custoUsd ?? 0);
}

/** Se uma execução estimada em `estimadoUsd` ainda cabe no mês. */
export async function cabeNoMes(estimadoUsd: number): Promise<{ cabe: boolean; gasto: number; teto: number }> {
  const gasto = await gastoDoMesNasReferencias();
  const teto = tetoDoMesUsd();
  return { cabe: gasto + estimadoUsd <= teto, gasto, teto };
}
