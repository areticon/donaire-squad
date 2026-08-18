import { prisma } from "@/lib/db/prisma";

/**
 * Débito e crédito de saldo, sempre com extrato.
 *
 * Duas regras que valem mais que o código:
 *
 * 1. **Nunca mexa em `creditsBalance` fora daqui.** Saldo sem a linha de
 *    extrato correspondente é dinheiro que some do relatório, e depois ninguém
 *    consegue responder por que o cliente reclamou.
 *
 * 2. **O débito acontece na mesma transação da leitura do saldo.** Sem isso,
 *    duas requisições simultâneas leem o mesmo saldo e as duas debitam, o que
 *    deixa o cliente negativo. O `decrement` do Postgres é atômico, e a
 *    verificação de saldo vai no `where`, então a corrida não existe: ou a
 *    linha bate a condição e debita, ou não bate e falha.
 */

export class SaldoInsuficiente extends Error {
  constructor(
    readonly necessario: number,
    readonly disponivel: number
  ) {
    super(
      `Saldo insuficiente: o trabalho custa ${necessario} créditos e você tem ${disponivel}.`
    );
    this.name = "SaldoInsuficiente";
  }
}

/** Quanto o usuário tem agora. */
export async function saldo(userId: string): Promise<number> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { creditsBalance: true },
  });
  return u?.creditsBalance ?? 0;
}

/**
 * Debita e grava o extrato. Lança `SaldoInsuficiente` sem cobrar nada quando
 * não dá. Use antes de começar o trabalho caro, não depois.
 */
export async function debitar(args: {
  userId: string;
  quantidade: number;
  operation: string;
  projectId?: string;
  refId?: string;
  note?: string;
}): Promise<{ balance: number; txId: string }> {
  const { userId, quantidade, operation, projectId, refId, note } = args;
  if (quantidade <= 0) throw new Error("Quantidade a debitar precisa ser positiva.");

  return prisma.$transaction(async (tx) => {
    // A condição de saldo vive no where: se outra requisição debitou no meio,
    // esta simplesmente não encontra a linha e nada é cobrado duas vezes.
    const atualizados = await tx.user.updateMany({
      where: { id: userId, creditsBalance: { gte: quantidade } },
      data: { creditsBalance: { decrement: quantidade } },
    });

    if (atualizados.count === 0) {
      const disponivel = await saldo(userId);
      throw new SaldoInsuficiente(quantidade, disponivel);
    }

    const u = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { creditsBalance: true },
    });

    const t = await tx.creditTransaction.create({
      data: {
        userId,
        projectId,
        amount: -quantidade,
        operation,
        refId,
        balance: u.creditsBalance,
        note,
      },
      select: { id: true },
    });

    return { balance: u.creditsBalance, txId: t.id };
  });
}

/**
 * Credita: recarga, renovação do plano ou estorno.
 *
 * O estorno importa mais do que parece: quando um trabalho é cobrado e falha
 * depois, devolver é a única resposta defensável, e sem o extrato não dá nem
 * para saber quanto devolver.
 */
export async function creditar(args: {
  userId: string;
  quantidade: number;
  operation: string;
  refId?: string;
  note?: string;
}): Promise<{ balance: number }> {
  const { userId, quantidade, operation, refId, note } = args;
  if (quantidade <= 0) throw new Error("Quantidade a creditar precisa ser positiva.");

  return prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: userId },
      data: { creditsBalance: { increment: quantidade } },
      select: { creditsBalance: true },
    });

    await tx.creditTransaction.create({
      data: {
        userId,
        amount: quantidade,
        operation,
        refId,
        balance: u.creditsBalance,
        note,
      },
    });

    return { balance: u.creditsBalance };
  });
}

/**
 * Repõe o saldo do ciclo. Chamado pelo webhook do Stripe na renovação.
 *
 * Repõe em vez de somar de propósito: crédito de plano não acumula, senão
 * quem usa pouco vira um passivo crescente e a projeção de custo deixa de
 * valer. Recarga avulsa continua somando, por `creditar`.
 */
export async function reporCiclo(args: {
  userId: string;
  creditos: number;
  note?: string;
}): Promise<void> {
  const { userId, creditos, note } = args;
  await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: userId },
      data: { creditsBalance: creditos, creditsResetAt: new Date() },
      select: { creditsBalance: true },
    });
    await tx.creditTransaction.create({
      data: {
        userId,
        amount: creditos,
        operation: "renovacao",
        balance: u.creditsBalance,
        note: note ?? "Reposição do ciclo",
      },
    });
  });
}

/** Já cobramos por este trabalho? Evita cobrar de novo em retentativa. */
export async function jaCobrado(operation: string, refId: string): Promise<boolean> {
  const t = await prisma.creditTransaction.findFirst({
    where: { operation, refId, amount: { lt: 0 } },
    select: { id: true },
  });
  return Boolean(t);
}
