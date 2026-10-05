import { prisma } from "@/lib/db/prisma";
import { projetoVisivel } from "@/lib/equipe/conta";
import { notificar, type Aviso } from "@/lib/notificacoes";
import { apagarMidias } from "@/lib/media/faxina";
import { creditosDoGemeo, videoEmAndamento, type VideoDoGemeo } from "@/lib/media/gemeo";
import { TIPO_VIDEO, agora, cancelarVideoDoGemeo, estornarVideo, mudarVideo } from "@/lib/media/gemeo-servidor";
import {
  MONTAGEM_ANDANDO,
  POSTS_NO_AR,
  STATUS_CANCELADO,
  acertoDaReservaNoCancelamento,
  avisoDoGemeoQueTerminaSozinho,
  avisoDoQueTerminaSozinho,
  creditosDaGravacaoCancelada,
  gemeoNaoComecou,
  idDoGemeoNaFaixa,
  midiasDoGemeoParaApagar,
  podeCancelarGemeo,
  podeCancelarGravacao,
  registroDoCancelamento,
} from "@/lib/media/cancelamento";

/**
 * "CANCELAR ESTE VÍDEO" NO SERVIDOR (05/10/2026). A regra mora em
 * `cancelamento.ts`; aqui é a execução, em duas portas:
 *
 *   gravação (VideoJob)   marca `cancelado`, fecha o quadro (cards ainda não
 *                         publicados arquivados, posts em rascunho cancelados,
 *                         run arquivado quando não sobra card vivo), e avisa
 *                         no sino. Os callbacks do worker ignoram o vídeo
 *                         cancelado, então o que ainda roda lá termina sozinho
 *                         e é descartado na chegada.
 *   gêmeo gravando        marca `cancelada` na memória do projeto (o passo do
 *                         cron só olha os estados vivos), apaga as falas e os
 *                         pedaços, e acerta a reserva pela regra que já existe.
 *
 * O banco entra por `deps`, para a lógica ser provada com mocks sem tocar
 * dado real (scripts/testes/cancelar-video.test.mts).
 */

export type GravacaoParaCancelar = {
  id: string;
  projectId: string;
  userId: string;
  status: string;
  originalName: string | null;
  createdAt: Date;
  rodadaEm: Date | null;
  finishedAt: Date | null;
  creditsCharged: number;
  /** Montagem de efeitos (cortes ou completo) rodando: o cron está com ele. */
  edicaoAndando: boolean;
};

export type QuadroFechado = { cardsArquivados: number; postsCancelados: number; runsArquivados: number };

export type DepsDoCancelamento = {
  lerGravacao(id: string, userId: string): Promise<GravacaoParaCancelar | null>;
  /** Troca o status para `cancelado` só se ele ainda for o lido (duas abas, um cancelamento). */
  marcarGravacaoCancelada(id: string, statusLido: string, registro: string): Promise<boolean>;
  fecharQuadro(videoId: string, projectId: string): Promise<QuadroFechado>;
  nomeDe(userId: string): Promise<string | null>;
  avisar(aviso: Aviso): Promise<void>;
  lerGemeo(id: string, userId: string): Promise<{ projectId: string; video: VideoDoGemeo } | null>;
  cancelarGemeoAntesDeComecar(projectId: string, id: string): Promise<boolean>;
  marcarGemeoCancelado(projectId: string, id: string, motivo: string): Promise<VideoDoGemeo | null>;
  estornarGemeo(projectId: string, v: Pick<VideoDoGemeo, "id" | "userId">, quantia: number, sufixo: string, nota: string): Promise<number>;
  apagar(urls: string[], contexto: string): Promise<void>;
};

export type ResultadoDoCancelamento =
  | {
      ok: true;
      tipo: "gravacao" | "gemeo";
      /** O que ainda termina sozinho fora daqui, se houver. */
      aviso: string | null;
      /** O que aconteceu com os créditos, dito com todas as letras. */
      creditos: string;
      creditosDevolvidos: number;
      quadro: QuadroFechado | null;
    }
  | { ok: false; status: 404 | 409; error: string };

export async function cancelarVideo(id: string, userId: string, deps: DepsDoCancelamento = depsDoBanco): Promise<ResultadoDoCancelamento> {
  const gemeoId = idDoGemeoNaFaixa(id);
  return gemeoId ? cancelarGemeo(gemeoId, userId, deps) : cancelarGravacao(id, userId, deps);
}

async function cancelarGravacao(id: string, userId: string, deps: DepsDoCancelamento): Promise<ResultadoDoCancelamento> {
  const v = await deps.lerGravacao(id, userId);
  if (!v) return { ok: false, status: 404, error: "Vídeo não encontrado." };
  const veredicto = podeCancelarGravacao(v);
  if (!veredicto.pode) return { ok: false, status: veredicto.status, error: veredicto.motivo };

  const quem = await deps.nomeDe(userId);
  const marcou = await deps.marcarGravacaoCancelada(v.id, v.status, registroDoCancelamento(quem));
  if (!marcou) return { ok: false, status: 409, error: "O vídeo mudou de etapa enquanto você confirmava. Recarregue a página e veja onde ele está." };

  const quadro = await deps.fecharQuadro(v.id, v.projectId);
  const aviso = avisoDoQueTerminaSozinho(v);
  const creditos = creditosDaGravacaoCancelada(v);

  // O registro no histórico: o sino do dono (e-mail não, foi a própria pessoa).
  const nome = v.originalName?.replace(/\.[^.]+$/, "") ?? "Gravação";
  await deps.avisar({
    userId: v.userId,
    projectId: v.projectId,
    tipo: "cancelado",
    titulo: "Vídeo cancelado",
    texto: [`${nome}: cancelado ${quem ? `por ${quem}` : "por você"}.`, quadro.cardsArquivados ? `${quadro.cardsArquivados} ${quadro.cardsArquivados === 1 ? "card saiu" : "cards saíram"} do quadro.` : null, aviso, creditos]
      .filter(Boolean)
      .join(" "),
    link: `/projects/${v.projectId}/live`,
    chave: `cancelado:${v.id}:${(v.rodadaEm ?? v.createdAt).toISOString()}`,
  });

  return { ok: true, tipo: "gravacao", aviso, creditos, creditosDevolvidos: 0, quadro };
}

async function cancelarGemeo(id: string, userId: string, deps: DepsDoCancelamento): Promise<ResultadoDoCancelamento> {
  const lido = await deps.lerGemeo(id, userId);
  if (!lido) return { ok: false, status: 404, error: "Vídeo não encontrado." };
  const { projectId, video: v } = lido;
  const veredicto = podeCancelarGemeo(v);
  if (!veredicto.pode) return { ok: false, status: veredicto.status, error: veredicto.motivo };

  const quem = await deps.nomeDe(userId);

  // Nada começou: a porta que já existia (tudo de volta, uma vez).
  if (gemeoNaoComecou(v)) {
    const ok = await deps.cancelarGemeoAntesDeComecar(projectId, v.id);
    if (!ok) return { ok: false, status: 409, error: "O vídeo começou a ser gerado enquanto você confirmava. Tente de novo." };
    await deps.avisar(avisoDoGemeo(v, projectId, quem, "Nada tinha começado: os créditos reservados voltaram inteiros.", null));
    return { ok: true, tipo: "gemeo", aviso: null, creditos: "Nada tinha começado: os créditos reservados voltaram inteiros.", creditosDevolvidos: v.creditosReservados, quadro: null };
  }

  const cancelado = await deps.marcarGemeoCancelado(projectId, v.id, registroDoCancelamento(quem));
  if (!cancelado) return { ok: false, status: 409, error: "Este vídeo já tinha terminado ou sido cancelado. Recarregue a página." };

  // O acerto da reserva pela regra do passo do cron: o que foi falado fica, o resto volta.
  const acerto = acertoDaReservaNoCancelamento(cancelado, creditosDoGemeo);
  let devolvidos = 0;
  if (acerto.volta > 0) {
    devolvidos = await deps.estornarGemeo(
      projectId,
      cancelado,
      acerto.volta,
      "acerto",
      `Vídeo do gêmeo cancelado: a fala saiu com ${acerto.segundosFalados}s; a diferença da reserva voltou.`
    );
  }
  await deps.apagar(midiasDoGemeoParaApagar(cancelado), `gemeo-cancelado/${projectId}`);

  const aviso = avisoDoGemeoQueTerminaSozinho(v);
  const creditos =
    devolvidos > 0
      ? `O que já tinha sido falado fica cobrado (${acerto.devido} créditos); ${devolvidos} da reserva voltaram.`
      : "O que já tinha sido gerado fica cobrado; não há mais nada a cobrar deste vídeo.";
  await deps.avisar(avisoDoGemeo(v, projectId, quem, creditos, aviso));
  return { ok: true, tipo: "gemeo", aviso, creditos, creditosDevolvidos: devolvidos, quadro: null };
}

function avisoDoGemeo(v: VideoDoGemeo, projectId: string, quem: string | null, creditos: string, aviso: string | null): Aviso {
  return {
    userId: v.userId,
    projectId,
    tipo: "cancelado",
    titulo: "Vídeo do gêmeo cancelado",
    texto: [`${v.titulo}: cancelado ${quem ? `por ${quem}` : "por você"}.`, aviso, creditos].filter(Boolean).join(" "),
    link: `/projects/${projectId}/live`,
    chave: `cancelado:gemeo:${v.id}`,
  };
}

// ─────────────────────────────── o banco de verdade ───────────────────────────────

const depsDoBanco: DepsDoCancelamento = {
  async lerGravacao(id, userId) {
    const v = await prisma.videoJob.findFirst({
      where: { id, project: projetoVisivel(userId) },
      select: { id: true, projectId: true, userId: true, status: true, originalName: true, createdAt: true, rodadaEm: true, finishedAt: true, creditsCharged: true },
    });
    if (!v) return null;
    // A montagem de efeitos vive em jsonb fora do schema do Prisma (cortes em
    // `clips[].montagem`, completo em `completoMontagem`): lida por SQL, como
    // nas outras telas.
    const andando = await prisma.$queryRaw<Array<{ andando: boolean | null }>>`
      SELECT ("completoMontagem" ->> 'estado') = ANY(${[...MONTAGEM_ANDANDO]}::text[])
             OR (clips IS NOT NULL AND jsonb_typeof(clips) = 'array'
                 AND jsonb_path_exists(clips, '$[*].montagem.estado ? (@ == "na-fila" || @ == "preparando" || @ == "dirigindo" || @ == "ilustrando" || @ == "gerando" || @ == "montando")'))
             AS andando
      FROM video_jobs WHERE id = ${id}`.catch(() => []);
    return { ...v, edicaoAndando: Boolean(andando[0]?.andando) };
  },

  async marcarGravacaoCancelada(id, statusLido, registro) {
    const { count } = await prisma.videoJob.updateMany({
      where: { id, status: statusLido },
      data: { status: STATUS_CANCELADO, startedAt: null, error: registro },
    });
    return count > 0;
  },

  async fecharQuadro(videoId, projectId) {
    const r: QuadroFechado = { cardsArquivados: 0, postsCancelados: 0, runsArquivados: 0 };
    const vivos = [...POSTS_NO_AR];
    const runs = await prisma.pipelineRun.findMany({
      where: { projectId, archived: false, config: { path: ["videoJobId"], equals: videoId } },
      select: { id: true },
    });
    for (const run of runs) {
      const posts = await prisma.post.updateMany({
        where: { runId: run.id, status: { notIn: [...vivos, "cancelled"] } },
        data: { status: "cancelled" },
      });
      r.postsCancelados += posts.count;
      const cards = await prisma.campaignCard.updateMany({
        where: { runId: run.id, status: { not: "archived" }, OR: [{ postId: null }, { post: { is: { status: { notIn: vivos } } } }] },
        data: { status: "archived" },
      });
      r.cardsArquivados += cards.count;
      // Sem card vivo o run sai do quadro, como no arquivamento de campanha
      // (lib/posts/espelhar-no-gestor.ts). Run arquivado do vídeo é o que diz
      // à esteira "cancelado, não reabra" (lib/media/quadro-do-video.ts).
      const sobraram = await prisma.campaignCard.count({ where: { runId: run.id, NOT: { status: "archived" } } });
      if (sobraram === 0) {
        await prisma.pipelineRun.update({ where: { id: run.id }, data: { archived: true, archivedAt: new Date() } });
        r.runsArquivados += 1;
      }
    }
    // Posts ligados ao vídeo pelo metadata e fora do run dele (os mesmos que o
    // "dispensar" cancela).
    const soltos = await prisma.post.updateMany({
      where: { projectId, metadata: { path: ["videoJobId"], equals: videoId }, status: { notIn: [...vivos, "cancelled"] } },
      data: { status: "cancelled" },
    });
    r.postsCancelados += soltos.count;
    return r;
  },

  async nomeDe(userId) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
    return u?.name?.trim() || u?.email || null;
  },

  async avisar(aviso) {
    await notificar(aviso);
  },

  async lerGemeo(id, userId) {
    const linha = await prisma.projectMemory.findFirst({
      where: { type: TIPO_VIDEO, key: id, project: projetoVisivel(userId) },
      select: { projectId: true, value: true },
    });
    if (!linha?.value) return null;
    return { projectId: linha.projectId, video: linha.value as unknown as VideoDoGemeo };
  },

  cancelarGemeoAntesDeComecar: (projectId, id) => cancelarVideoDoGemeo(projectId, id),

  async marcarGemeoCancelado(projectId, id, motivo) {
    let marcado: VideoDoGemeo | null = null;
    await mudarVideo(projectId, id, (atual) => {
      if (!atual || !videoEmAndamento(atual)) return undefined;
      marcado = { ...atual, estado: "cancelada", desde: agora(), motivo };
      return marcado;
    });
    return marcado;
  },

  async estornarGemeo(projectId, v, quantia, sufixo, nota) {
    const voltou = await estornarVideo(v, quantia, sufixo, nota);
    // O registro do que voltou fica no próprio vídeo, como no passo do cron.
    if (voltou > 0) {
      await mudarVideo(projectId, v.id, (a) => (a ? { ...a, creditosDevolvidos: (a.creditosDevolvidos ?? 0) + voltou } : undefined)).catch(() => undefined);
    }
    return voltou;
  },

  async apagar(urls, contexto) {
    if (urls.length) await apagarMidias(urls, contexto).catch((e) => console.error(`[cancelar][${contexto}] apagar mídias:`, e));
  },
};
