import { creditar } from "@/lib/credits";

/**
 * A REFAÇÃO DO COMPLETO QUE NÃO SAIU (08/10/2026): o cliente aplicou um corte
 * no vídeo completo já entregue, e a base nova ou a montagem dela falharam. O
 * vídeo de antes continua no ar (lib/media/corte-do-completo.ts), então a
 * refação não aconteceu: o que ela cobrou volta, uma vez só, na conta que
 * pagou. Separado do estorno da edição (lib/credits/estorno-da-edicao.ts) de
 * propósito: aquele devolve a montagem que o cliente não recebeu e tem teto no
 * que a aprovação cobrou; aqui a montagem de antes está no ar.
 */

export const OPERACAO_DO_ESTORNO_DA_REFACAO = "corte_refacao_estorno";

export const refDaRefacaoDoCompleto = (videoId: string, refacao: number) => `${videoId}:completo:refacao:${refacao}`;

/** Devolve quanto voltou (0 quando a refação foi cortesia ou já tinha voltado). */
export async function estornarRefacaoDoCompleto(videoId: string, r: { refacao: number; creditos: number; userId: string }): Promise<number> {
  if (!(r.creditos > 0) || !r.userId) return 0;
  const feito = await creditar({
    userId: r.userId,
    quantidade: r.creditos,
    operation: OPERACAO_DO_ESTORNO_DA_REFACAO,
    refId: refDaRefacaoDoCompleto(videoId, r.refacao),
    note: `devolução: o corte ${r.refacao} do vídeo completo não foi aplicado (o vídeo segue como estava)`,
    unico: true,
  });
  return feito.duplicado ? 0 : r.creditos;
}
