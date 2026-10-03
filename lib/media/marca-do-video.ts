import { prisma } from "@/lib/db/prisma";
import { lerFalhaDoVideo, marcaParaAPeca } from "@/lib/media/falha-do-video";
import type { PedidoDeVideoDaFila } from "@/lib/media/video-por-ia";

/**
 * A MARCA DO VÍDEO NA PEÇA: o que a tela diz enquanto o vídeo não chega.
 *
 * Nasceu em duas etapas, no mesmo dia (21/09):
 *
 *   1. de manhã, a falha DEFINITIVA passou a ser escrita na peça, porque o
 *      Bruno reprovou o dia 21 "porque estava sem vídeo" sem ter como saber
 *      que o Veo tinha recusado por cobrança;
 *   2. de noite, ele abriu o card do dia 21 da campanha nova e perguntou
 *      "cadê o vídeo?". O trabalho estava PAUSADO por cota (429), tentando de
 *      novo a cada dez minutos, e a peça não dizia uma palavra: a marca de
 *      falha só era escrita quando o trabalho morria de vez, e pausa por cota
 *      nunca morre. Uma peça pode ficar horas assim, calada, com o quadro no
 *      lugar do clipe.
 *
 * As duas situações escrevem o MESMO campo (`metadata.videoFalhou`), com
 * `aguardando: true` na espera, porque a tela já lê esse campo e porque
 * `limparMarca` já o apaga quando o vídeo chega. Estado que sobrevive ao fato
 * vira mentira; aqui o fato que apaga a marca é o mp4 entrando na peça.
 *
 * Só o que a tela pode mostrar entra na marca. O diagnóstico técnico fica no
 * registro do trabalho da fila, e chega ao Bruno pelo chamado.
 */

/** As peças que este pedido alcança, na ordem de precisão do que ele sabe. */
export function alvosDoPedido(pedido: PedidoDeVideoDaFila) {
  return pedido.postIds?.length
    ? { id: { in: pedido.postIds } }
    : pedido.runId && pedido.dayOfWeek
      ? { runId: pedido.runId, dayOfWeek: pedido.dayOfWeek, mediaType: "video" }
      : pedido.postId
        ? { id: pedido.postId }
        : null;
}

type Marca = ReturnType<typeof marcaParaAPeca> & {
  aguardando?: boolean;
  /** O cliente pediu para refazer, e o vídeo novo está sendo gerado. */
  refazendo?: boolean;
  /** Engasgo do gerador: quando é a próxima tentativa, e qual é ela. */
  proximaEm?: string;
  tentativa?: number;
  de?: number;
};

/**
 * Escreve a marca nas peças do dia e no card da Diana.
 *
 * Um por um, e não `updateMany`: o metadata de cada peça é diferente, e
 * `updateMany` com JSON escreveria o mesmo objeto em todas, apagando o
 * formato, a rede e o primeiro comentário de cada uma.
 */
async function escreverMarca(pedido: PedidoDeVideoDaFila, marca: Marca): Promise<number> {
  const alvos = alvosDoPedido(pedido);
  if (!alvos) return 0;
  const posts = await prisma.post.findMany({ where: alvos, select: { id: true, metadata: true } });
  for (const p of posts) {
    await prisma.post
      .update({
        where: { id: p.id },
        data: { metadata: { ...((p.metadata as Record<string, unknown> | null) ?? {}), videoFalhou: marca } as never },
      })
      .catch(() => {});
  }
  if (pedido.cardId) {
    await prisma.campaignCard
      .findUnique({ where: { id: pedido.cardId }, select: { metadata: true } })
      .then((c) =>
        prisma.campaignCard.update({
          where: { id: pedido.cardId! },
          data: { metadata: { ...((c?.metadata as Record<string, unknown> | null) ?? {}), videoFalhou: marca } as never },
        })
      )
      .catch(() => {});
  }
  return posts.length;
}

/** A falha DEFINITIVA: o trabalho morreu nas tentativas, e o vídeo não vem. */
export async function marcarFalhaNaPeca(pedido: PedidoDeVideoDaFila, erro: unknown): Promise<number> {
  return escreverMarca(pedido, marcaParaAPeca(lerFalhaDoVideo(erro)));
}

/**
 * A ESPERA: o trabalho está pausado esperando o gerador, e vai tentar de novo.
 *
 * A mensagem vem da mesma tradução da falha (o cliente lê o mesmo que leria
 * se o vídeo tivesse morrido por aquele motivo), com uma diferença que a tela
 * mostra: ainda vai tentar. Se o cliente aprovar e agendar assim mesmo, a
 * guarda do publicador continua segurando o post de vídeo sem vídeo.
 */
export async function marcarEsperaNaPeca(
  pedido: PedidoDeVideoDaFila,
  erro: unknown,
  engasgo?: { proximaEm: string; tentativa: number; de: number }
): Promise<number> {
  const base = marcaParaAPeca(lerFalhaDoVideo(erro));
  // No engasgo do gerador a frase é outra: não é a peça, não é o saldo, é o
  // Google, e ele volta em minutos. A tela mostra a hora da próxima tentativa.
  const motivo = engasgo
    ? "O gerador de vídeo do Google teve uma falha do lado dele. Não é problema da sua peça nem do seu saldo."
    : base.motivo;
  return escreverMarca(pedido, { ...base, motivo, aguardando: true, ...(engasgo ?? {}) });
}

/** O vídeo foi pedido de novo e está na fila: a peça diz isso na hora. */
export async function marcarRegeracaoNaPeca(pedido: PedidoDeVideoDaFila): Promise<number> {
  const geracoes = pedido.segundos <= 8 ? 1 : 1 + Math.ceil((pedido.segundos - 9) / 7);
  return escreverMarca(pedido, {
    ...marcaParaAPeca(lerFalhaDoVideo("refazendo")),
    motivo:
      geracoes === 1
        ? "Gerando o vídeo de novo, a seu pedido. Leva de 1 a 5 minutos e ele aparece aqui sozinho."
        : `Gerando o vídeo de novo, a seu pedido: ${geracoes} trechos encadeados, cada um leva de 1 a 5 minutos. Ele aparece aqui sozinho quando o último ficar pronto.`,
    aguardando: true,
    refazendo: true,
  });
}

/** Tira a marca das peças e do card, quando o vídeo finalmente chega. */
export async function limparMarcaDoVideo(pedido: PedidoDeVideoDaFila): Promise<void> {
  const alvos = alvosDoPedido(pedido);
  if (!alvos) return;
  const posts = await prisma.post.findMany({ where: alvos, select: { id: true, metadata: true } });
  for (const p of posts) {
    const meta = (p.metadata as Record<string, unknown> | null) ?? {};
    if (!meta.videoFalhou) continue;
    const { videoFalhou: _fora, ...limpo } = meta;
    void _fora;
    await prisma.post.update({ where: { id: p.id }, data: { metadata: limpo as never } }).catch(() => {});
  }
  if (pedido.cardId) {
    const c = await prisma.campaignCard.findUnique({ where: { id: pedido.cardId }, select: { metadata: true } });
    const meta = (c?.metadata as Record<string, unknown> | null) ?? {};
    if (meta.videoFalhou) {
      const { videoFalhou: _fora, ...limpo } = meta;
      void _fora;
      await prisma.campaignCard.update({ where: { id: pedido.cardId }, data: { metadata: limpo as never } }).catch(() => {});
    }
  }
}
