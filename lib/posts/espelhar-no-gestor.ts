import { prisma } from "@/lib/db/prisma";

/**
 * Faz o Gestor de Conteúdo acompanhar o que a aba de posts faz com um post.
 *
 * As duas telas falam de objetos diferentes. A aba de posts mexe em `posts`;
 * o Gestor desenha `campaign_cards`, filtrando só por `run.archived = false` e
 * `status != "archived"`. A relação card -> post não tem cascade: apagar o post
 * zera o `postId` do card e o card fica. Arquivar o post não toca no card.
 *
 * Em 14/09 o Bruno arquivou um post na aba de posts, viu ele continuar na
 * agenda da semana, apagou de vez, e ele continuou lá. Nenhuma das duas ações
 * chegava ao Gestor. Isto é a tradução que faltava.
 *
 * A regra é por DIA da campanha, não por post: um dia é uma corrente de cards
 * (pesquisa, redator, mídia, revisão, publicação) e o post é só o fim dela.
 * Quando o último post vivo do dia some, a corrente inteira do dia perde a
 * razão de estar na agenda. E quando todos os dias da execução se foram, a
 * execução vai para o arquivo do Gestor, pelo mesmo caminho que "arquivar
 * campanha" já usa (app/api/pipeline/runs/[id]). Tudo reversível.
 */

/** Posts que ainda contam como "vivos" no dia: qualquer um que não foi arquivado. */
const VIVO = { status: { not: "cancelled" } } as const;

/**
 * Chamar DEPOIS de arquivar ou apagar um post. Se o dia ficou sem post vivo,
 * arquiva os cards do dia; se a execução ficou sem card vivo, arquiva a
 * execução.
 */
export async function esconderDiaSemPosts(runId: string | null, dayOfWeek: number | null) {
  if (!runId || dayOfWeek === null) return;

  const vivos = await prisma.post.count({ where: { runId, dayOfWeek, ...VIVO } });
  if (vivos > 0) return;

  await prisma.campaignCard.updateMany({
    where: { runId, dayOfWeek, NOT: { status: "archived" } },
    data: { status: "archived" },
  });

  const cardsVivos = await prisma.campaignCard.count({ where: { runId, NOT: { status: "archived" } } });
  if (cardsVivos === 0) {
    await prisma.pipelineRun.update({
      where: { id: runId },
      data: { archived: true, archivedAt: new Date() },
    });
  }
}

/**
 * O caminho de volta: um post arquivado que volta para rascunho (ou é
 * reagendado) reabre o dia dele no Gestor e tira a execução do arquivo.
 * Cards voltam a "pending", que é o estado de quem espera aprovação; o que
 * eles eram antes de arquivar não é guardado, e refazer a aprovação é mais
 * barato que um card que diz "aprovado" para um post que voltou a rascunho.
 */
export async function reabrirDia(runId: string | null, dayOfWeek: number | null) {
  if (!runId || dayOfWeek === null) return;

  await prisma.campaignCard.updateMany({
    where: { runId, dayOfWeek, status: "archived" },
    data: { status: "pending" },
  });
  await prisma.pipelineRun.updateMany({
    where: { id: runId, archived: true },
    data: { archived: false, archivedAt: null },
  });
}
