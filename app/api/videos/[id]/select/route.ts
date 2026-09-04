export const dynamic = "force-dynamic";
// Medido em 22/08 contra a gravação real de 27 minutos: 121s de parede, com
// 12.358 tokens de entrada e 10.916 de saída, quase toda ela de pensamento. O
// pensamento escala com a entrada, então gravação de 60 minutos anda para perto
// do dobro. 800 é o teto do plano Pro e existe para essa folga.
//
// Isto NÃO conserta o timeout, apenas afasta. O que conserta o silêncio é o
// estado explícito com prazo em `lib/media/video-state.ts`: função morta pela
// plataforma não consegue gravar erro nenhum, e sem prazo ninguém percebe.
export const maxDuration = 800;

import { NextRequest, NextResponse, after } from "next/server";
import { acessoAoVideo, despacharPasso } from "@/lib/media/piloto-do-servidor";
import { prisma } from "@/lib/db/prisma";
import { selecionarTrechos } from "@/lib/media/select-clips";
import { MAX_TENTATIVAS } from "@/lib/media/video-state";

/**
 * Passo 3 do fluxo de vídeo: escolher os melhores trechos.
 *
 * Roda depois da transcrição, sobre o que já está gravado no banco. Não toca no
 * arquivo de vídeo, então é barato e pode ser repetido sem pagar transcrição de
 * novo, que é útil quando o cliente não gostou da seleção.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {

  const { id } = await params;
  // Sessão do dono OU assinatura do piloto do servidor (ver piloto-do-servidor.ts).
  const acesso = await acessoAoVideo(req, id);
  if (!acesso) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const video = await prisma.videoJob.findFirst({
    where: acesso.where,
    select: {
      id: true,
      status: true,
      attempts: true,
      durationSec: true,
      transcript: true,
      projectId: true,
      project: { select: { niche: true, targetAudience: true, voice: true } },
    },
  });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });

  if (video.status !== "transcribed" && video.status !== "failed") {
    return NextResponse.json(
      { error: `Vídeo está em "${video.status}". A seleção roda depois da transcrição.` },
      { status: 409 }
    );
  }

  if (video.attempts >= MAX_TENTATIVAS) {
    return NextResponse.json(
      { error: "Esta etapa já falhou vezes demais. Fale com o suporte antes de tentar outra vez." },
      { status: 409 }
    );
  }

  const transcript = video.transcript as {
    paragraphs?: Array<{ text: string; start: number; end: number }>;
    words?: Array<{ word: string; start: number; end: number; confidence: number }>;
  } | null;

  const paragrafos = transcript?.paragraphs ?? [];
  if (!paragrafos.length) {
    return NextResponse.json(
      { error: "Esse vídeo não tem transcrição com parágrafos. Transcreva antes." },
      { status: 400 }
    );
  }

  // Toma o trabalho para si antes de começar. O `status` no filtro é o que
  // torna isto atômico: dois cliques seguidos, ou duas abas, e só um passa. E
  // gravar `startedAt` agora é o que permite declarar isto morto depois, se a
  // plataforma derrubar a função sem deixar o `catch` rodar.
  const tomado = await prisma.videoJob.updateMany({
    where: { id, status: video.status },
    data: {
      status: "selecting",
      startedAt: new Date(),
      attempts: { increment: 1 },
      error: null,
    },
  });
  if (tomado.count === 0) {
    return NextResponse.json(
      { error: "Outra aba já começou a escolher os trechos deste vídeo." },
      { status: 409 }
    );
  }

  try {
    const trechos = await selecionarTrechos(
      // As palavras vão junto porque é delas que sai o recorte da fala de cada
      // trecho. Antes quem copiava a fala era o modelo, e isso respondia por
      // quase toda a duração desta chamada.
      { paragrafos, palavras: transcript?.words },
      video.durationSec ?? paragrafos[paragrafos.length - 1].end,
      {
        nicho: video.project.niche,
        publico: video.project.targetAudience,
        voz: video.project.voice,
      },
      { projectId: video.projectId }
    );

    await prisma.videoJob.update({
      where: { id },
      data: {
        status: "selected",
        startedAt: null,
        attempts: 0,
        clips: trechos,
        error: null,
      },
    });

    // Trechos escolhidos, o corte sai daqui, seja quem for que pediu a
    // seleção (o servidor ou a tela): a aba do cliente não precisa estar
    // aberta para o worker começar.
    after(() => despacharPasso(id, "cortar"));

    return NextResponse.json({
      ok: true,
      trechos: trechos.map((t) => ({
        inicio: t.inicio,
        fim: t.fim,
        titulo: t.titulo,
        motivo: t.motivo,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao escolher os trechos";
    await prisma.videoJob.update({
      where: { id },
      data: { status: "failed", startedAt: null, error: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
