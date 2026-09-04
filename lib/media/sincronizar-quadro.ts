import { prisma } from "@/lib/db/prisma";
import type { Trecho } from "@/lib/media/select-clips";
import { destinoPorId } from "@/lib/media/destinos";
import { diaDoTrecho } from "@/lib/media/quadro-do-video";

/**
 * Faz o Gestor de Conteúdo ESPELHAR a seleção da aba Vídeo.
 *
 * Achado do Bruno em 01/09: "selecionei somente um corte, mas no Gestor ficam
 * todos, inclusive o que não selecionei; as telas não se conversam". A causa:
 * o piloto agenda com tudo marcado (o padrão), e desmarcar depois não removia
 * nada. Esta função reconcilia nas duas direções, com uma regra de segurança:
 * só cria o que está pendente e só remove card pendente com post em rascunho.
 * O que o cliente já aprovou ou publicou nunca é tocado.
 *
 * Também mantém a ESTEIRA: todo dia com corte no quadro ganha o card da Vera
 * (prévia por rede) e o do Paulo (publicação), que era o fim de linha que
 * faltava ("não passa para os agentes Vera nem Paulo").
 */

type TrechoDoQuadro = Trecho & {
  publicar?: boolean;
  destinos?: string[];
  posts?: { linkedin?: string; x?: string; instagram?: string };
  texto?: { titulo?: string; descricao?: string };
  midia?: { vertical?: { url: string } | null } | null;
};

function legendaDoDestino(t: TrechoDoQuadro, plataforma: string): string {
  const generica =
    [t.texto?.titulo, t.texto?.descricao].filter(Boolean).join("\n\n") || t.titulo || "";
  if (plataforma === "twitter") return t.posts?.x || generica;
  if (plataforma === "linkedin") return t.posts?.linkedin || generica;
  if (plataforma === "instagram" || plataforma === "facebook") return t.posts?.instagram || generica;
  return generica;
}

export async function sincronizarQuadroDoVideo(videoJobId: string): Promise<void> {
  const video = await prisma.videoJob.findUnique({
    where: { id: videoJobId },
    select: { id: true, projectId: true, clips: true },
  });
  if (!video) return;

  const run = await prisma.pipelineRun.findFirst({
    where: {
      projectId: video.projectId,
      archived: false,
      config: { path: ["videoJobId"], equals: video.id },
    },
    select: { id: true, weekStart: true },
  });
  if (!run) return; // ainda não foi ao quadro; nada a espelhar

  const trechos = (video.clips as unknown as TrechoDoQuadro[]) ?? [];
  const cards = await prisma.campaignCard.findMany({
    where: { runId: run.id, cardType: "video_clip" },
    select: { id: true, status: true, postId: true, dayOfWeek: true, metadata: true },
  });

  // O que a seleção PEDE: um card por (trecho marcado x destino de vídeo).
  const esperados = new Map<string, { t: TrechoDoQuadro; indice: number; destinoId: string }>();
  trechos.forEach((t, indice) => {
    if (t.publicar === false || !t.midia?.vertical) return;
    for (const d of t.destinos ?? []) {
      const destino = destinoPorId(d);
      if (destino?.publicaVideo) esperados.set(`${indice}:${d}`, { t, indice, destinoId: d });
    }
  });

  // O que o quadro TEM (cards de corte; o completo fica de fora).
  const existentes = new Map<string, (typeof cards)[number]>();
  for (const c of cards) {
    const meta = c.metadata as { trechoIndice?: number; destino?: string; completo?: boolean } | null;
    if (meta?.completo) continue;
    if (typeof meta?.trechoIndice !== "number" || !meta.destino) continue;
    existentes.set(`${meta.trechoIndice}:${meta.destino}`, c);
  }

  // Remove o que o cliente desmarcou (só pendente + rascunho).
  for (const [chave, card] of existentes) {
    if (esperados.has(chave) || card.status !== "pending") continue;
    if (card.postId) {
      const post = await prisma.post.findUnique({
        where: { id: card.postId },
        select: { status: true },
      });
      if (post && post.status !== "draft") continue;
    }
    await prisma.campaignCard.delete({ where: { id: card.id } });
    if (card.postId) {
      await prisma.post.deleteMany({ where: { id: card.postId, status: "draft" } });
    }
  }

  // Cria o que o cliente marcou depois do agendamento.
  const segunda = run.weekStart ?? new Date();
  for (const [chave, alvo] of esperados) {
    if (existentes.has(chave)) continue;
    const destino = destinoPorId(alvo.destinoId)!;
    const irmao = [...existentes.values()].find((c) => {
      const m = c.metadata as { trechoIndice?: number } | null;
      return m?.trechoIndice === alvo.indice;
    });
    // O mesmo dia do irmão (outro destino do mesmo corte), ou o dia que o
    // espalhamento uniforme dá a este corte. Desde 04/09 os cards do Vitor
    // nascem AQUI (o agendar só abre o quadro e chama a sincronização), então
    // esta conta é a que decide a semana inteira, e não só o corte marcado
    // depois.
    const dayOfWeek = irmao?.dayOfWeek ?? diaDoTrecho(trechos, alvo.indice);
    const data = new Date(segunda.getTime() + (dayOfWeek - 1) * 86400000);
    data.setUTCHours(12, 0, 0, 0);
    const legenda = legendaDoDestino(alvo.t, destino.plataforma);
    const post = await prisma.post.create({
      data: {
        projectId: video.projectId,
        platform: destino.plataforma,
        content: legenda,
        mediaType: "video",
        imageUrl: alvo.t.midia!.vertical!.url,
        status: "draft",
        dayOfWeek,
        scheduledAt: data,
        runId: run.id,
        metadata: {
          origem: "video",
          videoJobId: video.id,
          trechoIndice: alvo.indice,
          destino: destino.id,
        },
      },
      select: { id: true },
    });
    await prisma.campaignCard.create({
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
        mediaUrl: `/api/videos/${video.id}/midia?trecho=${alvo.indice}&tipo=vertical`,
        status: "pending",
        postId: post.id,
        metadata: {
          destino: destino.id,
          destinoRotulo: destino.rotulo,
          titulo: alvo.t.texto?.titulo ?? alvo.t.titulo,
          videoJobId: video.id,
          trechoIndice: alvo.indice,
          thumb: `/api/videos/${video.id}/midia?trecho=${alvo.indice}&tipo=capa-arte`,
        },
      },
    });
  }

  // ── A esteira: Vera e Paulo em todo dia que tem conteúdo do vídeo ──
  const cardsAtuais = await prisma.campaignCard.findMany({
    where: { runId: run.id },
    select: { id: true, agentId: true, dayOfWeek: true, status: true, cardType: true, postId: true },
  });
  // O carrossel da Diana só conta quando virou post (mídia gerada); antes
  // disso é só um briefing e não há nada para a Vera revisar nem o Paulo publicar.
  const diasComConteudo = new Set(
    cardsAtuais
      .filter(
        (c) =>
          c.agentId === "vitor-video" ||
          c.cardType === "post_linkedin" ||
          c.cardType === "post_twitter" ||
          (c.cardType === "media" && c.postId)
      )
      .map((c) => c.dayOfWeek)
  );
  const esteira = [
    {
      agentId: "vera-veredito",
      agentName: "Vera Veredito",
      cardType: "preview",
      hora: 13,
      // Texto de espera: `revisarDiasDoVideo` troca pelo veredito de verdade.
      content:
        "Vera está revisando os posts deste dia. O veredito, com o que está bom e o que precisa mudar, aparece aqui em instantes.",
    },
    {
      agentId: "paulo-publicador",
      agentName: "Paulo Publicador",
      cardType: "publish",
      hora: 14,
      content: "Publicação do dia: revise a prévia de cada rede e publique daqui.",
    },
  ];
  for (const dia of diasComConteudo) {
    for (const e of esteira) {
      const ja = cardsAtuais.find((c) => c.agentId === e.agentId && c.dayOfWeek === dia);
      if (ja) continue;
      const data = new Date(segunda.getTime() + (dia - 1) * 86400000);
      data.setUTCHours(e.hora, 0, 0, 0);
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
          content: e.content,
          status: "pending",
          metadata: { origem: "video", videoJobId: video.id },
        },
      });
    }
  }
  // Vera/Paulo de dia que ficou vazio saem (só pendentes).
  for (const c of cardsAtuais) {
    if ((c.agentId === "vera-veredito" || c.agentId === "paulo-publicador") &&
        c.status === "pending" && !diasComConteudo.has(c.dayOfWeek)) {
      await prisma.campaignCard.delete({ where: { id: c.id } }).catch(() => {});
    }
  }
}
