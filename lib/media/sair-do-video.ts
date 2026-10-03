import { podeUsarProjeto } from "@/lib/equipe/conta";
import { prisma } from "@/lib/db/prisma";
import { creditarVideo, jaCreditado as jaEstornado, custoDoVideo } from "@/lib/credits/video";
import type { QualidadeDoVideo } from "@/lib/credits/video-tabela";

/**
 * A SAIDA: publicar o dia como IMAGEM quando o video nao vem.
 *
 * Pedido do Bruno em 21/09, depois de passar o dia com uma peca presa: "o
 * usuario fica sem opcao e sem saber o que esta acontecendo, o porque nao tem
 * video, o que ele tem que fazer".
 *
 * Ele estava certo nas tres partes, e esta e a que faltava: a OPCAO. O aviso
 * na peca ja diz o que houve; o que nao existia era um caminho para a frente
 * sem esperar o fornecedor. A peca ficava como `video` sem video, e a guarda do
 * publicador (certa) barrava a publicacao. Fim da linha.
 *
 * **E o quadro nao e um consolo.** A esteira ja desenha uma peca de feed
 * inteira para servir de abertura do video: manchete em portugues, colagem,
 * formato de cada rede. Quando o saldo de video acaba ANTES de gerar, o dia ja
 * sai como imagem por esse mesmo motivo (executar.ts, desde 19/09). O que
 * faltava era oferecer a mesma saida DEPOIS, quando o video foi tentado e nao
 * veio.
 *
 * A operacao inteira, e ela precisa ser inteira para nao deixar dinheiro no
 * chao nem trabalho fantasma na fila:
 *
 *   1. as pecas do dia viram `image` (o quadro ja esta em `imageUrl`);
 *   2. o trabalho de video sai da fila, senao ele acorda depois e entrega um
 *      mp4 para um dia que o cliente ja resolveu publicar como imagem;
 *   3. os creditos de video voltam, uma vez so, pela mesma referencia que o
 *      estorno da falha usa;
 *   4. o aviso de video sai da peca, porque ele deixou de ser verdade.
 */

export interface ResultadoDaSaida {
  pecas: number;
  trabalhosCancelados: number;
  creditosDevolvidos: number;
}

export type FalhaAoSair =
  | { erro: "nao_encontrado" }
  | { erro: "sem_video_no_dia" }
  | { erro: "sem_quadro" };

/**
 * Troca as pecas de video de um dia por imagem, e desfaz o que o video tinha
 * reservado.
 *
 * `runId` e `dayOfWeek` identificam o dia, que e como a esteira agrupa as
 * pecas: o mp4 (ou o quadro) e o mesmo para as quatro redes.
 */
export async function publicarDiaComoImagem(args: {
  runId: string;
  dayOfWeek: number;
  userId: string;
}): Promise<{ ok: true } & ResultadoDaSaida | ({ ok: false } & FalhaAoSair)> {
  const posts = await prisma.post.findMany({
    where: { runId: args.runId, dayOfWeek: args.dayOfWeek },
    select: { id: true, mediaType: true, imageUrl: true, metadata: true, projectId: true, project: { select: { userId: true } } },
  });
  if (posts.length === 0) return { ok: false, erro: "nao_encontrado" };
  if (!(await podeUsarProjeto(args.userId, { id: posts[0].projectId, userId: posts[0].project.userId }))) return { ok: false, erro: "nao_encontrado" };

  const deVideo = posts.filter((p) => p.mediaType === "video");
  if (deVideo.length === 0) return { ok: false, erro: "sem_video_no_dia" };

  /**
   * SEM QUADRO NAO HA SAIDA, e dizer isso e melhor do que publicar vazio.
   *
   * O quadro chega em `imageUrl` como data URL ou link do Blob. Se a peca
   * estiver sem nada (o dia falhou antes da Diana), trocar o tipo entregaria
   * um post de imagem sem imagem, que a guarda do Instagram barra depois.
   */
  const comQuadro = deVideo.filter((p) => {
    const u = p.imageUrl ?? "";
    return u.length > 20 && !/\.(mp4|webm)(\?|$)/i.test(u) && !u.startsWith("data:video");
  });
  if (comQuadro.length === 0) return { ok: false, erro: "sem_quadro" };

  // 1. As pecas viram imagem, e o aviso de video sai junto.
  for (const p of comQuadro) {
    const meta = (p.metadata as Record<string, unknown> | null) ?? {};
    const { videoFalhou: _fora, ...limpo } = meta;
    void _fora;
    await prisma.post.update({
      where: { id: p.id },
      data: { mediaType: "image", metadata: limpo as never },
    });
  }

  // 2. O trabalho de video sai da fila. `cancelado` e estado final: a
  //    retomada de dez minutos so olha `pausado`, entao ele nao acorda mais.
  const { count: trabalhosCancelados } = await prisma.trabalho.updateMany({
    where: {
      grupo: { contains: args.runId },
      tipo: { startsWith: "video-ia" },
      status: { in: ["pendente", "pausado"] },
    },
    data: { status: "cancelado" },
  });

  // 3. O credito volta, uma vez so. A referencia e a mesma do debito da
  //    cadeia (`referenciaDoPedido`), que e o postId do primeiro post do dia.
  let creditosDevolvidos = 0;
  const cobranca = await prisma.creditTransaction.findFirst({
    where: { operation: "video_ia", refId: { in: posts.map((p) => p.id) }, amount: { lt: 0 } },
    select: { amount: true, refId: true },
  });
  if (cobranca?.refId && !(await jaEstornado("estorno_video_ia", cobranca.refId))) {
    const quantidade = Math.abs(Number(cobranca.amount));
    if (quantidade > 0) {
      await creditarVideo({
        userId: args.userId,
        quantidade,
        operation: "estorno_video_ia",
        refId: cobranca.refId,
        note: "Estorno: o dia foi publicado como imagem em vez de vídeo, a seu pedido.",
      }).catch(() => {});
      creditosDevolvidos = quantidade;
    }
  }

  return { ok: true, pecas: comQuadro.length, trabalhosCancelados, creditosDevolvidos };
}

/** O custo que teria sido cobrado, para a tela dizer o que volta. */
export function creditosDoVideo(segundos: number, qualidade: QualidadeDoVideo): number {
  return custoDoVideo(segundos, qualidade);
}
