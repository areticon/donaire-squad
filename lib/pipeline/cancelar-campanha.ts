import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { cancelarGrupo } from "@/lib/fila/trabalhos";
import { notificar } from "@/lib/notificacoes";
import { POSTS_NO_AR } from "@/lib/media/cancelamento";

/**
 * "CANCELAR A CAMPANHA" E "CANCELAR ESTA PEÇA" NO SERVIDOR (05/10/2026).
 *
 * O Bruno não achava onde cancelar uma campanha nem uma peça no Gestor:
 * "Arquivar campanha" só existia dentro da janela de aprovação, que nem todo
 * card abre. As duas portas agora vivem aqui, com a MESMA regra que o
 * "Cancelar este vídeo" já aplica ao quadro (lib/media/cancelar-video.ts):
 *
 *   - post que ainda não saiu (rascunho, reprovado, falhou) vira `cancelled`,
 *     que é o status do arquivo de Posts; o que está no ar ou na fila de
 *     publicação fica como está;
 *   - card sem post no ar vira `archived` e some do quadro;
 *   - run sem card vivo vai para o Arquivo de campanhas.
 *
 * Nada aqui gasta IA. A campanha que ainda estava gerando é parada na fila
 * (`cancelarGrupo`), como o "Cancelar" da geração já fazia, para a esteira
 * não continuar escrevendo dias de uma campanha que o cliente desistiu de ter.
 *
 * Cada cancelamento fica registrado no sino do dono do projeto, com quem fez.
 */

export type QuadroFechado = { cardsArquivados: number; postsCancelados: number; runArquivado: boolean };

export type ResultadoDoCancelamento =
  | { ok: true; quadro: QuadroFechado; /** O que ficou no ar, dito com todas as letras. */ ficou: string | null }
  | { ok: false; status: 404 | 409; error: string };

const NO_AR: string[] = [...POSTS_NO_AR];

async function nomeDe(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  return u?.name?.trim() || u?.email || null;
}

/** O período da campanha, do jeito que se fala: "5 a 11 de out.". */
function periodoDoRun(weekStart: Date | null): string | null {
  if (!weekStart) return null;
  const fim = new Date(weekStart.getTime() + 6 * 86400000);
  const dia = (d: Date) => d.toLocaleDateString("pt-BR", { day: "numeric", timeZone: "UTC" });
  const diaEMes = (d: Date) => d.toLocaleDateString("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" });
  return weekStart.getUTCMonth() === fim.getUTCMonth() ? `${dia(weekStart)} a ${diaEMes(fim)}` : `${diaEMes(weekStart)} a ${diaEMes(fim)}`;
}

/** Run sem card vivo sai do quadro. Devolve se arquivou agora. */
async function arquivarRunSemCardVivo(runId: string): Promise<boolean> {
  const sobraram = await prisma.campaignCard.count({ where: { runId, NOT: { status: "archived" } } });
  if (sobraram > 0) return false;
  const r = await prisma.pipelineRun.updateMany({ where: { id: runId, archived: false }, data: { archived: true, archivedAt: new Date() } });
  return r.count > 0;
}

function fraseDoQueFicou(noAr: number): string | null {
  if (noAr === 0) return null;
  return noAr === 1 ? "1 post já estava no ar ou na fila e ficou." : `${noAr} posts já estavam no ar ou na fila e ficaram.`;
}

/**
 * Cancela a campanha inteira (o run): o que não saiu sai do quadro, o que
 * saiu fica. O `userId` é de quem clicou; o sino é do dono do projeto.
 */
export async function cancelarCampanha(runId: string, userId: string): Promise<ResultadoDoCancelamento> {
  const run = await prisma.pipelineRun.findUnique({
    where: { id: runId },
    select: { id: true, projectId: true, status: true, archived: true, topic: true, weekStart: true, project: { select: { userId: true } } },
  });
  if (!run || !(await podeUsarProjeto(userId, { id: run.projectId, userId: run.project.userId }))) {
    return { ok: false, status: 404, error: "Campanha não encontrada." };
  }
  if (run.archived) return { ok: false, status: 409, error: "Esta campanha já saiu do quadro. Ela está no Arquivo de campanhas." };

  // A geração que ainda roda para na fila: o dia em andamento termina sozinho
  // (matar no meio deixa post pela metade), os seguintes não começam.
  if (run.status === "running") {
    await prisma.pipelineRun.update({ where: { id: runId }, data: { status: "cancelled", endedAt: new Date() } });
    await cancelarGrupo(runId);
  }

  const posts = await prisma.post.updateMany({
    where: { runId, status: { notIn: [...NO_AR, "cancelled"] } },
    data: { status: "cancelled" },
  });
  const cards = await prisma.campaignCard.updateMany({
    where: { runId, status: { not: "archived" }, OR: [{ postId: null }, { post: { is: { status: { notIn: NO_AR } } } }] },
    data: { status: "archived" },
  });
  const noAr = await prisma.post.count({ where: { runId, status: { in: NO_AR } } });
  const runArquivado = await arquivarRunSemCardVivo(runId);
  const quadro: QuadroFechado = { cardsArquivados: cards.count, postsCancelados: posts.count, runArquivado };
  const ficou = fraseDoQueFicou(noAr);

  const quem = await nomeDe(userId);
  const periodo = periodoDoRun(run.weekStart);
  await notificar({
    userId: run.project.userId,
    projectId: run.projectId,
    tipo: "cancelado",
    titulo: "Campanha cancelada",
    texto: [
      `${run.topic ? `"${run.topic}"` : "Campanha"}${periodo ? ` (${periodo})` : ""}: cancelada ${quem ? `por ${quem}` : "por você"}.`,
      posts.count ? `${posts.count} ${posts.count === 1 ? "post saiu" : "posts saíram"} da fila.` : "Nenhum post estava esperando.",
      ficou,
    ]
      .filter(Boolean)
      .join(" "),
    link: `/projects/${run.projectId}/live`,
    chave: `cancelado:campanha:${runId}:${new Date().toISOString().slice(0, 16)}`,
  });

  return { ok: true, quadro, ficou };
}

/** O título da peça para o sino: a primeira linha do card, ou o tipo. */
function tituloDaPeca(card: { content: string | null; cardType: string }): string {
  const linha = card.content
    ?.replace(/<[^>]+>/g, " ")
    .replace(/[#*_`>]/g, "")
    .split("\n")
    .map((l) => l.replace(/^={2,}[^=\n]{0,40}={2,}\s*/, "").trim())
    .find((l) => l.length > 0);
  if (linha) return linha.length > 80 ? `${linha.slice(0, 80)}…` : linha;
  return card.cardType === "video_clip" ? "Corte de vídeo" : card.cardType === "video_completo" ? "Vídeo completo" : "Peça";
}

/**
 * Cancela UMA peça do quadro: o card aberto e os posts dela (`postIds`, os
 * destinos da mesma peça que a tela já conhece) que ainda não saíram. O card
 * só é arquivado se o post dele não está no ar; os outros cards da campanha
 * cujo post foi cancelado saem junto, para a peça não voltar pela porta do
 * card irmão.
 */
export async function cancelarPeca(cardId: string, userId: string, postIds: string[] = []): Promise<ResultadoDoCancelamento> {
  const card = await prisma.campaignCard.findUnique({
    where: { id: cardId },
    select: { id: true, runId: true, projectId: true, postId: true, status: true, content: true, cardType: true, project: { select: { userId: true } } },
  });
  if (!card || !(await podeUsarProjeto(userId, { id: card.projectId, userId: card.project.userId }))) {
    return { ok: false, status: 404, error: "Peça não encontrada." };
  }
  if (card.status === "archived") return { ok: false, status: 409, error: "Esta peça já saiu do quadro." };

  // Só posts do mesmo projeto: id de outro lugar é ignorado, nunca tocado.
  const ids = [...new Set([...postIds.filter((i) => typeof i === "string"), ...(card.postId ? [card.postId] : [])])];
  const posts = ids.length
    ? await prisma.post.findMany({ where: { id: { in: ids }, projectId: card.projectId }, select: { id: true, status: true } })
    : [];
  const noAr = posts.filter((p) => NO_AR.includes(p.status));
  const paraCancelar = posts.filter((p) => !NO_AR.includes(p.status) && p.status !== "cancelled").map((p) => p.id);
  const postDoCardNoAr = Boolean(card.postId && noAr.some((p) => p.id === card.postId));

  if (posts.length > 0 && noAr.length === posts.length) {
    return { ok: false, status: 409, error: "Esta peça já está no ar ou na fila de publicação. O que foi publicado fica; para tirar da fila, use \"Tirar da fila\" no post." };
  }

  let postsCancelados = 0;
  if (paraCancelar.length) {
    const r = await prisma.post.updateMany({ where: { id: { in: paraCancelar } }, data: { status: "cancelled" } });
    postsCancelados = r.count;
  }
  const cards = await prisma.campaignCard.updateMany({
    where: {
      runId: card.runId,
      status: { not: "archived" },
      OR: [...(postDoCardNoAr ? [] : [{ id: card.id }]), ...(paraCancelar.length ? [{ postId: { in: paraCancelar } }] : [])],
    },
    data: { status: "archived" },
  });
  const runArquivado = await arquivarRunSemCardVivo(card.runId);
  const quadro: QuadroFechado = { cardsArquivados: cards.count, postsCancelados, runArquivado };
  const ficou = fraseDoQueFicou(noAr.length);

  const quem = await nomeDe(userId);
  await notificar({
    userId: card.project.userId,
    projectId: card.projectId,
    tipo: "cancelado",
    titulo: "Peça cancelada",
    texto: [
      `${tituloDaPeca(card)}: cancelada ${quem ? `por ${quem}` : "por você"}.`,
      postsCancelados ? `${postsCancelados} ${postsCancelados === 1 ? "post saiu" : "posts saíram"} da fila.` : null,
      ficou,
    ]
      .filter(Boolean)
      .join(" "),
    link: `/projects/${card.projectId}/live`,
    chave: `cancelado:peca:${card.id}:${new Date().toISOString().slice(0, 16)}`,
  });

  return { ok: true, quadro, ficou };
}
