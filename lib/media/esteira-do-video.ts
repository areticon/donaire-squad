import { prisma } from "@/lib/db/prisma";
import { pesquisarDoVideo, gravarCardDoRadar } from "@/lib/media/radar-do-video";
import { escreverSemanaDoVideo } from "@/lib/media/pecas-da-semana";
import { revisarDiasDoVideo } from "@/lib/media/vera-do-video";
import { sincronizarQuadroDoVideo } from "@/lib/media/sincronizar-quadro";

/**
 * A parte LENTA da esteira do vídeo, na ordem da campanha de texto: Roberto
 * pesquisa (se ainda não pesquisou), os redatores escrevem a semana que o
 * cliente escolheu (os dias em paralelo), o quadro ganha Vera e Paulo em cada
 * dia com conteúdo, e a Vera revisa (os dias em paralelo).
 *
 * Desde 04/09 roda a partir do callback da transcrição, sem esperar os
 * cortes: tudo o que ela precisa é a transcrição. E roda de novo no agendar,
 * para a Vera revisar os dias que ganharam corte depois.
 *
 * Cada passo é idempotente e engole a própria falha, então rodar duas vezes
 * só completa o que faltou. Mas rodar duas vezes AO MESMO TEMPO duplicaria
 * posts (a checagem "dia já escrito" é feita antes de escrever), por isso o
 * tranco no run: uma esteira por vídeo por vez, com prazo de 10 minutos para
 * o caso de a função morrer sem soltar.
 */
export async function completarEsteiraDoVideo(videoJobId: string): Promise<{
  pesquisou: boolean;
  escritos: number;
  revisados: number;
}> {
  const video = await prisma.videoJob.findUnique({
    where: { id: videoJobId },
    select: { radar: true, projectId: true },
  });
  if (!video) return { pesquisou: false, escritos: 0, revisados: 0 };

  const tomou = await tomarEsteira(video.projectId, videoJobId);
  if (!tomou) {
    console.log(`[esteira][${videoJobId}] já tem uma esteira rodando; esta sai.`);
    return { pesquisou: Boolean(video.radar), escritos: 0, revisados: 0 };
  }

  try {
    let pesquisou = Boolean(video.radar);
    if (!pesquisou) {
      pesquisou = Boolean(
        await pesquisarDoVideo(videoJobId).catch((e) => {
          console.error(`[esteira][${videoJobId}] radar falhou:`, e);
          return null;
        })
      );
    }
    // O card do Roberto existe mesmo sem pesquisa (fica "pesquisando"), para o
    // quadro mostrar quem está trabalhando e não um buraco na segunda.
    await gravarCardDoRadar(videoJobId).catch((e) =>
      console.error(`[esteira][${videoJobId}] card do radar falhou:`, e)
    );

    const { escritos } = await escreverSemanaDoVideo(videoJobId).catch((e) => {
      console.error(`[esteira][${videoJobId}] redação da semana falhou:`, e);
      return { escritos: 0, falhas: 0 };
    });
    await sincronizarQuadroDoVideo(videoJobId).catch((e) =>
      console.error(`[esteira][${videoJobId}] sincronizar falhou:`, e)
    );
    const revisados = await revisarDiasDoVideo(videoJobId).catch((e) => {
      console.error(`[esteira][${videoJobId}] vera falhou:`, e);
      return 0;
    });
    return { pesquisou, escritos, revisados };
  } finally {
    await soltarEsteira(video.projectId, videoJobId);
  }
}

/**
 * Toma a esteira do vídeo: grava `esteiraDesde` no config do run, só se não
 * há outra em andamento (ou se a outra passou de 10 minutos, que é mais do
 * que qualquer esteira leva e significa função morta). Atômico no banco, que
 * é o único lugar que duas funções da Vercel compartilham.
 *
 * Sem run ainda (o quadro não foi aberto) não há o que escrever, e a esteira
 * segue livre: `escreverSemanaDoVideo` devolve zero sozinha.
 */
async function tomarEsteira(projectId: string, videoJobId: string): Promise<boolean> {
  const run = await prisma.pipelineRun.findFirst({
    where: { projectId, archived: false, config: { path: ["videoJobId"], equals: videoJobId } },
    select: { id: true },
  });
  if (!run) return true;
  const agora = new Date().toISOString();
  const tomados = await prisma.$executeRaw`
    UPDATE pipeline_runs
    SET config = COALESCE(config, '{}'::jsonb) || jsonb_build_object('esteiraDesde', ${agora}::text)
    WHERE id = ${run.id}
      AND (
        config->>'esteiraDesde' IS NULL
        OR (config->>'esteiraDesde')::timestamptz < now() - interval '10 minutes'
      )`;
  return tomados > 0;
}

async function soltarEsteira(projectId: string, videoJobId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE pipeline_runs
    SET config = config - 'esteiraDesde'
    WHERE "projectId" = ${projectId}
      AND archived = false
      AND config->>'videoJobId' = ${videoJobId}`.catch((e) =>
    console.error(`[esteira][${videoJobId}] soltar falhou:`, e)
  );
}
