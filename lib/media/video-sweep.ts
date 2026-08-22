import { prisma } from "@/lib/db/prisma";
import {
  TRABALHANDO,
  expirado,
  MORTE,
  type EstadoDeTrabalho,
} from "@/lib/media/video-state";

/**
 * Declara mortos os trabalhos de um projeto que passaram do prazo.
 *
 * Roda na LEITURA, de propósito. Quem morreu por timeout não tem como se
 * declarar morto, então alguém que esteja vivo precisa fazer isso, e quem
 * sempre está vivo é quem abre a tela. Enquanto não existe fila, este é o
 * relógio do sistema.
 *
 * Devolve quantos foram marcados, para o chamador saber se vale reler.
 */
export async function varrerExpirados(projectId: string): Promise<number> {
  const agora = new Date();

  const candidatos = await prisma.videoJob.findMany({
    where: { projectId, status: { in: [...TRABALHANDO] } },
    select: { id: true, status: true, startedAt: true },
  });

  const mortos = candidatos.filter((v) => expirado(v, agora));
  if (!mortos.length) return 0;

  await Promise.all(
    mortos.map((v) =>
      prisma.videoJob.updateMany({
        // O `status` no filtro é a guarda contra corrida: se o trabalho
        // terminou entre a leitura e esta escrita, o update não pega nada em
        // vez de sobrescrever um resultado bom com "falhou".
        where: { id: v.id, status: v.status },
        data: {
          status: "failed",
          startedAt: null,
          error: MORTE[v.status as EstadoDeTrabalho],
        },
      })
    )
  );

  return mortos.length;
}
