import { prisma } from "@/lib/db/prisma";
import { creditar, debitar } from "@/lib/credits";

/**
 * O ESTORNO DA PRIMEIRA PARTE quando a gravação não rende nenhum trecho
 * (decisão do Bruno, 01/10).
 *
 * A primeira parte (transcrição, limpeza, escolha dos cortes, roteiro e semana
 * escrita) é cobrada antes da seleção, porque é ali que a duração já é
 * conhecida. Mas quando a seleção não acha NENHUM trecho aproveitável, o
 * cliente não recebe roteiro, cortes nem semana: só uma transcrição que ele não
 * pediu sozinha. Cobrar por isso é cobrar pela gravação ter saído fraca. Então o
 * vídeo falha SEM custo: os créditos voltam para a conta que pagou (o dono, na
 * equipe), com o autor marcado (quem enviou), e a mensagem diz o porquê.
 *
 * Duas regras de contagem, para não dar crédito de graça nem cobrar duas vezes:
 * - estorna só se há mais débitos da primeira parte deste vídeo do que
 *   estornos (idempotente: falhar de novo não devolve de novo);
 * - se o mesmo vídeo for tentado outra vez depois do estorno, a primeira parte
 *   é cobrada de novo (`recobrarSeEstornado`), porque `cobrarPrimeiraParte`
 *   só olha se já existe débito e deixaria a segunda tentativa sair de graça.
 */

export const OPERACAO_DO_ESTORNO_DO_ROTEIRO = "estorno_roteiro";
const OPERACAO_DO_ROTEIRO = "video_roteiro";

async function contas(videoId: string) {
  const [debitos, estornos] = await Promise.all([
    prisma.creditTransaction.findMany({
      where: { operation: OPERACAO_DO_ROTEIRO, refId: videoId, amount: { lt: 0 } },
      orderBy: { createdAt: "asc" },
      select: { amount: true },
    }),
    prisma.creditTransaction.count({ where: { operation: OPERACAO_DO_ESTORNO_DO_ROTEIRO, refId: videoId } }),
  ]);
  return { debitos, estornos };
}

/** Devolve a primeira parte deste vídeo, se ela foi cobrada e ainda não voltou. Devolve quanto voltou. */
export async function estornarPrimeiraParte(v: { id: string; userId: string }, motivo: string): Promise<number> {
  const { debitos, estornos } = await contas(v.id);
  if (debitos.length <= estornos) return 0;
  const quantidade = Math.abs(debitos[debitos.length - 1].amount);
  if (quantidade <= 0) return 0;
  // `creditar` devolve para a conta que paga e marca o autor (01/10): o
  // consumo do membro no mês desconta o que voltou.
  await creditar({
    userId: v.userId,
    quantidade,
    operation: OPERACAO_DO_ESTORNO_DO_ROTEIRO,
    refId: v.id,
    note: `estorno: ${motivo}`,
  });
  await prisma.videoJob.update({ where: { id: v.id }, data: { creditsCharged: { decrement: quantidade } } }).catch(() => undefined);
  return quantidade;
}

/**
 * Nova tentativa de um vídeo já estornado: cobra a primeira parte de novo, do
 * mesmo jeito que da primeira vez. Lança `SaldoInsuficiente` sem cobrar.
 */
export async function recobrarSeEstornado(v: { id: string; userId: string; projectId: string }): Promise<number> {
  const { debitos, estornos } = await contas(v.id);
  if (!debitos.length || debitos.length > estornos) return 0;
  const quantidade = Math.abs(debitos[debitos.length - 1].amount);
  if (quantidade <= 0) return 0;
  await debitar({
    userId: v.userId,
    quantidade,
    operation: OPERACAO_DO_ROTEIRO,
    projectId: v.projectId,
    refId: v.id,
    note: "nova tentativa depois do estorno: transcrição, limpeza, escolha dos cortes, roteiro e semana escrita",
  });
  await prisma.videoJob.update({ where: { id: v.id }, data: { creditsCharged: { increment: quantidade } } }).catch(() => undefined);
  return quantidade;
}
