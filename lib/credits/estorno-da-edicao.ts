import { prisma } from "@/lib/db/prisma";
import { creditar } from "@/lib/credits";
import {
  CREDITOS_DA_ABERTURA_DO_COMPLETO,
  CREDITOS_DA_MONTAGEM_DO_CORTE,
  CREDITOS_POR_CORTE_APROVADO,
  creditosDaAprovacao,
  creditosPorCorteAprovado,
  roteiroPagoNoPrecoAntigo,
} from "@/lib/media/limits";

/**
 * A DEVOLUÇÃO DOS CRÉDITOS DA EDIÇÃO NÃO ENTREGUE (02/10/2026, prometida ao
 * Bruno antes de abrir para os 10 vendedores).
 *
 * Duas situações devolvem, e só elas:
 *   1. a montagem de efeitos DESISTIU por erro técnico nosso (render, worker,
 *      prazo), depois das novas tentativas automáticas;
 *   2. a revisão visual não conseguiu consertar em 2 rodadas e a plataforma
 *      entregou a VERSÃO SEGURA (sem inserção).
 * Nas duas, o cliente recebe a fala editada, mas não a montagem pela qual
 * pagou. Volta a parte que não foi entregue (lib/media/limits.ts,
 * `CREDITOS_DA_MONTAGEM_DO_CORTE` e a parte do completo da aprovação), pelo
 * mesmo `creditar` do estorno do roteiro: uma linha no extrato, na conta que
 * pagou, com o motivo. Idempotente por peça: a mesma peça nunca devolve duas
 * vezes, e nunca mais do que a aprovação cobrou deste vídeo.
 *
 * Se depois o cliente pede de novo ("Tentar a montagem de novo", sem cobrar)
 * e a montagem sai, ela sai de cortesia: a falha foi nossa.
 */

export const OPERACAO_DO_ESTORNO_DA_EDICAO = "estorno_edicao";
const OPERACAO_DA_APROVACAO = "video_aprovacao";
const OPERACAO_DO_ROTEIRO = "video_roteiro";

export type AlvoDoEstorno = "completo" | number;

export const refDoEstorno = (videoId: string, alvo: AlvoDoEstorno) => `${videoId}:${alvo === "completo" ? "completo" : `corte-${alvo}`}`;

/** Quanto volta, pela tabela de preço que o cliente pagou (o de até 30/09 vale para quem pagou nele). */
export function creditosDaParteNaoEntregue(p: { alvo: AlvoDoEstorno; duracaoSeg: number; precoAntigo: boolean; comAbertura: boolean }): number {
  if (p.alvo === "completo") return creditosDaAprovacao(p.duracaoSeg, 0, p.precoAntigo) + (p.comAbertura ? CREDITOS_DA_ABERTURA_DO_COMPLETO : 0);
  const fracao = CREDITOS_DA_MONTAGEM_DO_CORTE / CREDITOS_POR_CORTE_APROVADO;
  return Math.round(creditosPorCorteAprovado(p.precoAntigo) * fracao);
}

/**
 * Devolve a parte não entregue de uma peça. Devolve quanto voltou (0 quando já
 * tinha voltado, quando nada foi cobrado, ou quando a conta é interna).
 */
export async function estornarEdicaoNaoEntregue(p: { videoId: string; alvo: AlvoDoEstorno; motivo: string; comAbertura?: boolean }): Promise<number> {
  const refId = refDoEstorno(p.videoId, p.alvo);
  const ja = await prisma.creditTransaction.count({ where: { operation: OPERACAO_DO_ESTORNO_DA_EDICAO, refId } });
  if (ja > 0) return 0;
  const v = await prisma.videoJob.findUnique({ where: { id: p.videoId }, select: { userId: true, durationSec: true, sizeBytes: true } });
  if (!v) return 0;
  const [aprovacao, roteiro, devolvidos] = await Promise.all([
    prisma.creditTransaction.aggregate({ where: { operation: OPERACAO_DA_APROVACAO, refId: p.videoId, amount: { lt: 0 } }, _sum: { amount: true } }),
    prisma.creditTransaction.findFirst({ where: { operation: OPERACAO_DO_ROTEIRO, refId: p.videoId }, select: { amount: true } }),
    prisma.creditTransaction.aggregate({ where: { operation: OPERACAO_DO_ESTORNO_DA_EDICAO, refId: { startsWith: `${p.videoId}:` } }, _sum: { amount: true } }),
  ]);
  const cobrado = Math.abs(aprovacao._sum.amount ?? 0);
  const jaDevolvido = devolvidos._sum.amount ?? 0;
  if (cobrado <= 0) return 0;
  const precoAntigo = roteiroPagoNoPrecoAntigo(roteiro?.amount, v.durationSec ?? 0, Number(v.sizeBytes ?? 0) || undefined);
  const quantidade = Math.min(creditosDaParteNaoEntregue({ alvo: p.alvo, duracaoSeg: v.durationSec ?? 0, precoAntigo, comAbertura: Boolean(p.comAbertura) }), cobrado - jaDevolvido);
  if (quantidade <= 0) return 0;
  await creditar({
    userId: v.userId,
    quantidade,
    operation: OPERACAO_DO_ESTORNO_DA_EDICAO,
    refId,
    note: `devolução: ${p.alvo === "completo" ? "montagem do vídeo completo" : `montagem do corte ${p.alvo + 1}`} não entregue (${p.motivo.slice(0, 160)})`,
  });
  await prisma.videoJob.update({ where: { id: p.videoId }, data: { creditsCharged: { decrement: quantidade } } }).catch(() => undefined);
  return quantidade;
}

/** O que já voltou por peça, para o aviso da tela: refId do estorno para créditos. */
export async function estornosDaEdicao(videoIds: string[]): Promise<Map<string, number>> {
  if (!videoIds.length) return new Map();
  const linhas = await prisma.creditTransaction.findMany({
    where: { operation: OPERACAO_DO_ESTORNO_DA_EDICAO, OR: videoIds.map((id) => ({ refId: { startsWith: `${id}:` } })) },
    select: { refId: true, amount: true },
  });
  return new Map(linhas.filter((l) => l.refId).map((l) => [l.refId!, l.amount]));
}
