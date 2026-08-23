export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import type { Trecho } from "@/lib/media/select-clips";
import { destinoPorId, DESTINO_COMPLETO } from "@/lib/media/destinos";

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
  midia?: { vertical?: { url: string } | null } | null;
};

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

  const run = await prisma.pipelineRun.create({
    data: {
      projectId: video.projectId,
      status: "completed",
      topic: nome,
      campaignMode: "weekly",
      weekStart: segunda,
      // O vínculo com o vídeo mora aqui, e é o que torna esta rota idempotente
      // sem precisar de coluna nova.
      config: { videoJobId: video.id, origem: "video" },
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

    const legenda = [t.texto?.titulo, t.texto?.descricao].filter(Boolean).join("\n\n")
      || t.titulo
      || "";

    for (const destino of destinos) {
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

  // O vídeo completo, quando existe, entra como card próprio no primeiro dia:
  // ele é o item principal da semana, e não um corte a mais.
  if (video.completoUrl) {
    const data = new Date(segunda.getTime());
    data.setUTCHours(9, 0, 0, 0);
    await prisma.campaignCard.create({
      data: {
        runId: run.id,
        projectId: video.projectId,
        agentId: "vitor-video",
        agentName: "Vitor Vídeo",
        dayOfWeek: 1,
        scheduledDate: data,
        cardType: "video_clip",
        mediaType: "video",
        content: `${nome}, gravação completa editada`,
        mediaUrl: `/api/videos/${video.id}/midia?tipo=completo`,
        status: "pending",
        metadata: {
          destino: DESTINO_COMPLETO.id,
          destinoRotulo: DESTINO_COMPLETO.rotulo,
          completo: true,
          videoJobId: video.id,
        },
      },
    });
  }

  return NextResponse.json({
    runId: run.id,
    criado: true,
    cards: criados.length,
    cortes: aprovados.length,
  });
}
