import { auth } from "@/lib/auth/server";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { ContentManager } from "@/components/content/content-manager";
import { whereSocialAccountCanPublish } from "@/lib/social/account-filters";
import { varrerExpirados } from "@/lib/media/video-sweep";
import { estaTrabalhando, roteiroPendenteDe } from "@/lib/media/video-state";
import { roteiroLigado } from "@/lib/media/roteiro-da-edicao";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import type { FalhaDaMontagem } from "@/components/video/aviso-da-montagem";
import { estornosDaEdicao, refDoEstorno } from "@/lib/credits/estorno-da-edicao";
import { extrasDaLinha, gemeosNaFaixa } from "@/lib/media/linha-do-tempo-servidor";
import { temCapasGeradas } from "@/lib/media/estilos-de-capa";

function getMonday(d: Date): Date {
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + diff * 86400000);
}

export default async function LivePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      socialAccounts: {
        where: whereSocialAccountCanPublish,
        select: { id: true, platform: true, displayName: true, accountType: true, avatarUrl: true },
      },
    },
  });

  if (!project || !(await podeUsarProjeto(userId, project))) notFound();

  // Antes de mostrar qualquer coisa, declara mortos os trabalhos que passaram
  // do prazo. Quem abre a tela é o relógio do sistema: trabalho derrubado pela
  // plataforma não consegue gravar o próprio erro, então sem isto ele ficaria
  // "rodando" para sempre. A varredura veio junto com o processo de vídeo, que
  // desde 02/09 acontece aqui e não numa tela própria.
  await varrerExpirados(id);

  const videos = await prisma.videoJob.findMany({
    // O vídeo cancelado pelo cliente (05/10) não ocupa lugar na faixa.
    where: { projectId: id, status: { not: "cancelado" } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      status: true,
      error: true,
      attempts: true,
      durationSec: true,
      createdAt: true,
      startedAt: true,
      finishedAt: true,
      rodadaEm: true,
      originalName: true,
      completoUrl: true,
      capas: true,
      clips: true,
      radar: true,
    },
  });

  // O estado da edição do completo vive numa coluna fora do schema do Prisma
  // (lib/media/montagem-do-completo.ts), então vem por consulta crua.
  const estadoDoCompleto = new Map<string, string>();
  // O roteiro (30/09) mora no mesmo jsonb: existe? foi aprovado?
  const roteiros = new Map<string, { existe: boolean; aprovado: boolean }>();
  // A montagem do completo que DESISTIU por erro técnico (01/10, parte 240).
  const completoFalhou = new Set<string>();
  // O completo que foi ao ar na VERSÃO SEGURA (02/10, revisão visual sem conserto).
  const completoSeguro = new Set<string>();
  if (videos.length) {
    const linhas = await prisma.$queryRaw<{ id: string; estado: string | null; tem_roteiro: boolean | null; aprovado: string | null; falha: string | null; segura: string | null }[]>`
      SELECT id, "completoMontagem" ->> 'estado' AS estado,
             ("completoMontagem" -> 'roteiro') IS NOT NULL AS tem_roteiro,
             "completoMontagem" -> 'roteiro' ->> 'aprovadoEm' AS aprovado,
             "completoMontagem" ->> 'falhaTecnica' AS falha,
             "completoMontagem" -> 'revisaoVisual' ->> 'segura' AS segura
      FROM video_jobs WHERE id = ANY(${videos.map((v) => v.id)})`.catch(() => []);
    for (const l of linhas) {
      if (l.estado) estadoDoCompleto.set(l.id, l.estado);
      roteiros.set(l.id, { existe: Boolean(l.tem_roteiro), aprovado: Boolean(l.aprovado) });
      if (l.estado === "sem-montagem" && l.falha === "true") completoFalhou.add(l.id);
      if (l.estado === "pronto" && l.segura === "true") completoSeguro.add(l.id);
    }
  }
  // O aviso acima do quadro: cada peça (completo ou corte) cuja montagem de
  // efeitos desistiu por erro técnico, com o botão de tentar de novo sem custo.
  // A DEVOLUÇÃO (02/10): o que voltou em créditos por peça, lido do extrato.
  const devolvidos = await estornosDaEdicao(videos.map((v) => v.id)).catch(() => new Map<string, number>());
  const falhasDaMontagem: FalhaDaMontagem[] = videos.flatMap((v) => {
    const nome = v.originalName ?? "Gravação";
    const cortes = ((Array.isArray(v.clips) ? v.clips : []) as Array<{ titulo?: string; montagem?: { estado?: string; falhaTecnica?: boolean; revisaoVisual?: { segura?: boolean } | null } }>)
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => (t?.montagem?.estado === "sem-montagem" && t.montagem.falhaTecnica) || (t?.montagem?.estado === "pronto" && t.montagem.revisaoVisual?.segura))
      .map(({ t, i }) => ({ videoJobId: v.id, nome, alvo: i, titulo: t.titulo ?? null, tipo: t.montagem?.estado === "pronto" ? "segura" : "falha", devolvidos: devolvidos.get(refDoEstorno(v.id, i)) ?? 0 }) as FalhaDaMontagem);
    const completo: FalhaDaMontagem[] = completoFalhou.has(v.id) || completoSeguro.has(v.id)
      ? [{ videoJobId: v.id, nome, alvo: "completo", tipo: completoSeguro.has(v.id) ? "segura" : "falha", devolvidos: devolvidos.get(refDoEstorno(v.id, "completo")) ?? 0 }]
      : [];
    return [...completo, ...cortes];
  });
  const ligado = roteiroLigado();
  // A linha do tempo inteira já na primeira pintura (02/10): sem isto, a faixa
  // desenhava a linha curta até a primeira consulta trazer os efeitos.
  const extras = await extrasDaLinha(id, videos);
  // O vídeo do gêmeo gravando (02/10) já aparece na linha da primeira pintura.
  const gemeos = await gemeosNaFaixa(id);

  // Load cards for the current week (UTC-safe)
  const monday = getMonday(new Date());
  const sunday = new Date(monday.getTime() + 6 * 86400000);
  sunday.setUTCHours(23, 59, 59, 999);

  const cards = await prisma.campaignCard.findMany({
    where: {
      projectId: id,
      scheduledDate: { gte: monday, lte: sunday },
      run: { archived: false },
    },
    orderBy: [{ dayOfWeek: "asc" }, { createdAt: "asc" }],
  });

  // Os posts da semana: e deles que o quadro deriva o estado do card do Paulo.
  const postsDaSemana = await prisma.post.findMany({
    where: {
      projectId: id,
      status: { not: "cancelled" },
      OR: [
        { scheduledAt: { gte: monday, lte: sunday } },
        { publishedAt: { gte: monday, lte: sunday } },
        { scheduledAt: null, run: { weekStart: { gte: monday, lte: sunday } } },
      ],
    },
    select: {
      id: true, platform: true, mediaType: true, status: true, scheduledAt: true,
      publishedAt: true, externalUrl: true, socialAccountId: true, metadata: true, dayOfWeek: true, runId: true,
    },
  });

  // Check for active running pipeline or recent failed/cancelled run
  const ultimaConcluida = await prisma.pipelineRun.findFirst({
    where: { projectId: id, status: "completed" },
    orderBy: { startedAt: "desc" },
    select: { startedAt: true },
  });
  const [activeRun, lastFailedRun] = await Promise.all([
    prisma.pipelineRun.findFirst({
      // "paused" entrou em 19/09: a fila pausa por saldo de API e retoma
      // sozinha, e nesse meio tempo a campanha continua sendo a ativa.
      where: { projectId: id, status: { in: ["running", "paused"] } },
      orderBy: { startedAt: "desc" },
    }),
    prisma.pipelineRun.findFirst({
      // Só a falha que ainda é a ÚLTIMA execução. Em 09/09 o Bruno gerou a
      // semana de novo, ela concluiu, e a faixa "Geração interrompida" da
      // execução da manhã continuou em cima do quadro novo, porque a busca
      // pegava a falha mais recente sem olhar se algo veio depois dela.
      where: {
        projectId: id,
        status: { in: ["failed", "cancelled"] },
        archived: false,
        startedAt: { gte: ultimaConcluida?.startedAt ?? new Date(0) },
      },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  const serializeRun = (r: NonNullable<typeof activeRun>) => ({
    id: r.id,
    status: r.status,
    topic: r.topic,
    campaignMode: r.campaignMode,
    weekStart: r.weekStart?.toISOString() ?? null,
  });

  return (
    <ContentManager
      projectId={id}
      projectName={project.name}
      postFrequency={project.postFrequency}
      postsDaSemana={postsDaSemana.map((p) => ({
        ...p,
        scheduledAt: p.scheduledAt?.toISOString() ?? null,
        publishedAt: p.publishedAt?.toISOString() ?? null,
      }))}
      socialAccounts={project.socialAccounts}
      initialCards={cards.map((c) => ({
        ...c,
        scheduledDate: c.scheduledDate?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
        chatHistory: Array.isArray(c.chatHistory) ? (c.chatHistory as { role: "user" | "assistant"; content: string; timestamp: string }[]) : [],
      }))}
      activeRun={activeRun ? serializeRun(activeRun) : null}
      lastFailedRun={lastFailedRun ? serializeRun(lastFailedRun) : null}
      videos={[...gemeos.ativos, ...videos.map((v) => {
        const trechos = (Array.isArray(v.clips) ? v.clips : []) as Array<{
          publicar?: boolean;
          posts?: unknown;
          midia?: { vertical?: unknown };
        }>;
        const comMidia = trechos.filter((t) => t.midia?.vertical);
        return {
          id: v.id,
          status: v.status,
          error: v.error,
          attempts: v.attempts,
          durationSec: v.durationSec,
          criadoEm: v.createdAt.toISOString(),
          // A contagem regressiva parte da rodada atual já na primeira pintura
          // (30/09); o resto do estado da rodada chega na primeira consulta.
          inicioDaRodada: (v.rodadaEm ?? v.createdAt).toISOString(),
          // Sem isto a faixa "pronto em N minutos" contava até agora e o número
          // subia a cada recarga (30/09: 32, 37, 41 minutos).
          terminadoEm: v.finishedAt?.toISOString() ?? null,
          originalName: v.originalName,
          trechosEscolhidos: trechos.length,
          cortesProntos: comMidia.length,
          cortesQueVaoAoAr: comMidia.filter((t) => t.publicar !== false).length,
      // Edições ainda rodando (30/09): a faixa só diz "pronto" quando a
      // montagem dos cortes e do completo terminou, e não quando o corte
      // simples chegou. Antes ela dizia pronto com o completo sem edição.
      edicoesEmAndamento:
        (trechos as Array<{ montagem?: { estado?: string } }>).filter((t) => ["na-fila", "preparando", "dirigindo", "ilustrando", "gerando", "montando"].includes(t.montagem?.estado ?? "")).length +
        (["na-fila", "preparando", "dirigindo", "ilustrando", "gerando", "montando"].includes(estadoDoCompleto.get(v.id) ?? "") ||
        // O INTERVALO entre a gravação limpa chegar e a montagem entrar na
        // fila (30/09): sem estado ainda, a faixa dizia "pronto" e o card do
        // completo sumia do quadro por um instante. Vídeo recente, completo
        // pronto, montagem ligada e nenhum estado: ainda é edição.
        (Boolean(v.completoUrl) && !estadoDoCompleto.get(v.id) && process.env.MONTAGEM_DO_COMPLETO === "1" && Date.now() - v.createdAt.getTime() < 6 * 3600_000)
          ? 1
          : 0),
      etapaDoCompleto: estadoDoCompleto.get(v.id) ?? null,
          temTranscricao: v.durationSec !== null,
          temTrechos: trechos.length > 0,
          temCortes: comMidia.length > 0,
          temTrechosComPosts: trechos.some((t) => t.posts),
          temCompleto: Boolean(v.completoUrl),
          roteiro: roteiros.get(v.id) ?? null,
          roteiroPendente: roteiroPendenteDe({
            status: v.status,
            temTrechos: trechos.length > 0,
            temCortes: comMidia.length > 0,
            roteiroLigado: ligado,
            roteiroAprovado: Boolean(roteiros.get(v.id)?.aprovado),
          }),
          capas: temCapasGeradas(v.capas),
          radar: (() => {
            const r = v.radar as { teses?: unknown[]; achados?: unknown[]; dados?: unknown[]; fontes?: unknown[] } | null;
            if (!r) return null;
            return {
              teses: r.teses?.length ?? 0,
              achados: r.achados?.length ?? 0,
              dados: r.dados?.length ?? 0,
              fontes: r.fontes?.length ?? 0,
            };
          })(),
          // Nulo aqui de propósito: o cronômetro da faixa conta do envio, e a
          // primeira consulta traz o resto. Ler o relógio na renderização do
          // servidor a tornaria impura.
          rodandoHaSegundos:
            estaTrabalhando(v.status) && v.startedAt
              ? Math.max(0, Math.round((Date.now() - v.startedAt.getTime()) / 1000))
              : null,
          linha: extras.get(v.id) ?? null,
          gemeo: gemeos.porVideoJob.get(v.id) ?? null,
        };
      })]}
      videoEstilo={project.videoStyle}
      videoMusica={project.videoMusicName}
      videoTermos={project.videoTerms}
      videoSemana={project.videoSemana ?? null}
      falhasDaMontagem={falhasDaMontagem}
    />
  );
}
