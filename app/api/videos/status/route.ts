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
      createdAt: true,
      originalName: true,
      completoUrl: true,
      radar: true,
      // Os trechos entram na CONSULTA mas não na resposta: o que a faixa do
      // Gestor precisa é contagem, não conteúdo. Mandar os textos das três
      // redes de cada trecho a cada quatro segundos seriam dezenas de KB por
      // consulta, e foi por isso que esta rota nasceu separada de `/api/videos`.
      clips: true,
    },
  });

  const agora = Date.now();

  return NextResponse.json({
    videos: videos.map((v) => {
      const trechos = (Array.isArray(v.clips) ? v.clips : []) as Array<{
        publicar?: boolean;
        posts?: unknown;
        titulo?: string;
        destinos?: string[];
        texto?: { titulo?: string };
        inicio?: number;
        fim?: number;
        midia?: { vertical?: unknown };
      }>;
      const comMidia = trechos.filter((t) => t.midia?.vertical);
      return {
      id: v.id,
      status: v.status,
      error: v.error,
      attempts: v.attempts,
      durationSec: v.durationSec,
      updatedAt: v.updatedAt.toISOString(),
      /**
       * O relógio da faixa conta desde o ENVIO, e não desde a etapa atual.
       * É o número que o dono da gravação tem na cabeça ("subi faz quanto
       * tempo"), e é o único que permite dizer quanto falta para o vídeo
       * completo, que só chega no fim de tudo.
       */
      criadoEm: v.createdAt.toISOString(),
      originalName: v.originalName,
      /**
       * O que a faixa do piloto mostra em cada fase, e o que o piloto usa para
       * decidir a próxima etapa. São contagens derivadas dos trechos, não os
       * trechos: quem quer o conteúdo chama `/api/videos`.
       */
      trechosEscolhidos: trechos.length,
      cortesProntos: comMidia.length,
      cortesQueVaoAoAr: comMidia.filter((t) => t.publicar !== false).length,
      temTranscricao: v.durationSec !== null,
      temTrechos: trechos.length > 0,
      temCortes: comMidia.length > 0,
      temTrechosComPosts: trechos.some((t) => t.posts),
      temCompleto: Boolean(v.completoUrl),
      /**
       * A pesquisa do Roberto, em contagem: a faixa mostra "Pesquisando"
       * enquanto não existe e "3 teses, 4 fontes" quando existe. O briefing
       * inteiro vive no card do quadro, não aqui.
       */
      radar: (() => {
        const r = v.radar as { teses?: unknown[]; achados?: unknown[]; dados?: unknown[]; fontes?: unknown[] } | null;
        if (!r) return null;
        return {
          teses: r.teses?.length ?? 0,
          achados: r.achados?.length ?? 0,
          dados: r.dados?.length ?? 0,
          fontes: r.fontes?.length ?? 0,
        };
      })(),
      /**
       * Os cortes que o cliente DESLIGOU, com o mínimo para caberem no quadro.
       *
       * Eles existem, foram pagos e estão no storage, mas não têm card nem
       * post: o quadro só mostra o que vai ao ar. No teste de 02/09 dois dos
       * três cortes estavam desligados e simplesmente não apareciam em lugar
       * nenhum, o que se lê como trabalho perdido. Aqui eles voltam a ser
       * visíveis, apagados, e com um interruptor para mudar de ideia.
       */
      cortesGuardados: trechos
        .map((t, indice) => ({ t, indice }))
        .filter(({ t }) => t.midia?.vertical && t.publicar === false)
        .map(({ t, indice }) => ({
          indice,
          titulo: t.texto?.titulo ?? t.titulo ?? "Corte sem título",
          destinos: t.destinos ?? [],
          inicio: typeof t.inicio === "number" ? t.inicio : null,
          fim: typeof t.fim === "number" ? t.fim : null,
          capa: `/api/videos/${v.id}/midia?trecho=${indice}&tipo=capa-arte`,
          video: `/api/videos/${v.id}/midia?trecho=${indice}&tipo=vertical`,
        })),
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
      };
    }),
  });
}
