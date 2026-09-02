import { gerarCarrosselDoVideo } from "@/lib/media/carrossel-do-video";
import { revisarDiasDoVideo } from "@/lib/media/vera-do-video";
import { sincronizarQuadroDoVideo } from "@/lib/media/sincronizar-quadro";

/**
 * A parte LENTA da esteira do vídeo, que roda depois da resposta do agendar:
 * a Diana gera o carrossel (várias imagens), a esteira ganha o sábado, e a
 * Vera revisa cada dia. Nessa ordem, para a Vera já ver o carrossel.
 *
 * Cada passo é idempotente e engole a própria falha, então rodar duas vezes
 * só completa o que faltou.
 */
export async function completarEsteiraDoVideo(videoJobId: string): Promise<{
  carrossel: boolean;
  revisados: number;
}> {
  const carrossel = await gerarCarrosselDoVideo(videoJobId).catch((e) => {
    console.error(`[esteira][${videoJobId}] carrossel falhou:`, e);
    return false;
  });
  await sincronizarQuadroDoVideo(videoJobId).catch((e) =>
    console.error(`[esteira][${videoJobId}] sincronizar falhou:`, e)
  );
  const revisados = await revisarDiasDoVideo(videoJobId).catch((e) => {
    console.error(`[esteira][${videoJobId}] vera falhou:`, e);
    return 0;
  });
  return { carrossel, revisados };
}
