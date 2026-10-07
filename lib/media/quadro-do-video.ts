import { prisma } from "@/lib/db/prisma";
import {
  dataDoDia,
  datasDoPlano,
  diaDaSemanaDe,
  diasDaSemana,
  inicioEfetivo,
  normalizarSemana,
  planoDoRun,
  planoParaGravar,
  ROTULO_DO_FORMATO,
} from "@/lib/media/semana-do-video";
import type { FormatoEscrito, RedeDoPlano } from "@/lib/media/semana-do-video";
import { redatorDoDia, type RedatorDaRede } from "@/lib/media/redator-da-rede";
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
 * O dia de um corte DENTRO DO PLANO (30/09): espalhado com espaçamento
 * uniforme entre a data de início e o último dia do plano, e devolvido como
 * dia da semana (a chave de card e post). Com início na quarta e três cortes,
 * cai em quarta, sábado e terça. É a conta de quando o plano não tem dia de
 * vídeo curto; com dia de vídeo curto, quem manda é o plano
 * (sincronizar-quadro.ts).
 */
export function diaDoTrechoNoPlano(
  trechos: Array<{ publicar?: boolean; midia?: { vertical?: unknown } | null }>,
  indice: number,
  inicio: string
): number {
  const datas = datasDoPlano(inicio);
  const aprovados = trechos
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.publicar !== false && t.midia?.vertical)
    .map(({ i }) => i);
  const posicao = aprovados.indexOf(indice);
  if (posicao < 0 || aprovados.length === 1) return datas[0].dia;
  return datas[Math.round((posicao * (datas.length - 1)) / (aprovados.length - 1))].dia;
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

/**
 * Os cards de espera de um dia. O do texto leva o especialista DA REDE do dia
 * (04/10): era sempre o "Lucas LinkedIn", e num projeto sem LinkedIn a
 * legenda do Instagram aparecia no quadro como "Post LinkedIn". Dia de texto
 * só com o X é do Xavier; carrossel não tem espera de texto (a legenda chega
 * junto das lâminas).
 */
function esperaDoDia(formato: FormatoEscrito, redes: RedeDoPlano[]): Array<RedatorDaRede & { texto: string }> {
  const r = redatorDoDia(formato, redes);
  const nome = r.agentName.split(" ")[0];
  const texto = (oQue: string) => ({ ...r, texto: `${nome} está escrevendo ${oQue} deste dia a partir do vídeo e do briefing do Roberto.` });
  const diana = (t: string) => ({ agentId: "diana-design", agentName: "Diana Design", cardType: "media", texto: t });
  switch (formato) {
    case "text":
      return [texto(r.agentId === "xavier-x" ? "a thread" : "o post de texto")];
    case "poll":
      return [texto("a enquete")];
    case "thread":
      return [texto("a thread")];
    case "image":
      return [texto("a legenda da imagem"), diana("Diana está criando a imagem deste dia com uma frase do vídeo, nas cores da marca.")];
    case "carousel":
      return [diana("Diana está montando o carrossel deste dia: três slides, uma ideia do vídeo por slide, nas cores da marca.")];
    case "infographic":
      return [texto("a legenda do infográfico"), diana("Diana está montando o infográfico deste dia com os dados do briefing do Roberto.")];
  }
}

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
      project: {
        select: {
          videoSemana: true,
          socialAccounts: { where: { isActive: true }, select: { platform: true } },
        },
      },
    },
  });
  if (!video) return null;

  let run = await runDoVideo(video.projectId, video.id);
  let criado = false;
  if (!run) {
    // CAMPANHA CANCELADA NÃO RENASCE (30/09). O Bruno arquivou a campanha de um
    // vídeo para rodar outro do zero, e a esteira, sem achar run ativo, abriu
    // um novo para o vídeo antigo: 31 cards e 13 rascunhos misturados com a
    // semana nova. Run arquivado do mesmo vídeo quer dizer "cancelado".
    const cancelado = await prisma.pipelineRun.findFirst({
      where: { projectId: video.projectId, archived: true, config: { path: ["videoJobId"], equals: video.id } },
      select: { id: true },
    });
    if (cancelado) return null;
    const nome = (video.originalName ?? "Gravação").replace(/\.[^.]+$/, "");
    // A semana que o cliente escolheu no envio, congelada no run: se ele
    // mudar a escolha no projeto depois, vale para a PRÓXIMA gravação.
    // Desde 30/09 vai junto a DATA DE INÍCIO efetiva (hoje em São Paulo, ou a
    // data futura escolhida no passo 4) e as redes que estão conectadas agora:
    // é dela que sai a data de cada card e de cada post, e não mais da segunda.
    const conectadas = video.project.socialAccounts.map((a) => a.platform);
    const escolhida = normalizarSemana(video.project.videoSemana, conectadas, false);
    const semana = { ...escolhida, inicio: inicioEfetivo(escolhida) };
    run = await prisma.pipelineRun.create({
      data: {
        projectId: video.projectId,
        status: "completed",
        topic: nome,
        campaignMode: "weekly",
        // A segunda da semana em que o plano COMEÇA: é por ela que o Gestor
        // acha o run da semana aberta (andamento). Os dias que caem na semana
        // seguinte aparecem lá pela data dos cards, não pelo run.
        weekStart: segundaDaSemana(new Date(`${semana.inicio}T12:00:00.000Z`)),
        // O vínculo com o vídeo mora aqui, e é o que torna tudo idempotente
        // sem precisar de coluna nova.
        config: { videoJobId: video.id, origem: "video", semana: planoParaGravar(semana) } as Prisma.InputJsonValue,
      },
      select: { id: true, weekStart: true, config: true },
    });
    criado = true;
  }

  const plano = planoDoRun(run.config, video.project.videoSemana);
  const alvo = { inicio: plano.inicio, weekStart: run.weekStart ?? segundaDaSemana() };
  const existentes = await prisma.campaignCard.findMany({
    where: { runId: run.id },
    select: { agentId: true, dayOfWeek: true, metadata: true },
  });
  const tem = (agentId: string, dia: number) => existentes.some((c) => c.agentId === agentId && c.dayOfWeek === dia);
  // O DIA COM AVISO DE FALHA não ganha card de espera de novo (08/10): a falha
  // apaga a espera que sobrou ("Diana está criando" ao lado do AVISO), e o
  // agendar, que roda a cada vez que a tela acha o vídeo parado, a recriava.
  const diaComFalha = (dia: number) => existentes.some((c) => c.dayOfWeek === dia && (c.metadata as { falha?: unknown } | null)?.falha);

  // O Roberto pesquisa no PRIMEIRO dia do plano (hoje), e não na segunda:
  // com a campanha começando na quarta, o card dele na segunda ficava no
  // passado. Run de antes de 30/09 (sem início) segue na segunda.
  const diaDoRoberto = plano.inicio ? diaDaSemanaDe(plano.inicio) : 1;
  if (!existentes.some((c) => c.agentId === "roberto-radar")) {
    const minutos = video.durationSec ? Math.max(1, Math.round(video.durationSec / 60)) : null;
    const dataRoberto = dataDoDia(alvo, diaDoRoberto, 9);
    await prisma.campaignCard.create({
      data: {
        runId: run.id,
        projectId: video.projectId,
        agentId: "roberto-radar",
        agentName: "Roberto Radar",
        dayOfWeek: diaDoRoberto,
        scheduledDate: dataRoberto,
        cardType: "research",
        mediaType: "text",
        content: `Roberto está pesquisando a partir da transcrição${minutos ? ` do vídeo de ${minutos} min` : ""}: o que você disse, o que estão falando sobre isso agora e dados com fonte. O briefing aparece aqui em instantes.`,
        status: "pending",
        metadata: { origem: "video", videoJobId: video.id, aguardando: true },
      },
    });
  }

  for (const { dia, formato, escolhido, redes } of diasDaSemana(plano)) {
    // A DATA do dia dentro do plano (30/09): com início na quarta, a terça é
    // a da semana seguinte, e não a de ontem.
    const data = dataDoDia(alvo, dia);
    if (diaComFalha(dia)) continue;
    for (const e of esperaDoDia(formato, redes)) {
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
            redes,
            aguardando: true,
          },
        },
      });
    }
  }

  return { runId: run.id, criado };
}
