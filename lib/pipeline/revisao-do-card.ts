import { prisma } from "@/lib/db/prisma";

/**
 * "O COMANDO FOI ENTENDIDO E ESTÁ SENDO FEITO", escrito no card.
 *
 * Pedido do Bruno em 21/09: ele pede um ajuste no chat do card, antes de
 * aprovar, e a tela fica igual até a resposta chegar. Refazer uma arte leva
 * até 90 segundos e reescrever os quatro posts do dia leva mais: nesse tempo
 * o cliente não sabe se o pedido chegou, e a única leitura possível é que a
 * plataforma ignorou.
 *
 * O ESTADO VIVE NO CARD, e não na tela que pediu, por dois motivos:
 *
 *   1. quem faz o trabalho pode ser OUTRO card. O pedido de imagem feito no
 *      card do Paulo é atendido no card da Diana (parte do conserto de 18/09),
 *      e é o card da Diana que precisa aparecer em revisão;
 *   2. o calendário inteiro lê do banco. Estado só no componente aberto
 *      deixaria o quadro da semana mudo, que é onde o cliente está olhando.
 *
 * A MARCA TEM PRAZO. A rota do chat é síncrona e pode morrer no teto de tempo
 * da plataforma, e nesse desfecho o `finally` não roda: sem prazo, o card
 * ficaria "em revisão" para sempre, que é a mesma família de defeito que a
 * fila resolve com `ressuscitarMortos`. Marca velha não é lida.
 */

import { lerRevisao, type RevisaoEmAndamento } from "@/lib/pipeline/revisao";

// O formato, o prazo e a leitura vivem em `lib/pipeline/revisao.ts`, sem
// banco, porque a TELA precisa deles e componente cliente nao importa Prisma.
export { lerRevisao, tempoDaRevisao, VALIDADE_MINUTOS, type RevisaoEmAndamento } from "@/lib/pipeline/revisao";

/** Põe o card (e o card de quem vai trabalhar) em revisão. */
export async function marcarEmRevisao(args: {
  cardIds: string[];
  pedido: string;
  porNome: string | null;
  porImagem: string | null;
  agenteId: string;
  agenteNome: string;
}): Promise<void> {
  const revisao: RevisaoEmAndamento = {
    pedido: args.pedido.slice(0, 180),
    porNome: args.porNome,
    porImagem: args.porImagem,
    agenteId: args.agenteId,
    agenteNome: args.agenteNome,
    desde: new Date().toISOString(),
  };
  for (const id of new Set(args.cardIds)) {
    try {
      const card = await prisma.campaignCard.findUnique({ where: { id }, select: { metadata: true } });
      if (!card) continue;
      const metadata = { ...((card.metadata as Record<string, unknown> | null) ?? {}), revisao };
      await prisma.campaignCard.update({ where: { id }, data: { metadata: metadata as never } });
    } catch {
      // Sinal de tela nunca derruba o trabalho que ele está anunciando.
    }
  }
}

/** Tira a marca. Roda no `finally`, para a falha também limpar. */
export async function encerrarRevisao(cardIds: string[]): Promise<void> {
  for (const id of new Set(cardIds)) {
    try {
      const card = await prisma.campaignCard.findUnique({ where: { id }, select: { metadata: true } });
      if (!card) continue;
      const { revisao: _emRevisao, ...resto } = ((card.metadata as Record<string, unknown> | null) ?? {});
      void _emRevisao;
      await prisma.campaignCard.update({ where: { id }, data: { metadata: resto as never } });
    } catch {
      // Idem: a marca tem prazo e some sozinha.
    }
  }
}

/** O nome que a tela mostra para cada agente do squad. */
export const NOME_DO_AGENTE: Record<string, string> = {
  "roberto-radar": "Roberto Radar",
  "lucas-linkedin": "Lucas LinkedIn",
  "tiago-twitter": "Xavier X",
  "xavier-x": "Xavier X",
  "igor-instagram": "Igor Instagram",
  "fernanda-facebook": "Fernanda Facebook",
  "tiago-tiktok": "Tiago TikTok",
  "yan-youtube": "Yan YouTube",
  "diana-design": "Diana Design",
  "vitor-video": "Vitor Vídeo",
  "vera-veredito": "Vera Veredito",
  "paulo-publicador": "Paulo Publicador",
};
