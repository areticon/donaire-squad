import { prisma } from "@/lib/db/prisma";
import type { DecisaoDosCortes } from "@/lib/media/decisao-dos-cortes";

/**
 * Lê só a decisão da aprovação (06/10) do roteiro gravado em
 * `completoMontagem.roteiro`, sem puxar o módulo inteiro do roteiro (que
 * importaria meia esteira em quem só precisa saber se pode haver corte).
 */
export async function lerDecisaoDosCortes(videoId: string): Promise<DecisaoDosCortes | null> {
  const linhas = await prisma.$queryRaw<Array<{ aprovadoEm: string | null; soCompleto: boolean | null; cortesAprovados: number[] | null }>>`
    SELECT "completoMontagem" -> 'roteiro' ->> 'aprovadoEm' AS "aprovadoEm",
           ("completoMontagem" -> 'roteiro' ->> 'soCompleto')::boolean AS "soCompleto",
           "completoMontagem" -> 'roteiro' -> 'cortesAprovados' AS "cortesAprovados"
    FROM video_jobs WHERE id = ${videoId}`;
  return linhas[0] ?? null;
}
