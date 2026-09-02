export const dynamic = "force-dynamic";
// A parte lenta (pesquisa do Roberto, redação da semana, peças da Diana e
// veredito da Vera) roda em `after`, depois da resposta, e precisa deste teto
// para não morrer no meio.
export const maxDuration = 300;

import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import type { Trecho } from "@/lib/media/select-clips";
import { destinoPorId, DESTINO_COMPLETO } from "@/lib/media/destinos";
import { anexarCompletoAoQuadro } from "@/lib/media/completo-no-quadro";
import { sincronizarQuadroDoVideo } from "@/lib/media/sincronizar-quadro";
import { completarEsteiraDoVideo } from "@/lib/media/esteira-do-video";
import { diasDaSemana, normalizarSemana, ROTULO_DO_FORMATO } from "@/lib/media/semana-do-video";
import type { Prisma } from "@prisma/client";

/**
 * Leva os cortes aprovados para o quadro do Gestor de Conteúdo.
 *
 * É a fusão que o Bruno pediu em 22/08: até aqui o vídeo vivia numa aba própria
 * e primitiva enquanto o resto do produto vivia no kanban com agentes,
 * cronograma e prévia por rede. Depois desta rota, os cortes viram cards no
 * mesmo quadro, na linha do Vitor Vídeo.
 *
 * **Os cortes são espalhados na semana, e não empilhados num dia.** Sete cortes
 * publicados na mesma manhã é spam, e a plataforma existe justamente para
 * sustentar presença ao longo do tempo. O quadro carrega por semana, então
 * distribuir também é o que faz eles aparecerem.
 */

type TrechoPronto = Trecho & {
  publicar?: boolean;
  destinos?: string[];
  texto?: { titulo: string; descricao: string; fraseDaCapa: string };
  posts?: { linkedin?: string; x?: string; instagram?: string };
  midia?: { vertical?: { url: string } | null } | null;
};

/**
 * O texto certo para cada rede. A redação já escreveu um texto POR REDE
 * (posts.linkedin, posts.x, posts.instagram); usar o título genérico em tudo
 * jogava esse trabalho fora, e era o que o card do quadro mostrava até 31/08.
 */
function legendaDoDestino(t: TrechoPronto, plataforma: string): string {
  const generica = [t.texto?.titulo, t.texto?.descricao].filter(Boolean).join("\n\n") || t.titulo || "";
  if (plataforma === "twitter") return t.posts?.x || generica;
  if (plataforma === "linkedin") return t.posts?.linkedin || generica;
  if (plataforma === "instagram" || plataforma === "facebook") return t.posts?.instagram || generica;
  return generica;
}

function segundaDaSemana(d = new Date()): Date {
  const dia = d.getUTCDay();
  const desloca = dia === 0 ? -6 : 1 - dia;
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + desloca * 86400000
  );
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const video = await prisma.videoJob.findFirst({
    where: { id, project: { userId } },
    select: {
      id: true,
      status: true,
      clips: true,
      projectId: true,
      originalName: true,
      completoUrl: true,
      blobUrl: true,
      durationSec: true,
      capaFonteUrl: true,
      radar: true,
      project: { select: { name: true, videoSemana: true } },
    },
  });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });

  // Idempotência: um clique repetido não pode encher o quadro de cards
  // duplicados nem criar dois posts para a mesma rede.
  const jaExiste = await prisma.pipelineRun.findFirst({
    where: {
      projectId: video.projectId,
      archived: false,
      config: { path: ["videoJobId"], equals: video.id },
    },
    select: { id: true },
  });
  if (jaExiste) {
    return NextResponse.json({ runId: jaExiste.id, criado: false });
  }

  const trechos = (video.clips as unknown as TrechoPronto[]) ?? [];
  const aprovados = trechos
    .map((t, indice) => ({ t, indice }))
    .filter(({ t }) => t.publicar !== false && t.midia?.vertical);

  if (!aprovados.length) {
    return NextResponse.json(
      { error: "Nenhum corte pronto e marcado para publicar." },
      { status: 400 }
    );
  }

  const segunda = segundaDaSemana();
  const nome = (video.originalName ?? "Gravação").replace(/\.[^.]+$/, "");

  // A semana que o cliente escolheu no envio (formato por dia, terça a
  // domingo), congelada no run: se ele mudar a escolha no projeto depois, vale
  // para a PRÓXIMA gravação, e esta semana continua como foi pedida.
  const semana = normalizarSemana(video.project.videoSemana);

  const run = await prisma.pipelineRun.create({
    data: {
      projectId: video.projectId,
      status: "completed",
      topic: nome,
      campaignMode: "weekly",
      weekStart: segunda,
      // O vínculo com o vídeo mora aqui, e é o que torna esta rota idempotente
      // sem precisar de coluna nova.
      config: { videoJobId: video.id, origem: "video", semana } as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  const criados: Array<{ postId: string; cardId: string; dia: number }> = [];

  for (let i = 0; i < aprovados.length; i++) {
    const { t, indice } = aprovados[i];
    // Espalha de segunda (1) a domingo (7), com espaçamento uniforme. Com 3
    // cortes cai em segunda, quinta e domingo; com 7, um por dia. Amontoar no
    // começo da semana e deixar o fim vazio seria pior que empilhar tudo, porque
    // parece cronograma e não é.
    const dayOfWeek =
      aprovados.length === 1
        ? 1
        : Math.round((i * 6) / (aprovados.length - 1)) + 1;
    const data = new Date(segunda.getTime() + (dayOfWeek - 1) * 86400000);
    data.setUTCHours(12, 0, 0, 0);

    const destinos = (t.destinos ?? [])
      .map((d) => destinoPorId(d))
      .filter((d): d is NonNullable<typeof d> => Boolean(d) && d!.publicaVideo);

    if (!destinos.length) continue;

    for (const destino of destinos) {
      const legenda = legendaDoDestino(t, destino.plataforma);
      const post = await prisma.post.create({
        data: {
          projectId: video.projectId,
          platform: destino.plataforma,
          content: legenda,
          mediaType: "video",
          imageUrl: t.midia!.vertical!.url,
          status: "draft",
          dayOfWeek,
          scheduledAt: data,
          runId: run.id,
          metadata: {
            origem: "video",
            videoJobId: video.id,
            trechoIndice: indice,
            destino: destino.id,
          },
        },
        select: { id: true },
      });

      const card = await prisma.campaignCard.create({
        data: {
          runId: run.id,
          projectId: video.projectId,
          agentId: "vitor-video",
          agentName: "Vitor Vídeo",
          dayOfWeek,
          scheduledDate: data,
          cardType: "video_clip",
          mediaType: "video",
          content: legenda,
          // A URL passa pela NOSSA rota, e não pela do storage: o store é
          // privado e a URL crua responde 403 dentro do quadro.
          mediaUrl: `/api/videos/${video.id}/midia?trecho=${indice}&tipo=vertical`,
          status: "pending",
          postId: post.id,
          metadata: {
            destino: destino.id,
            destinoRotulo: destino.rotulo,
            titulo: t.texto?.titulo ?? t.titulo,
            videoJobId: video.id,
            trechoIndice: indice,
            // A capa do corte, servida pela nossa rota (o store é privado).
            thumb: `/api/videos/${video.id}/midia?trecho=${indice}&tipo=capa-arte`,
          },
        },
        select: { id: true },
      });

      criados.push({ postId: post.id, cardId: card.id, dia: dayOfWeek });
    }
  }

  if (!criados.length) {
    // Sem destino publicável, o run ficaria órfão no quadro.
    await prisma.pipelineRun.delete({ where: { id: run.id } });
    return NextResponse.json(
      {
        error:
          "Os cortes marcados não têm nenhum destino que publique vídeo hoje. Marque YouTube Shorts ou Instagram Reels.",
      },
      { status: 400 }
    );
  }

  // O vídeo completo entra pelo mesmo caminho que o callback usa quando ele
  // chega atrasado (aviso em duas fases desde 01/09). Se ainda não terminou de
  // codificar, o callback anexa depois, sozinho.
  if (video.completoUrl) {
    await anexarCompletoAoQuadro(video.id).catch((e) =>
      console.error(`[agendar][${video.id}] completo no quadro falhou:`, e)
    );
  }

  // ── A semana a partir do vídeo, como o cliente escolheu ────────────────
  //
  // Até 02/09 esta parte era fixa: o texto do melhor corte copiado para o
  // LinkedIn na quarta e para o X na quinta, e um carrossel no sábado, sem
  // perguntar nada a ninguém. O Bruno reprovou: quem escolhe o formato de cada
  // dia é o cliente, e o Roberto pesquisa antes de qualquer redator escrever.
  //
  // Aqui nascem só os cards de ESPERA, um por agente e por dia escolhido, com
  // o formato no metadata (é o que o cabeçalho do quadro mostra). Quem escreve
  // de verdade é `completarEsteiraDoVideo`, em `after`, na ordem Roberto,
  // redatores, Vera. O card de espera é o mesmo que recebe o texto depois.
  const roberto = video.radar
    ? null
    : {
        content:
          "Roberto está pesquisando a partir da transcrição: o que você disse, o que estão falando sobre isso agora e dados com fonte. O briefing aparece aqui em instantes.",
      };
  if (roberto) {
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
        content: roberto.content,
        status: "pending",
        metadata: { origem: "video", videoJobId: video.id, aguardando: true },
      },
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
  for (const { dia, formato, escolhido } of diasDaSemana(semana)) {
    const data = new Date(segunda.getTime() + (dia - 1) * 86400000);
    data.setUTCHours(12, 0, 0, 0);
    for (const e of ESPERA[formato] ?? []) {
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

  // A esteira (Vera e Paulo) e a reconciliação final saem da mesma lib que o
  // salvar de destinos usa, então quadro e seleção nascem já espelhados.
  await sincronizarQuadroDoVideo(video.id).catch((e) =>
    console.error(`[agendar][${video.id}] sincronizar falhou:`, e)
  );

  // O quadro já responde com os cards de espera; a pesquisa, os textos, as
  // peças da Diana e os vereditos chegam pelo polling de 4 em 4 segundos, que
  // é o "tempo real" do Gestor desde a parte 87.
  after(() => completarEsteiraDoVideo(video.id));

  return NextResponse.json({
    runId: run.id,
    criado: true,
    cards: criados.length,
    cortes: aprovados.length,
  });
}
