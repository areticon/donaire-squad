import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { cancelarGrupo } from "@/lib/fila/trabalhos";
import { notificar, type Aviso } from "@/lib/notificacoes";
import { POSTS_NO_AR } from "@/lib/media/cancelamento";
import { chaveDaPecaDoVideo, pecaDoPost } from "@/lib/posts/peca-do-video";

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

/*
 * "CANCELAR ESTA PEÇA" LEVOU O VÍDEO COMPLETO JUNTO (05/10/2026, 21:05).
 *
 * O Bruno cancelou o carrossel de segunda pela janela do card do Paulo
 * (publicação, sem `postId`). A janela carrega os posts do DIA da campanha e,
 * sem post de referência, mandava o dia inteiro em `postIds`: o Instagram e o
 * X do carrossel, e o YouTube do vídeo completo. A versão anterior desta
 * função confiava na lista, cancelou os três ("3 posts saíram da fila" no
 * sino) e, na varredura dos cards irmãos (`postId in paraCancelar`), arquivou
 * o card do Vitor que apontava para o post do YouTube.
 *
 * A regra agora é do servidor, não da tela:
 *   - a PEÇA é a do card clicado (lib/posts/peca-do-video.ts): o post ligado
 *     ao card diz qual é; card sem post (publicação, revisão) é a peça de
 *     texto do dia. Só post da mesma campanha, do mesmo dia da campanha e da
 *     mesma peça é cancelado; o resto da lista é ignorado, nunca tocado;
 *   - cards de vídeo (corte e completo) nunca são arquivados por aqui: o
 *     corte e o completo têm a porta deles ("Cancelar este vídeo");
 *   - o run só vai para o Arquivo quando não sobra card vivo nenhum, de
 *     qualquer tipo, inclusive de vídeo.
 *
 * O banco entra por `DepsDaPeca`, para o caso real ser reproduzido em teste
 * (scripts/testes/cancelar-peca-0510.test.mts) sem tocar em nada.
 */

/** Tipos de card que esta porta nunca arquiva. */
export const CARDS_DE_VIDEO: readonly string[] = ["video_clip", "video_completo"];

export type CardDaPeca = {
  id: string;
  runId: string;
  projectId: string;
  postId: string | null;
  status: string;
  content: string | null;
  cardType: string;
  dayOfWeek: number;
  metadata: unknown;
  project: { userId: string };
};

export type PostDaPeca = {
  id: string;
  status: string;
  runId: string | null;
  dayOfWeek: number | null;
  metadata: unknown;
};

export type CardIrmao = { id: string; cardType: string; postId: string | null };

export type DepsDaPeca = {
  lerCard(cardId: string): Promise<CardDaPeca | null>;
  podeUsar(userId: string, projeto: { id: string; userId: string }): Promise<boolean>;
  /** Os posts pedidos que existem neste projeto; id de fora não volta. */
  lerPosts(ids: string[], projectId: string): Promise<PostDaPeca[]>;
  cancelarPosts(ids: string[]): Promise<number>;
  /** Os cards vivos da campanha ligados a estes posts. */
  lerCardsDosPosts(runId: string, postIds: string[]): Promise<CardIrmao[]>;
  arquivarCards(ids: string[]): Promise<number>;
  cardsVivos(runId: string): Promise<number>;
  arquivarRun(runId: string): Promise<boolean>;
  nomeDe(userId: string): Promise<string | null>;
  avisar(aviso: Aviso): Promise<unknown>;
};

/**
 * A peça que o card clicado representa. Com post ligado, é a peça do post
 * (corte, completo ou texto). Sem post, o card de publicação ou revisão fala
 * pela peça de TEXTO do dia; um card de vídeo sem post só fala por si.
 */
export function pecaDoCard(card: Pick<CardDaPeca, "id" | "postId" | "cardType" | "metadata">, posts: PostDaPeca[]): string {
  const proprio = card.postId ? posts.find((p) => p.id === card.postId) : undefined;
  if (proprio) return pecaDoPost(proprio);
  if (CARDS_DE_VIDEO.includes(card.cardType)) return chaveDaPecaDoVideo(card.metadata) ?? `video:${card.id}`;
  return "texto";
}

/**
 * Regra pura: dos posts que a tela mandou, quais são desta peça. O post
 * ligado ao card entra sempre; os outros precisam ser da mesma campanha, do
 * mesmo dia da campanha e da mesma peça.
 */
export function postsDaPecaDoCard(card: Pick<CardDaPeca, "id" | "runId" | "postId" | "cardType" | "dayOfWeek" | "metadata">, posts: PostDaPeca[]): PostDaPeca[] {
  const peca = pecaDoCard(card, posts);
  return posts.filter((p) => p.id === card.postId || (p.runId === card.runId && p.dayOfWeek === card.dayOfWeek && pecaDoPost(p) === peca));
}

/** Os cards irmãos que saem junto: os ligados aos posts cancelados, nunca os de vídeo. */
export function cardsIrmaosParaArquivar(irmaos: CardIrmao[], postsCancelados: string[]): string[] {
  return irmaos.filter((c) => c.postId && postsCancelados.includes(c.postId) && !CARDS_DE_VIDEO.includes(c.cardType)).map((c) => c.id);
}

const depsDoBanco: DepsDaPeca = {
  lerCard: (cardId) =>
    prisma.campaignCard.findUnique({
      where: { id: cardId },
      select: { id: true, runId: true, projectId: true, postId: true, status: true, content: true, cardType: true, dayOfWeek: true, metadata: true, project: { select: { userId: true } } },
    }),
  podeUsar: (userId, projeto) => podeUsarProjeto(userId, projeto),
  lerPosts: (ids, projectId) =>
    ids.length ? prisma.post.findMany({ where: { id: { in: ids }, projectId }, select: { id: true, status: true, runId: true, dayOfWeek: true, metadata: true } }) : Promise.resolve([]),
  cancelarPosts: async (ids) => (ids.length ? (await prisma.post.updateMany({ where: { id: { in: ids } }, data: { status: "cancelled" } })).count : 0),
  lerCardsDosPosts: (runId, postIds) =>
    postIds.length
      ? prisma.campaignCard.findMany({ where: { runId, status: { not: "archived" }, postId: { in: postIds } }, select: { id: true, cardType: true, postId: true } })
      : Promise.resolve([]),
  arquivarCards: async (ids) => (ids.length ? (await prisma.campaignCard.updateMany({ where: { id: { in: ids }, status: { not: "archived" } }, data: { status: "archived" } })).count : 0),
  cardsVivos: (runId) => prisma.campaignCard.count({ where: { runId, NOT: { status: "archived" } } }),
  arquivarRun: async (runId) => (await prisma.pipelineRun.updateMany({ where: { id: runId, archived: false }, data: { archived: true, archivedAt: new Date() } })).count > 0,
  nomeDe,
  avisar: notificar,
};

/**
 * Cancela UMA peça do quadro: o card clicado e os posts DESSA peça que ainda
 * não saíram. `postIds` é só a sugestão da tela; o que vale é a regra acima.
 */
export async function cancelarPeca(cardId: string, userId: string, postIds: string[] = [], deps: DepsDaPeca = depsDoBanco): Promise<ResultadoDoCancelamento> {
  const card = await deps.lerCard(cardId);
  if (!card || !(await deps.podeUsar(userId, { id: card.projectId, userId: card.project.userId }))) {
    return { ok: false, status: 404, error: "Peça não encontrada." };
  }
  if (card.status === "archived") return { ok: false, status: 409, error: "Esta peça já saiu do quadro." };

  // Só posts do mesmo projeto: id de outro lugar é ignorado, nunca tocado.
  const ids = [...new Set([...postIds.filter((i) => typeof i === "string"), ...(card.postId ? [card.postId] : [])])];
  const lidos = await deps.lerPosts(ids, card.projectId);
  const posts = postsDaPecaDoCard(card, lidos);
  const noAr = posts.filter((p) => NO_AR.includes(p.status));
  const paraCancelar = posts.filter((p) => !NO_AR.includes(p.status) && p.status !== "cancelled").map((p) => p.id);
  const postDoCardNoAr = Boolean(card.postId && noAr.some((p) => p.id === card.postId));

  if (posts.length > 0 && noAr.length === posts.length) {
    return { ok: false, status: 409, error: "Esta peça já está no ar ou na fila de publicação. O que foi publicado fica; para tirar da fila, use \"Tirar da fila\" no post." };
  }

  const postsCancelados = await deps.cancelarPosts(paraCancelar);
  // O card clicado sai se o post dele não está no ar e se ele não é de vídeo;
  // os irmãos ligados aos posts cancelados saem junto, menos os de vídeo.
  const irmaos = await deps.lerCardsDosPosts(card.runId, paraCancelar);
  const paraArquivar = [
    ...new Set([
      ...(postDoCardNoAr || CARDS_DE_VIDEO.includes(card.cardType) ? [] : [card.id]),
      ...cardsIrmaosParaArquivar(irmaos.filter((c) => c.id !== card.id), paraCancelar),
    ]),
  ];
  const cardsArquivados = await deps.arquivarCards(paraArquivar);
  // Run sem card vivo NENHUM (de texto, de arte ou de vídeo) sai do quadro.
  const runArquivado = (await deps.cardsVivos(card.runId)) === 0 ? await deps.arquivarRun(card.runId) : false;
  const quadro: QuadroFechado = { cardsArquivados, postsCancelados, runArquivado };
  const ficou = fraseDoQueFicou(noAr.length);

  const quem = await deps.nomeDe(userId);
  await deps.avisar({
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
