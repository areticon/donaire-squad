export const dynamic = "force-dynamic";
// Uma chamada por trecho, em paralelo. Com 15 trechos e a chamada mais lenta em
// torno de 20s, o pior caso fica bem abaixo disto, mas o padrão de 10s não
// serviria nem para um. 800 é o teto do plano Pro, e o prazo que declara isto
// morto vive em `lib/media/video-state.ts`.
export const maxDuration = 800;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import type { Trecho } from "@/lib/media/select-clips";
import { escreverPosts, montarPrefixoCacheavel } from "@/lib/media/write-posts";
import { debitar, jaCobrado, SaldoInsuficiente } from "@/lib/credits";
import { creditosEstimados } from "@/lib/media/limits";
import { MAX_TENTATIVAS } from "@/lib/media/video-state";

/**
 * Passo 4 do fluxo de vídeo: escrever os posts de cada trecho.
 *
 * Roda em paralelo porque os trechos são independentes. Um trecho que falhar
 * não derruba os outros: ele volta sem posts e a tela mostra o que deu certo.
 * Entregar quatro de cinco é melhor que entregar zero.
 */
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
      attempts: true,
      clips: true,
      projectId: true,
      userId: true,
      durationSec: true,
      creditsCharged: true,
      project: {
        select: {
          niche: true,
          targetAudience: true,
          voice: true,
          contexts: {
            where: { type: "brand" },
            select: { compiled: true },
            take: 1,
          },
        },
      },
    },
  });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });

  if (video.status !== "selected" && video.status !== "failed") {
    return NextResponse.json(
      { error: `Vídeo está em "${video.status}". A redação roda depois da seleção.` },
      { status: 409 }
    );
  }

  if (video.attempts >= MAX_TENTATIVAS) {
    return NextResponse.json(
      { error: "Esta etapa já falhou vezes demais. Fale com o suporte antes de tentar outra vez." },
      { status: 409 }
    );
  }

  const trechos = (video.clips as unknown as Trecho[] | null) ?? [];
  if (!trechos.length) {
    return NextResponse.json(
      { error: "Esse vídeo não tem trechos escolhidos. Rode a seleção antes." },
      { status: 400 }
    );
  }

  // Toma o trabalho antes de cobrar. Ordem deliberada: se dois cliques
  // chegarem juntos, o segundo para aqui e não chega perto do débito.
  const tomado = await prisma.videoJob.updateMany({
    where: { id, status: video.status },
    data: {
      status: "writing",
      startedAt: new Date(),
      attempts: { increment: 1 },
      error: null,
    },
  });
  if (tomado.count === 0) {
    return NextResponse.json(
      { error: "Outra aba já começou a escrever os posts deste vídeo." },
      { status: 409 }
    );
  }

  // Passo 6: a cobrança acontece aqui, e não no upload, porque a duração real
  // só é conhecida depois da transcrição, e é ela que define o preço junto com
  // o número de trechos. Cobrar antes de escrever, e não depois, é deliberado:
  // se o cliente não tem saldo, ele descobre antes de a gente gastar com a API.
  const custo = creditosEstimados(video.durationSec ?? 0);
  const cobrado = await jaCobrado("video_job", video.id);

  if (!cobrado) {
    try {
      await debitar({
        userId: video.userId,
        quantidade: custo,
        operation: "video_job",
        projectId: video.projectId,
        refId: video.id,
        note: `${Math.round((video.durationSec ?? 0) / 60)} min, ${trechos.length} trechos`,
      });
      await prisma.videoJob.update({
        where: { id },
        data: { creditsCharged: custo },
      });
    } catch (err) {
      // Devolve o trabalho antes de sair. Sem isto, quem não tem saldo ficaria
      // preso em "writing" até o prazo estourar, vendo a plataforma "escrevendo"
      // um post que ninguém está escrevendo.
      await prisma.videoJob.update({
        where: { id },
        data: { status: "selected", startedAt: null, attempts: 0 },
      });
      if (err instanceof SaldoInsuficiente) {
        return NextResponse.json({ error: err.message }, { status: 402 });
      }
      throw err;
    }
  }

  // Prefixo idêntico byte a byte entre os trechos: é o que faz o cache pegar.
  const prefixo = montarPrefixoCacheavel({
    nicho: video.project.niche,
    publico: video.project.targetAudience,
    voz: video.project.voice,
    marca: video.project.contexts[0]?.compiled,
  });

  const resultados = await Promise.all(
    trechos.map(async (t) => {
      try {
        const posts = await escreverPosts(t, prefixo, { projectId: video.projectId });
        return { ...t, posts };
      } catch (err) {
        return {
          ...t,
          erro: err instanceof Error ? err.message : "Falha ao escrever",
        };
      }
    })
  );

  const comPosts = resultados.filter((r) => "posts" in r).length;
  const falhas = resultados.length - comPosts;

  await prisma.videoJob.update({
    where: { id },
    data: {
      clips: resultados,
      // Vale como pronto se pelo menos um trecho virou post: a tela de
      // aprovação já tem o que mostrar, e o cliente pode mandar rodar de novo
      // só os que falharam.
      status: comPosts > 0 ? "ready" : "failed",
      startedAt: null,
      attempts: comPosts > 0 ? 0 : video.attempts + 1,
      error: falhas > 0 ? `${falhas} de ${resultados.length} trechos falharam.` : null,
    },
  });

  return NextResponse.json({
    ok: comPosts > 0,
    trechos: resultados.length,
    comPosts,
    falhas,
  });
}
