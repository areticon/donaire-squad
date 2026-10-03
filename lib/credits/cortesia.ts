import { prisma } from "@/lib/db/prisma";

/**
 * A POLÍTICA DE CRÉDITO QUANDO A PEÇA SAI ERRADA (card 525, decidida em 22/09).
 *
 * A observação do Bruno testando como dono, em 19/09: "se eu fosse um cliente
 * ia estar bem bravo, porque gera muita coisa errada e consome os créditos
 * tudo". Até aqui uma peça entregue ERRADA custava o mesmo que uma certa, e
 * refazê-la custava de novo. O cliente pagava duas vezes pelo nosso defeito.
 *
 * ## A regra, e por que ela é esta
 *
 * **Refazer não cobra quando a peça foi REPROVADA.** Reprovação é a
 * plataforma dizendo, com a própria boca, que aquilo não deveria ter saído
 * assim: ou a revisora reprovou, ou o cliente reprovou no calendário. Cobrar
 * a correção de um defeito reconhecido é vender o conserto do próprio erro.
 *
 * **Refazer cobra quando a peça está viva.** "Não gostei desta" é gosto, e
 * gosto é trabalho novo: o texto é reescrito do zero e a arte é gerada de
 * novo, com custo real de fornecedor em dólar. Dar isso de graça sem limite
 * transformaria o botão numa máquina de queimar margem.
 *
 * ## Por que existe um teto
 *
 * Sem teto, um defeito sistemático (um prompt ruim, um fornecedor fora do ar)
 * vira prejuízo ilimitado, porque cada tentativa é grátis e o custo do
 * fornecedor não é. O teto é POR PROJETO e POR DIA, e quando ele estoura o
 * refazer volta a cobrar, com a frase dizendo o porquê. Defeito que passa de
 * três peças no mesmo dia não é peça errada, é a esteira quebrada, e esse é
 * um problema para consertar e não para estornar.
 *
 * O número é o único aqui que é opinião, e mora sozinho para ser trocado sem
 * mexer na regra.
 */
export const CORTESIAS_POR_DIA = 3;

export type Cortesia = { motivo: string } | null;

/** O que torna uma peça "reprovada" aos olhos desta política. */
export type EstadoDaPeca = {
  /** `status` do post. "rejected" é o cliente reprovando no calendário. */
  status: string;
  /** A revisora reprovou esta peça nesta campanha. */
  reprovadaPelaRevisora: boolean;
};

/**
 * Decide, sem tocar no banco, se este refazer é de cortesia.
 *
 * Puro de propósito: é a regra que a tela precisa mostrar ANTES do clique (o
 * botão diz o custo), e é a mesma que o servidor aplica. Duas contas para a
 * mesma pergunta foi o que fez a janela dizer 688 e o servidor cobrar 1.092.
 */
export function decidirCortesia(peca: EstadoDaPeca, cortesiasHoje: number): Cortesia {
  if (cortesiasHoje >= CORTESIAS_POR_DIA) return null;
  if (peca.status === "rejected") return { motivo: "peça reprovada por você" };
  if (peca.reprovadaPelaRevisora) return { motivo: "peça reprovada na revisão" };
  return null;
}

/** Quantas cortesias este projeto já usou no dia corrente. */
export async function cortesiasDeHoje(projectId: string, agora = new Date()): Promise<number> {
  const inicio = new Date(agora);
  inicio.setHours(0, 0, 0, 0);
  return prisma.creditTransaction.count({
    where: {
      projectId,
      operation: "refazer_peca",
      amount: 0,
      createdAt: { gte: inicio },
      note: { contains: "Sem cobrança" },
    },
  });
}

/**
 * A revisora reprovou esta peça?
 *
 * O parecer dela vive no card da campanha, e o veredito é a palavra REPROVADO
 * no conteúdo. Procura-se pelo par (execução, dia), que é a chave do dia da
 * campanha, porque o parecer é do DIA e não de cada rede: uma reprovação de
 * texto derruba as peças daquele dia juntas.
 */
export async function reprovadaPelaRevisora(post: {
  runId: string | null;
  dayOfWeek: number | null;
}): Promise<boolean> {
  if (!post.runId || post.dayOfWeek === null) return false;
  const card = await prisma.campaignCard.findFirst({
    where: { runId: post.runId, dayOfWeek: post.dayOfWeek, agentId: { contains: "vera" } },
    select: { content: true },
    orderBy: { createdAt: "desc" },
  });
  return /REPROVADO/i.test(card?.content ?? "");
}
