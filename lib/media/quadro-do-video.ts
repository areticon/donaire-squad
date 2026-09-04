import { prisma } from "@/lib/db/prisma";
import { diasDaSemana, normalizarSemana, ROTULO_DO_FORMATO } from "@/lib/media/semana-do-video";
import type { Prisma } from "@prisma/client";

/**
 * O quadro do vídeo no Gestor de Conteúdo: o run da semana e os cards de
 * ESPERA de quem vai trabalhar nela.
 *
 * Até 04/09 isto morava dentro da rota `agendar`, que só rodava depois de
 * cortes, capas e redação, e por isso o quadro ficava vazio por 13 minutos
 * enquanto o squad já tinha o que precisava (a transcrição). Agora o quadro
 * abre um minuto depois do envio, a partir do callback da transcrição, e o
 * que chega depois (briefing, textos, artes, cortes, vereditos) preenche os
 * cards que já estão lá.
 *
 * Tudo aqui é idempotente: run existente é devolvido, card existente não é
 * duplicado.
 */

export function segundaDaSemana(d = new Date()): Date {
  const dia = d.getUTCDay();
  const desloca = dia === 0 ? -6 : 1 - dia;
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + desloca * 86400000
  );
}

/**
 * O dia da semana de um corte, espalhado de segunda (1) a domingo (7) com
 * espaçamento uniforme entre os cortes que vão ao ar. Com 3 cortes cai em
 * segunda, quinta e domingo; com 7, um por dia. Amontoar no começo da semana
 * e deixar o fim vazio parece cronograma e não é.
 *
 * Vive aqui, e não em quem cria o card, porque o card pode nascer em dois
 * lugares (o agendar e a sincronização do quadro) e os dois precisam cair no
 * MESMO dia para o mesmo corte.
 */
export function diaDoTrecho(
  trechos: Array<{ publicar?: boolean; midia?: { vertical?: unknown } | null }>,
  indice: number
): number {
  const aprovados = trechos
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.publicar !== false && t.midia?.vertical)
    .map(({ i }) => i);
  const posicao = aprovados.indexOf(indice);
  if (posicao < 0 || aprovados.length === 1) return 1;
  return Math.round((posicao * 6) / (aprovados.length - 1)) + 1;
}

async function runDoVideo(projectId: string, videoJobId: string) {
  return prisma.pipelineRun.findFirst({
    where: { projectId, archived: false, config: { path: ["videoJobId"], equals: videoJobId } },
    select: { id: true, weekStart: true, config: true },
  });
}

const ESPERA: Record<string, Array<{ agentId: string; agentName: string; cardType: string; texto: string }>> = {
  text: [{ agentId: "lucas-linkedin", agentName: "Lucas LinkedIn", cardType: "post_linkedin", texto: "Lucas está escrevendo o post de texto deste dia a partir do vídeo e do briefing do Roberto." }],
  poll: [{ agentId: "lucas-linkedin", agentName: "Lucas LinkedIn", cardType: "post_linkedin", texto: "Lucas está escrevendo a enquete deste dia a partir do vídeo e do briefing do Roberto." }],
  thread: [{ agentId: "tiago-twitter", agentName: "Tiago Twitter", cardType: "post_twitter", texto: "Tiago está escrevendo a thread deste dia a partir do vídeo e do briefing do Roberto." }],
  image: [
    { agentId: "lucas-linkedin", agentName: "Lucas LinkedIn", cardType: "post_linkedin", texto: "Lucas está escrevendo a legenda da imagem deste dia." },
    { agentId: "diana-design", agentName: "Diana Design", cardType: "media", texto: "Diana está criando a imagem deste dia com uma frase do vídeo, nas cores da marca." },
  ],
  carousel: [{ agentId: "diana-design", agentName: "Diana Design", cardType: "media", texto: "Diana está montando o carrossel deste dia: três slides, uma ideia do vídeo por slide, nas cores da marca." }],
  infographic: [
    { agentId: "lucas-linkedin", agentName: "Lucas LinkedIn", cardType: "post_linkedin", texto: "Lucas está escrevendo a legenda do infográfico deste dia." },
    { agentId: "diana-design", agentName: "Diana Design", cardType: "media", texto: "Diana está montando o infográfico deste dia com os dados do briefing do Roberto." },
  ],
};

/**
 * Abre o quadro do vídeo: o run da semana (uma vez) e os cards de espera do
 * Roberto e dos redatores, um por agente e por dia escolhido, com o formato
 * no metadata (é o que o cabeçalho do quadro mostra). Os cards de espera são
 * os mesmos que recebem o briefing e os textos depois.
 *
 * Devolve o id do run, ou null se o vídeo não existe.
 */
export async function abrirQuadroDoVideo(videoJobId: string): Promise<{ runId: string; criado: boolean } | null> {
  const video = await prisma.videoJob.findUnique({
    where: { id: videoJobId },
    select: {
      id: true,
      projectId: true,
      originalName: true,
      radar: true,
      durationSec: true,
      project: { select: { videoSemana: true } },
    },
  });
  if (!video) return null;

  let run = await runDoVideo(video.projectId, video.id);
  let criado = false;
  if (!run) {
    const nome = (video.originalName ?? "Gravação").replace(/\.[^.]+$/, "");
    // A semana que o cliente escolheu no envio, congelada no run: se ele
    // mudar a escolha no projeto depois, vale para a PRÓXIMA gravação.
    const semana = normalizarSemana(video.project.videoSemana);
    run = await prisma.pipelineRun.create({
      data: {
        projectId: video.projectId,
        status: "completed",
        topic: nome,
        campaignMode: "weekly",
        weekStart: segundaDaSemana(),
        // O vínculo com o vídeo mora aqui, e é o que torna tudo idempotente
        // sem precisar de coluna nova.
        config: { videoJobId: video.id, origem: "video", semana } as Prisma.InputJsonValue,
      },
      select: { id: true, weekStart: true, config: true },
    });
    criado = true;
  }

  const segunda = run.weekStart ?? segundaDaSemana();
  const existentes = await prisma.campaignCard.findMany({
    where: { runId: run.id },
    select: { agentId: true, dayOfWeek: true },
  });
  const tem = (agentId: string, dia: number) => existentes.some((c) => c.agentId === agentId && c.dayOfWeek === dia);

  if (!tem("roberto-radar", 1)) {
    const minutos = video.durationSec ? Math.max(1, Math.round(video.durationSec / 60)) : null;
    const dataRoberto = new Date(segunda);
    dataRoberto.setUTCHours(9, 0, 0, 0);
    await prisma.campaignCard.create({
      data: {
        runId: run.id,
        projectId: video.projectId,
        agentId: "roberto-radar",
        agentName: "Roberto Radar",
        dayOfWeek: 1,
        scheduledDate: dataRoberto,
        cardType: "research",
        mediaType: "text",
        content: `Roberto está pesquisando a partir da transcrição${minutos ? ` do vídeo de ${minutos} min` : ""}: o que você disse, o que estão falando sobre isso agora e dados com fonte. O briefing aparece aqui em instantes.`,
        status: "pending",
        metadata: { origem: "video", videoJobId: video.id, aguardando: true },
      },
    });
  }

  const semana = normalizarSemana((run.config as { semana?: unknown } | null)?.semana ?? video.project.videoSemana);
  for (const { dia, formato, escolhido } of diasDaSemana(semana)) {
    const data = new Date(segunda.getTime() + (dia - 1) * 86400000);
    data.setUTCHours(12, 0, 0, 0);
    for (const e of ESPERA[formato] ?? []) {
      if (tem(e.agentId, dia)) continue;
      await prisma.campaignCard.create({
        data: {
          runId: run.id,
          projectId: video.projectId,
          agentId: e.agentId,
          agentName: e.agentName,
          dayOfWeek: dia,
          scheduledDate: data,
          cardType: e.cardType,
          mediaType: "text",
          content: e.texto,
          status: "pending",
          metadata: {
            origem: "video",
            videoJobId: video.id,
            derivado: true,
            formato: escolhido,
            formatoRotulo: ROTULO_DO_FORMATO[escolhido],
            dia,
            aguardando: true,
          },
        },
      });
    }
  }

  return { runId: run.id, criado };
}
