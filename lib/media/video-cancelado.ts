import { prisma } from "@/lib/db/prisma";
import { STATUS_CANCELADO } from "@/lib/media/cancelamento";

/**
 * O vídeo foi cancelado pelo cliente (05/10)? Lido pelos callbacks do worker
 * antes de gravar qualquer resultado: o worker não tem botão de parar, então o
 * que ele terminou depois do cancelamento chega aqui e vai para o lixo.
 */
export async function videoCancelado(videoJobId: string): Promise<boolean> {
  const v = await prisma.videoJob.findUnique({ where: { id: videoJobId }, select: { status: true } });
  return v?.status === STATUS_CANCELADO;
}
