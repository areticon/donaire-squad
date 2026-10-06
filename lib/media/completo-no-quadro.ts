import { prisma } from "@/lib/db/prisma";
import type { Trecho } from "@/lib/media/select-clips";
import { DESTINO_COMPLETO } from "@/lib/media/destinos";
import { montarPostDeVideo, montarPostSemCortes, tituloDaGravacao } from "@/lib/media/youtube-post";
import type { Radar } from "@/lib/media/radar-do-video";
import { lerLinks } from "@/lib/projeto/links-do-cliente";
import { blocoDeLinksDaDescricao } from "@/lib/media/elo-da-campanha";
import { dataDoDia, diaDaSemanaDe, planoDoRun } from "@/lib/media/semana-do-video";

/**
 * Põe o vídeo completo no Gestor de Conteúdo: o rascunho de YouTube (título e
 * descrição com capítulos) e o card do Vitor, ligados.
 *
 * Vive fora da rota de agendamento porque desde 01/09 o completo pode chegar
 * DEPOIS do quadro montado: o worker avisa os cortes assim que ficam prontos
 * (211s medidos) e o completo quando termina de codificar (14 min no preset
 * antigo). Quem chama: o agendamento, quando o completo já existe; e o
 * callback do corte, quando ele chega atrasado. Idempotente nos dois: post
 * achado por metadata, card achado por metadata.
 */
export async function anexarCompletoAoQuadro(videoJobId: string): Promise<boolean> {
  const video = await prisma.videoJob.findUnique({
    where: { id: videoJobId },
    select: {
      id: true,
      projectId: true,
      completoUrl: true,
      blobUrl: true,
      durationSec: true,
      capaFonteUrl: true,
      clips: true,
      originalName: true,
      radar: true,
      project: {
        select: {
          name: true,
          config: true,
          // As redes do cliente, que fecham a descrição junto dos links (05/10).
          socialAccounts: { where: { isActive: true }, select: { platform: true, username: true, displayName: true } },
        },
      },
    },
  });
  if (!video?.completoUrl) return false;

  const run = await prisma.pipelineRun.findFirst({
    where: {
      projectId: video.projectId,
      archived: false,
      config: { path: ["videoJobId"], equals: video.id },
    },
    select: { id: true, weekStart: true, config: true },
  });
  if (!run) return false;

  const jaTemCard = await prisma.campaignCard.findFirst({
    where: {
      runId: run.id,
      cardType: "video_clip",
      metadata: { path: ["completo"], equals: true },
    },
    select: { id: true },
  });
  if (jaTemCard) return false;

  const trechos = (video.clips as unknown as Trecho[]) ?? [];
  // O completo sai no PRIMEIRO dia do plano (30/09), que é hoje ou a data
  // escolhida no passo 4, e não na segunda da semana, que pode já ter
  // passado. Run de antes de 30/09 (sem início) segue na segunda.
  const inicio = planoDoRun(run.config).inicio;
  const diaDoCompleto = inicio ? diaDaSemanaDe(inicio) : 1;
  const data = dataDoDia({ inicio, weekStart: run.weekStart }, diaDoCompleto, 9);

  // Os links do cliente e as redes dele no fim da descrição (03/10 e 05/10):
  // o YouTube é a rede que mais aceita link, e o bloco sai sem IA, um por
  // linha, na ordem de prioridade (lib/media/elo-da-campanha.ts).
  const conteudo = [
    textoDoCompleto(trechos, video),
    blocoDeLinksDaDescricao({ rede: "youtube", links: lerLinks(video.project?.config), contas: video.project?.socialAccounts ?? [] }),
  ]
    .filter(Boolean)
    .join("\n\n");
  let postId: string | null = null;
  // O filtro exige gravacaoCompleta: só videoJobId casava com os posts dos
  // CORTES de YouTube Shorts, e o card do completo saiu ligado ao post do
  // corte 0 no teste de 01/09 (sem capítulos, sem descrição, sem prévia).
  const rascunho = await prisma.post.findFirst({
    where: {
      projectId: video.projectId,
      platform: "youtube",
      AND: [
        { metadata: { path: ["videoJobId"], equals: video.id } },
        { metadata: { path: ["gravacaoCompleta"], equals: true } },
      ],
    },
    select: { id: true },
  });
  if (rascunho) {
    postId = rascunho.id;
  } else {
    const criado = await prisma.post.create({
      data: {
        projectId: video.projectId,
        platform: "youtube",
        content: conteudo,
        mediaType: "video",
        // O COMPLETO EDITADO, e não `blobUrl`, que é a gravação bruta. Até
        // 02/09 o post apontava para o upload original: "Publicar no YouTube"
        // subiria o arquivo sem edição, e a prévia no Gestor abria um player
        // preto, porque o store da gravação bruta é privado e o navegador
        // recebe 403. Achado lendo os posts do projeto de teste do Bruno.
        imageUrl: video.completoUrl,
        status: "draft",
        runId: run.id,
        dayOfWeek: diaDoCompleto,
        scheduledAt: data,
        metadata: {
          origem: "video",
          videoJobId: video.id,
          gravacaoCompleta: true,
          capitulos: trechos.length,
        },
      },
      select: { id: true },
    });
    postId = criado.id;
  }

  await prisma.campaignCard.create({
    data: {
      runId: run.id,
      projectId: video.projectId,
      agentId: "vitor-video",
      agentName: "Vitor Vídeo",
      dayOfWeek: diaDoCompleto,
      scheduledDate: data,
      cardType: "video_clip",
      mediaType: "video",
      // O card mostra o que o POST é (título, capítulos, tags), e não o nome
      // do arquivo (a queixa de 01/09: completo sem descrição nenhuma).
      content: conteudo,
      mediaUrl: `/api/videos/${video.id}/midia?tipo=completo`,
      status: "pending",
      postId,
      metadata: {
        destino: DESTINO_COMPLETO.id,
        destinoRotulo: DESTINO_COMPLETO.rotulo,
        completo: true,
        videoJobId: video.id,
        // A capa escolhida (ou o quadro do rosto): a rota resolve na hora, então
        // trocar a capa no card do vídeo troca a miniatura sem regravar o card.
        thumb: `/api/videos/${video.id}/midia?tipo=capa-completo`,
      },
    },
  });
  return true;
}

/**
 * O texto do post do completo: com cortes, título e capítulos a partir deles;
 * sem cortes (o vídeo curto do gêmeo, 03/10), o título da gravação e a leitura
 * do radar. Exportado para a recuperação de quem nasceu com "Demandou".
 */
export function textoDoCompleto(
  trechos: Trecho[],
  video: { durationSec: number | null; originalName: string | null; radar?: unknown; project?: { name: string } | null }
): string {
  const nome = (video.originalName ?? "Gravação").replace(/\.[^.]+$/, "");
  if (trechos.some((t) => t.titulo?.trim())) return montarPostDeVideo(trechos, video.durationSec ?? 0, video.project?.name ?? nome);
  const radar = video.radar as Partial<Radar> | null | undefined;
  return montarPostSemCortes({
    titulo: tituloDaGravacao(video.originalName) ?? radar?.tema ?? video.project?.name ?? nome,
    // O resumo do radar fica de fora: ele é a leitura do squad sobre quem
    // fala ("Você defende que..."), não texto para o público do canal.
    teses: (radar?.teses ?? []).map((t) => t.frase),
    tema: radar?.tema ?? null,
  });
}
