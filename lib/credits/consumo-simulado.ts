import { prisma } from "@/lib/db/prisma";
import { creditosDaNota } from "@/lib/credits/nota-simulada";

export { creditosDaNota };

/**
 * O CONSUMO SIMULADO DA CONTA ADMIN (03/10, pedido do Bruno).
 *
 * Admin é acesso interno: `debitar` grava a linha com valor ZERO e o custo na
 * nota ("Acesso interno: custaria 440 créditos"), e o saldo fica parado (o do
 * Bruno, em 34.487). Ele quer ver o consumo real para calibrar a plataforma,
 * sem passar a descontar de verdade: isso só com a decisão dele.
 *
 * Aqui se soma o que as notas dizem, no ciclo, e nada se cobra. As cortesias
 * ("Sem cobrança (motivo): custaria N") ficam de fora de propósito: não são o
 * consumo da conta, são presente para outra pessoa.
 */
export type ConsumoSimulado = {
  total: number;
  desde: string;
  porOperacao: Array<{ operacao: string; creditos: number }>;
};

export async function consumoSimulado(userId: string, desde: Date): Promise<ConsumoSimulado> {
  const linhas = await prisma.creditTransaction.findMany({
    where: { userId, amount: 0, createdAt: { gte: desde }, note: { contains: "Acesso interno: custaria" } },
    select: { operation: true, note: true },
  });
  const porOperacao = new Map<string, number>();
  let total = 0;
  for (const l of linhas) {
    const n = creditosDaNota(l.note);
    if (!n) continue;
    total += n;
    porOperacao.set(l.operation, (porOperacao.get(l.operation) ?? 0) + n);
  }
  return {
    total,
    desde: desde.toISOString(),
    porOperacao: [...porOperacao.entries()]
      .map(([operacao, creditos]) => ({ operacao, creditos }))
      .sort((a, b) => b.creditos - a.creditos),
  };
}
