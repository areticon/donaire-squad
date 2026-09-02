import { prisma } from "@/lib/db/prisma";
import { pesquisarDoVideo, gravarCardDoRadar } from "@/lib/media/radar-do-video";
import { escreverSemanaDoVideo } from "@/lib/media/pecas-da-semana";
import { revisarDiasDoVideo } from "@/lib/media/vera-do-video";
import { sincronizarQuadroDoVideo } from "@/lib/media/sincronizar-quadro";

/**
 * A parte LENTA da esteira do vídeo, que roda depois da resposta do agendar,
 * na ordem da campanha de texto: Roberto pesquisa (se ainda não pesquisou),
 * os redatores escrevem a semana que o cliente escolheu, o quadro ganha Vera
 * e Paulo em cada dia com conteúdo, e a Vera revisa.
 *
 * Cada passo é idempotente e engole a própria falha, então rodar duas vezes
 * só completa o que faltou: é o que o piloto faz ao reabrir a tela.
 */
export async function completarEsteiraDoVideo(videoJobId: string): Promise<{
  pesquisou: boolean;
  escritos: number;
  revisados: number;
}> {
  const video = await prisma.videoJob.findUnique({ where: { id: videoJobId }, select: { radar: true } });
  let pesquisou = Boolean(video?.radar);
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
}
