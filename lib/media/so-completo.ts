import { prisma } from "@/lib/db/prisma";
import { anexarCompletoAoQuadro } from "@/lib/media/completo-no-quadro";
import { abrirQuadroDoVideo } from "@/lib/media/quadro-do-video";
import { apagarMidias } from "@/lib/media/faxina";

/**
 * SÓ O VÍDEO COMPLETO (02/10/2026, pedido do Bruno: o vídeo do gêmeo de 52 s
 * não pede corte nenhum). O roteiro aprovado com zero cortes manda o worker
 * produzir só o completo; aqui mora o que o cortar-callback faz com o aviso:
 *
 *   - o aviso PARCIAL (sem cortes) não muda nada: o vídeo continua "cutting"
 *     até o completo chegar, e nenhuma tela oferece "Escrever os posts" de
 *     cortes que não existem;
 *   - com o completo, o vídeo fica PRONTO, o quadro abre (se ainda não
 *     existia) e recebe o card do completo e o rascunho do YouTube;
 *   - o aviso final sem completo é falha, com o motivo.
 *
 * Devolve o que o callback ainda precisa disparar (capas do completo e a
 * edição); as chamadas ficam com quem chama, porque `after` é da rota.
 */
export async function concluirSoCompleto(
  id: string,
  video: { completoUrl: string | null },
  corpo: { parcial?: boolean; completo?: { url: string; bytes?: number } | null; capaFonte?: { url?: string } | null; erros?: string[] }
): Promise<{ resultado: "esperando o completo" | "falhou" | "pronto"; disparar: boolean }> {
  if (!corpo.completo?.url) {
    if (corpo.parcial) return { resultado: "esperando o completo", disparar: false };
    await prisma.videoJob.update({
      where: { id },
      data: { status: "failed", startedAt: null, error: corpo.erros?.length ? corpo.erros.join("; ").slice(0, 900) : "O vídeo completo não foi produzido." },
    });
    return { resultado: "falhou", disparar: false };
  }
  await prisma.videoJob.update({
    where: { id },
    data: {
      status: "ready",
      startedAt: null,
      attempts: 0,
      error: null,
      finishedAt: new Date(),
      completoUrl: corpo.completo.url,
      completoBytes: corpo.completo.bytes ? BigInt(corpo.completo.bytes) : null,
      capaFonteUrl: corpo.capaFonte?.url ?? null,
    },
  });
  if (video.completoUrl && video.completoUrl !== corpo.completo.url) await apagarMidias([video.completoUrl], `completo/${id}`);
  await abrirQuadroDoVideo(id).catch((e) => console.error(`[so-completo][${id}] quadro falhou:`, e));
  await anexarCompletoAoQuadro(id).catch((e) => console.error(`[so-completo][${id}] completo no quadro falhou:`, e));
  return { resultado: "pronto", disparar: true };
}
