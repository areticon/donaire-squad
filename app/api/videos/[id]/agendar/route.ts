export const dynamic = "force-dynamic";
// A parte lenta (carrossel da Diana e veredito da Vera) roda em `after`, depois
// da resposta, e precisa deste teto para não morrer no meio.
export const maxDuration = 300;

import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import type { Trecho } from "@/lib/media/select-clips";
import { destinoPorId, DESTINO_COMPLETO } from "@/lib/media/destinos";
import { anexarCompletoAoQuadro } from "@/lib/media/completo-no-quadro";
import { sincronizarQuadroDoVideo } from "@/lib/media/sincronizar-quadro";
import { completarEsteiraDoVideo } from "@/lib/media/esteira-do-video";

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
      project: { select: { name: true } },
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

  // ── Os conteúdos DERIVADOS do vídeo, sem custo de IA novo ──────────────────
  //
  // A redação já escreveu texto POR REDE para cada corte; o melhor corte também
  // rende um post de texto no LinkedIn e no X, em dias diferentes dos cortes,
  // porque presença é ocupar a semana e não empilhar tudo na segunda. E a Diana
  // ganha um card de carrossel com as frases fortes do vídeo. Até 02/09 o card
  // nascia só com o briefing e as imagens ficavam para "quando o cliente
  // pedir pelo chat", sem a tela dizer isso: o Bruno viu o sábado vazio e
  // chamou de travado. Agora as imagens são geradas em `after`, logo abaixo.
  const melhor = [...aprovados].sort(
    (a, b) => ((b.t as { nota?: number }).nota ?? 0) - ((a.t as { nota?: number }).nota ?? 0)
  )[0]?.t;
  if (melhor) {
    const derivados: Array<{
      plataforma: string;
      cardType: string;
      agentId: string;
      agentName: string;
      dia: number;
      texto: string | undefined;
    }> = [
      {
        plataforma: "linkedin",
        cardType: "post_linkedin",
        agentId: "lucas-linkedin",
        agentName: "Lucas LinkedIn",
        dia: 3,
        texto: melhor.posts?.linkedin,
      },
      {
        plataforma: "twitter",
        cardType: "post_twitter",
        agentId: "tiago-twitter",
        agentName: "Tiago Twitter",
        dia: 4,
        texto: melhor.posts?.x,
      },
    ];
    for (const d of derivados) {
      if (!d.texto?.trim()) continue;
      const data = new Date(segunda.getTime() + (d.dia - 1) * 86400000);
      data.setUTCHours(12, 0, 0, 0);
      const post = await prisma.post.create({
        data: {
          projectId: video.projectId,
          platform: d.plataforma,
          content: d.texto.trim(),
          mediaType: "text",
          status: "draft",
          dayOfWeek: d.dia,
          scheduledAt: data,
          runId: run.id,
          metadata: { origem: "video", videoJobId: video.id, derivado: true },
        },
        select: { id: true },
      });
      await prisma.campaignCard.create({
        data: {
          runId: run.id,
          projectId: video.projectId,
          agentId: d.agentId,
          agentName: d.agentName,
          dayOfWeek: d.dia,
          scheduledDate: data,
          cardType: d.cardType,
          mediaType: "text",
          content: d.texto.trim(),
          status: "pending",
          postId: post.id,
          metadata: { origem: "video", videoJobId: video.id, derivado: true },
        },
      });
    }

    const frases = trechos
      .map((t) => t.texto?.fraseDaCapa?.trim())
      .filter((f): f is string => Boolean(f))
      .slice(0, 5);
    if (frases.length >= 3) {
      const dataDiana = new Date(segunda.getTime() + 5 * 86400000);
      dataDiana.setUTCHours(12, 0, 0, 0);
      await prisma.campaignCard.create({
        data: {
          runId: run.id,
          projectId: video.projectId,
          agentId: "diana-design",
          agentName: "Diana Design",
          dayOfWeek: 6,
          scheduledDate: dataDiana,
          cardType: "media",
          mediaType: "image",
          content:
            `Diana está montando o carrossel com as frases fortes do vídeo "${nome}", ` +
            `um slide por frase, nas cores da marca: ` +
            frases.map((f, i) => `${i + 1}. "${f}"`).join(" "),
          status: "pending",
          metadata: { origem: "video", videoJobId: video.id, derivado: true },
        },
      });
    }
  }

  // A esteira (Vera e Paulo) e a reconciliação final saem da mesma lib que o
  // salvar de destinos usa, então quadro e seleção nascem já espelhados.
  await sincronizarQuadroDoVideo(video.id).catch((e) =>
    console.error(`[agendar][${video.id}] sincronizar falhou:`, e)
  );

  // O quadro já responde com os cards; o carrossel e os vereditos chegam pelo
  // polling de 4 em 4 segundos, que é o "tempo real" do Gestor desde a parte 87.
  after(() => completarEsteiraDoVideo(video.id));

  return NextResponse.json({
    runId: run.id,
    criado: true,
    cards: criados.length,
    cortes: aprovados.length,
  });
}
