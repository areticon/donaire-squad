import { prisma } from "@/lib/db/prisma";

/**
 * A CONCESSÃO DO CICLO, uma vez só por ciclo (05/10).
 *
 * ## O defeito que este módulo fecha
 *
 * Na ativação da conta de teste do Bruno (plano Autoridade pelo Stripe, cupom
 * de 100%, 05/10 01:17), o extrato ganhou "renovacao" duas vezes e
 * "plano_video" duas vezes no mesmo segundo, e a carteira de vídeo foi a
 * 16.640 em vez de 8.320. Três caminhos chamam `aplicarPlanoDaAssinatura` ao
 * mesmo tempo de propósito (a volta do checkout em /billing/confirmar, o
 * `checkout.session.completed` e o `customer.subscription.created`), porque a
 * ordem de chegada não é garantida. O guarda de ciclo era LER e DEPOIS
 * ESCREVER, fora de transação: os dois leram `creditsResetAt` vazio, os dois
 * passaram. A reposição do plano escreve um valor fixo (o dano foi só a linha
 * duplicada), mas a do vídeo completava "até a cota" lendo o saldo ANTES, e as
 * duas leram zero: 8.320 + 8.320.
 *
 * ## A regra
 *
 * Plano e vídeo do ciclo são concedidos NA MESMA TRANSAÇÃO, sob uma trava de
 * conselho por usuário (`pg_advisory_xact_lock`, que vale no pooler em modo
 * transação porque solta no fim da transação). Dentro da trava, de novo:
 *
 *   1. a CHAVE do ciclo (`refId` da linha "renovacao") já existe? Então este
 *      ciclo já foi dado e nada acontece;
 *   2. `creditsResetAt` já é igual ou posterior a `desde`? Mesmo resultado.
 *
 * Quem chegar em segundo espera a trava, lê o que o primeiro gravou e sai sem
 * conceder. O saldo de vídeo é lido DENTRO da trava, então "completar até a
 * cota" deixa de somar duas vezes.
 *
 * Nunca mexa no saldo de ciclo fora daqui: quem concede ciclo (Stripe,
 * contrato, cron do anual, régua dos contratos) passa por esta função.
 */
export async function concederCiclo(args: {
  userId: string;
  /** Créditos do plano no ciclo (repõe, não soma). */
  creditos: number;
  /** Cota de vídeo do plano (completa até ela, não soma; 0 para não mexer). */
  cotaDeVideo: number;
  /**
   * O que identifica ESTE ciclo, gravado como `refId`. Ex.: `stripe:<sub>:<início
   * do período>`, `contrato:<id>:ativacao`. Duas chegadas com a mesma chave
   * concedem uma vez só.
   */
  chave: string;
  /**
   * Guarda de data: se a última reposição (`creditsResetAt`) já é igual ou
   * posterior a esta data, o ciclo já foi dado. Ex.: o início do período do
   * Stripe, ou "agora menos 30 dias" no cron.
   */
  desde?: Date | null;
  note: string;
  noteVideo?: string;
}): Promise<{ concedido: boolean; video: number }> {
  const { userId, creditos, cotaDeVideo, chave, desde, note, noteVideo } = args;
  if (creditos <= 0) throw new Error("Créditos do ciclo precisam ser positivos.");

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`select 1 as ok from (select pg_advisory_xact_lock(hashtext(${`ciclo:${userId}`}))) as trava`;

    const jaDado = await tx.creditTransaction.findFirst({
      where: { userId, operation: "renovacao", refId: chave },
      select: { id: true },
    });
    if (jaDado) return { concedido: false, video: 0 };

    const atual = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { creditsResetAt: true, videoCredits: true },
    });
    if (desde && atual.creditsResetAt && atual.creditsResetAt.getTime() >= desde.getTime()) {
      return { concedido: false, video: 0 };
    }

    const u = await tx.user.update({
      where: { id: userId },
      data: { creditsBalance: creditos, creditsResetAt: new Date() },
      select: { creditsBalance: true },
    });
    await tx.creditTransaction.create({
      data: { userId, amount: creditos, operation: "renovacao", refId: chave, balance: u.creditsBalance, note },
    });

    let video = 0;
    const falta = cotaDeVideo - atual.videoCredits;
    if (cotaDeVideo > 0 && falta > 0) {
      const v = await tx.user.update({
        where: { id: userId },
        data: { videoCredits: { increment: falta } },
        select: { videoCredits: true },
      });
      await tx.creditTransaction.create({
        data: {
          userId,
          amount: falta,
          operation: "plano_video",
          carteira: "video",
          refId: chave,
          balance: v.videoCredits,
          note: noteVideo ?? note,
        },
      });
      video = falta;
    }
    return { concedido: true, video };
  });
}
