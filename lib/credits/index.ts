import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { contaPagante, consumoDoMembro, nomeDoDono } from "@/lib/equipe/conta";
import { cicloAtual } from "@/lib/ciclo-de-credito";
import { fraseDoTetoDeCreditos, fraseDosCreditosDaEquipe } from "@/lib/equipe/regras";
import { debitoIsento } from "@/lib/credits/isencao";

/**
 * O banco que as funções de saldo usam. É o `prisma` de sempre; os testes
 * passam um banco em memória com a mesma forma (scripts/testes/creditos-0610).
 */
export type BancoDoSaldo = Pick<typeof prisma, "$transaction">;

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
  /**
   * PREENCHIDO QUANDO QUEM PEDIU É MEMBRO DA EQUIPE (01/10, acabamento). A
   * mensagem já vem com a frase do membro ("Peça a Fulano para adicionar
   * mais"), e quem monta resposta olha este campo para NÃO emendar o convite
   * de compra que faz sentido só para o dono. Membro não vê cobrança.
   */
  equipe: { dono: string } | null = null;

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

/**
 * O TETO DO MEMBRO DA EQUIPE (01/10): a conta tem saldo, mas o dono limitou o
 * quanto este membro gasta por mês. É filha de `SaldoInsuficiente` de
 * propósito: toda rota que já recusa por saldo (402, trabalho que não começa,
 * nada cobrado) recusa por teto do mesmo jeito, sem ninguém lembrar de mudar.
 */
export class TetoDoMembro extends SaldoInsuficiente {
  constructor(necessario: number, readonly usados: number, readonly teto: number) {
    super(necessario, Math.max(0, teto - usados));
    this.message = fraseDoTetoDeCreditos(usados, teto, necessario);
    this.name = "TetoDoMembro";
  }
}

/**
 * Quanto o usuário tem agora. Para membro da equipe, é o saldo da CONTA do
 * dono (01/10): é dele que o próximo trabalho vai sair.
 */
export async function saldo(userId: string): Promise<number> {
  const { contaId } = await contaPagante(userId);
  const u = await prisma.user.findUnique({
    where: { id: contaId },
    select: { creditsBalance: true },
  });
  return u?.creditsBalance ?? 0;
}

/**
 * QUANTO O TETO DESTE MEMBRO AINDA DEIXA GASTAR no ciclo (01/10). Null quando
 * a pessoa não é membro ou não tem teto de créditos. Serve para recusar ANTES
 * um trabalho que é cobrado só depois de entregue (a campanha), em vez de
 * entregar e descobrir o teto na hora de cobrar.
 */
export async function restanteDoTeto(userId: string): Promise<{ restante: number; usados: number; teto: number } | null> {
  const { contaId, autorId, membro } = await contaPagante(userId);
  if (!membro || !autorId || membro.tetoCreditos === null) return null;
  const conta = await prisma.user.findUnique({ where: { id: contaId }, select: { creditsResetAt: true } });
  const { creditos: usados } = await consumoDoMembro(contaId, autorId, cicloAtual(conta?.creditsResetAt ?? null).inicio);
  return { restante: Math.max(0, membro.tetoCreditos - usados), usados, teto: membro.tetoCreditos };
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
  /**
   * CORTESIA: o trabalho acontece e o extrato registra, mas o saldo nao se
   * move. Mesmo tratamento do acesso interno, e pelo mesmo motivo: sumir do
   * extrato e o mesmo que nao ter acontecido, e quando o cliente perguntar
   * "por que refiz e nao cobrou" a resposta precisa estar escrita.
   *
   * Quem decide se e cortesia nao e este modulo: e `lib/credits/cortesia.ts`,
   * que conhece a POLITICA. Aqui so se obedece.
   */
  cortesia?: { motivo: string };
}, db: BancoDoSaldo = prisma): Promise<{ balance: number; txId: string }> {
  const { quantidade, operation, projectId, refId, note, cortesia } = args;
  if (quantidade <= 0) throw new Error("Quantidade a debitar precisa ser positiva.");

  return db.$transaction(async (tx) => {
    // QUEM PAGA (01/10): `args.userId` é quem fez; o saldo debitado é o da
    // conta (o dono, quando quem fez é membro da equipe). Ver lib/equipe/conta.ts.
    const { contaId: userId, autorId, membro } = await contaPagante(args.userId, tx);
    if (cortesia) {
      const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { creditsBalance: true } });
      const t = await tx.creditTransaction.create({
        data: {
          userId,
          autorId,
          projectId,
          amount: 0,
          operation,
          refId,
          balance: u.creditsBalance,
          note: `${note ? `${note}. ` : ""}Sem cobrança (${cortesia.motivo}): custaria ${quantidade} créditos`,
        },
        select: { id: true },
      });
      return { balance: u.creditsBalance, txId: t.id };
    }

    // Admin SEM DÉBITO, só quando ligado por ADMIN_SEM_DEBITO=1 (06/10; antes
    // era sempre). O trabalho acontece e o extrato registra, mas o saldo não se
    // move. Lança linha de valor ZERO em vez de pular a gravação, porque some
    // do extrato é o mesmo que não ter acontecido, e o que a operação custou de
    // verdade continua medido em `ai_usage`. O valor que teria sido cobrado
    // fica na nota. Desligado (o padrão), o admin debita como cliente e, sem
    // saldo, é recusado como cliente. Ver lib/credits/isencao.ts.
    const dono = await tx.user.findUnique({ where: { id: userId }, select: { role: true, creditsBalance: true } });
    if (dono && debitoIsento(dono.role)) {
      const t = await tx.creditTransaction.create({
        data: {
          userId,
          autorId,
          projectId,
          amount: 0,
          operation,
          refId,
          balance: dono.creditsBalance,
          note: `${note ? `${note}. ` : ""}Acesso interno: custaria ${quantidade} créditos`,
        },
        select: { id: true },
      });
      return { balance: dono.creditsBalance, txId: t.id };
    }

    /**
     * O TETO DO MEMBRO (01/10), conferido antes de mexer no saldo. A trava de
     * conselho, só deste membro e só durante a transação, faz dois pedidos
     * simultâneos dele serem conferidos um depois do outro; sem ela os dois
     * leriam o mesmo consumo e passariam juntos do teto.
     */
    if (membro && autorId && membro.tetoCreditos !== null && membro.tetoCreditos !== undefined) {
      await tx.$queryRaw`select 1 as ok from (select pg_advisory_xact_lock(hashtext(${`teto:${autorId}`}))) as trava`;
      const conta = await tx.user.findUnique({ where: { id: userId }, select: { creditsResetAt: true } });
      const ciclo = cicloAtual(conta?.creditsResetAt ?? null);
      const { creditos: usados } = await consumoDoMembro(userId, autorId, ciclo.inicio, tx);
      if (usados + quantidade > membro.tetoCreditos) {
        const teto = new TetoDoMembro(quantidade, usados, membro.tetoCreditos);
        teto.equipe = { dono: (await nomeDoDono(userId, tx)) ?? "quem administra a conta" };
        throw teto;
      }
    }

    // A condição de saldo vive no where: se outra requisição debitou no meio,
    // esta simplesmente não encontra a linha e nada é cobrado duas vezes.
    const atualizados = await tx.user.updateMany({
      where: { id: userId, creditsBalance: { gte: quantidade } },
      data: { creditsBalance: { decrement: quantidade } },
    });

    if (atualizados.count === 0) {
      const disponivel = (await tx.user.findUnique({ where: { id: userId }, select: { creditsBalance: true } }))?.creditsBalance ?? 0;
      const falta = new SaldoInsuficiente(quantidade, disponivel);
      // Membro da equipe não compra crédito (01/10): a frase diz de quem é o
      // saldo e A QUEM pedir, pelo nome, em vez de mandar comprar.
      if (membro) {
        const dono = (await nomeDoDono(userId, tx)) ?? "quem administra a conta";
        falta.message = fraseDosCreditosDaEquipe(dono, { necessario: quantidade, disponivel });
        falta.equipe = { dono };
      }
      throw falta;
    }

    const u = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { creditsBalance: true },
    });

    const t = await tx.creditTransaction.create({
      data: {
        userId,
        autorId,
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
  /**
   * UMA VEZ SÓ POR `operation` + `refId` (06/10). Para o que pode chegar duas
   * vezes: o webhook do Stripe que reenvia a compra de um pacote, o clique
   * duplo na concessão do admin. Uma trava de conselho do Postgres, só desta
   * chave e só durante a transação, faz o segundo pedido esperar o primeiro e
   * já enxergar a linha dele; aí nada é creditado e `duplicado` volta true.
   */
  unico?: boolean;
  /**
   * O que mais precisa ser gravado JUNTO com o crédito, na mesma transação
   * (06/10): o registro do admin na concessão. Roda só quando o crédito
   * acontece (nunca no duplicado), então crédito e registro existem os dois
   * ou nenhum.
   */
  junto?: (tx: Prisma.TransactionClient, saldoDepois: number) => Promise<void>;
}, db: BancoDoSaldo = prisma): Promise<{ balance: number; duplicado: boolean; contaId: string }> {
  const { quantidade, operation, refId, note, unico } = args;
  if (quantidade <= 0) throw new Error("Quantidade a creditar precisa ser positiva.");
  if (unico && !refId) throw new Error("Crédito único precisa de refId.");

  return db.$transaction(async (tx) => {
    // O estorno volta para a conta que pagou, com o membro que fez marcado:
    // é o que faz o consumo dele no mês descontar o que foi devolvido (01/10).
    const { contaId: userId, autorId } = await contaPagante(args.userId, tx);
    if (unico && refId) {
      await tx.$queryRaw`select 1 as ok from (select pg_advisory_xact_lock(hashtext(${`credito:${operation}:${refId}`}))) as trava`;
      const ja = await tx.creditTransaction.findFirst({
        where: { operation, refId, amount: { gt: 0 } },
        select: { id: true },
      });
      if (ja) {
        const atual = await tx.user.findUnique({ where: { id: userId }, select: { creditsBalance: true } });
        return { balance: atual?.creditsBalance ?? 0, duplicado: true, contaId: userId };
      }
    }
    const u = await tx.user.update({
      where: { id: userId },
      data: { creditsBalance: { increment: quantidade } },
      select: { creditsBalance: true },
    });

    await tx.creditTransaction.create({
      data: {
        userId,
        autorId,
        amount: quantidade,
        operation,
        refId,
        balance: u.creditsBalance,
        note,
      },
    });
    if (args.junto) await args.junto(tx, u.creditsBalance);

    return { balance: u.creditsBalance, duplicado: false, contaId: userId };
  });
}

/**
 * LEVA O SALDO A UM VALOR EXATO, com a diferença no extrato (06/10).
 *
 * Para o "reset" de uma conta (scripts/tmp/reset-saldo-admin-0610.mts): a
 * linha grava a DIFERENÇA de verdade (positiva ou negativa), e não o valor
 * novo, para a soma do extrato continuar batendo com o saldo. Uma vez só por
 * `refId`: rodar de novo não mexe em nada e devolve `jaFeito`.
 *
 * Não passa por `debitar` de propósito: o reset é acerto de conta e não
 * consumo, então não pode cair na regra do admin sem débito (que gravaria
 * zero) nem no teto do membro. Vale para a conta indicada, sem resolver dono
 * de equipe: quem reseta escolhe a conta.
 */
export async function redefinirSaldo(args: {
  userId: string;
  saldo: number;
  operation: string;
  refId: string;
  note: string;
}, db: BancoDoSaldo = prisma): Promise<{ antes: number; depois: number; diferenca: number; jaFeito: boolean }> {
  const { userId, saldo, operation, refId, note } = args;
  if (!Number.isInteger(saldo) || saldo < 0) throw new Error("O saldo novo precisa ser um inteiro maior ou igual a zero.");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`select 1 as ok from (select pg_advisory_xact_lock(hashtext(${`saldo:${operation}:${refId}`}))) as trava`;
    const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { creditsBalance: true } });
    const ja = await tx.creditTransaction.findFirst({ where: { userId, operation, refId }, select: { id: true } });
    if (ja) return { antes: u.creditsBalance, depois: u.creditsBalance, diferenca: 0, jaFeito: true };
    const diferenca = saldo - u.creditsBalance;
    await tx.user.update({ where: { id: userId }, data: { creditsBalance: saldo } });
    await tx.creditTransaction.create({
      data: { userId, amount: diferenca, operation, refId, balance: saldo, note },
    });
    return { antes: u.creditsBalance, depois: saldo, diferenca, jaFeito: false };
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
