export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { estaTrabalhando, PRAZO_SEGUNDOS } from "@/lib/media/video-state";
import { varrerExpirados } from "@/lib/media/video-sweep";

/**
 * O estado dos vídeos de um projeto, enxuto, para a tela consultar de tempos em
 * tempos.
 *
 * Existe separado de `/api/videos` porque aquele devolve os `clips` inteiros,
 * com os textos das três redes de cada trecho, e a tela de espera consulta isto
 * a cada poucos segundos. Mandar dezenas de KB de post pronto para descobrir se
 * o status mudou seria desperdício por consulta, multiplicado pelo tempo todo
 * que alguém fica esperando.
 *
 * **E ele também é o relógio do sistema.** Trabalho morto por timeout não
 * consegue se declarar morto, então quem está vivo precisa fazer isso. Quem
 * está sempre vivo é quem tem a tela aberta esperando. Enquanto não existe
 * fila, é esta rota que fecha o buraco da falha silenciosa.
 */
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId é obrigatório" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });

  await varrerExpirados(projectId);

  const videos = await prisma.videoJob.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      error: true,
      startedAt: true,
      attempts: true,
      durationSec: true,
      updatedAt: true,
    },
  });

  const agora = Date.now();

  return NextResponse.json({
    videos: videos.map((v) => ({
      id: v.id,
      status: v.status,
      error: v.error,
      attempts: v.attempts,
      durationSec: v.durationSec,
      updatedAt: v.updatedAt.toISOString(),
      /**
       * Há quantos segundos esta etapa está rodando, e quanto ela tem de prazo.
       *
       * Vai daqui, e não do relógio do navegador, porque o relógio do navegador
       * mente: máquina com fuso errado ou hora dessincronizada mostraria tempo
       * negativo ou tempo absurdo justamente na tela em que o cliente está
       * ansioso.
       */
      rodandoHaSegundos:
        estaTrabalhando(v.status) && v.startedAt
          ? Math.max(0, Math.round((agora - v.startedAt.getTime()) / 1000))
          : null,
      prazoSegundos: estaTrabalhando(v.status) ? PRAZO_SEGUNDOS[v.status] : null,
    })),
  });
}
