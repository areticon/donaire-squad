export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { debitoIsento } from "@/lib/credits/isencao";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { PLANS } from "@/lib/stripe";
import { membroAtivo, nomeDoDono, projetoVisivel } from "@/lib/equipe/conta";
import { creditosDoCiclo } from "@/lib/equipe/regras";
import { cicloAtual } from "@/lib/ciclo-de-credito";
import { consumoSimulado } from "@/lib/credits/consumo-simulado";

/**
 * Saldo e extrato de créditos.
 *
 * O extrato vem junto do saldo de propósito: saldo sozinho gera a pergunta
 * "onde foi parar", e responder isso por suporte custa mais caro que mostrar.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  /**
   * O CUSTO REAL, e não só o saldo.
   *
   * Pedido do Bruno em 19/09: "meus créditos não mudaram nada, eu não consigo
   * ver o consumo assim para calibrar a plataforma". Ele é admin, e o débito
   * tem bypass para acesso interno: a transação sai com amount 0 e a nota
   * "custaria 195 créditos". O extrato dele é uma fila de zeros.
   *
   * O número que calibra preço não é o crédito, é o DÓLAR que a campanha
   * gastou de verdade. Ele vive em `ai_usage`, por operação e por execução,
   * e é ele que volta aqui: os últimos 30 dias e a última campanha.
   */
  const trintaDias = new Date(Date.now() - 30 * 24 * 3600_000);
  // `ai_usage` é por PROJETO, não por usuário: o custo do dono é a soma dos
  // projetos dele.
  //
  // ACESSO DE EQUIPE (01/10): para o membro, o saldo é o da conta do dono, o
  // extrato é só o que ELE gastou (autorId) e os projetos são os liberados.
  const membro = await membroAtivo(userId);
  const contaId = membro?.donoId ?? userId;
  // O nome do dono vai junto (01/10, acabamento): as telas de cliente trocam o
  // "comprar créditos" por "peça a <dono> para adicionar mais".
  const donoDaEquipe = membro ? await nomeDoDono(membro.donoId) : null;
  const meusProjetos = (
    await prisma.project.findMany({ where: projetoVisivel(userId), select: { id: true } })
  ).map((p) => p.id);

  const [user, extrato, gastoDoMes, ultimaCampanha] = await Promise.all([
    prisma.user.findUnique({
      where: { id: contaId },
      // `videoCredits` entrou em 19/09: o vídeo tem carteira própria, e a tela
      // precisa mostrar as DUAS antes de a campanha rodar. O Bruno descobriu o
      // saldo de vídeo zerado só quando o dia de vídeo saiu sem vídeo.
      select: { creditsBalance: true, videoCredits: true, creditsResetAt: true, plan: true, role: true, acessosExtras: true },
    }),
    prisma.creditTransaction.findMany({
      where: membro ? { userId: contaId, autorId: userId } : { userId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        amount: true,
        operation: true,
        note: true,
        balance: true,
        createdAt: true,
      },
    }),
    prisma.aiUsage.aggregate({
      where: { projectId: { in: meusProjetos }, createdAt: { gte: trintaDias } },
      _sum: { costUsd: true },
      _count: true,
    }),
    prisma.pipelineRun.findFirst({
      where: { project: projetoVisivel(userId) },
      orderBy: { startedAt: "desc" },
      select: { id: true, topic: true, startedAt: true },
    }),
  ]);

  // `costUsd` é Decimal no Prisma: multiplicar Decimal por número quebra o
  // build na Vercel mesmo passando no tsc local (pago em 19/09).
  const DOLAR = 5.4;
  const gastoDeUmaCampanha = ultimaCampanha
    ? await prisma.aiUsage.aggregate({ where: { runId: ultimaCampanha.id }, _sum: { costUsd: true } })
    : null;

  // O CONSUMO SIMULADO (03/10): para admin, o que as linhas de valor zero
  // teriam cobrado no ciclo. Só leitura; o saldo continua sem se mover.
  const simulado =
    user && debitoIsento(user.role) && !membro ? await consumoSimulado(contaId, cicloAtual(user.creditsResetAt ?? null).inicio) : null;

  // Com os acessos extras da equipe somados (2.000 cada, 01/10).
  const doPlano = creditosDoCiclo(PLANS[user?.plan as keyof typeof PLANS]?.credits ?? 0, user?.acessosExtras ?? 0);

  return NextResponse.json({
    saldo: user?.creditsBalance ?? 0,
    saldoDeVideo: user?.videoCredits ?? 0,
    /**
     * A CONTA DEBITA, ou e interna?
     *
     * Admin e acesso interno: o lancamento e gravado com valor zero e o saldo
     * nao se move (ver lib/credits/index.ts). A tela precisa saber disso, senao
     * mostra "cobra 688 creditos" e o saldo parado, e quem olha conclui que a
     * cobranca quebrou. Foi o que aconteceu com o Bruno em 21/09.
     */
    contaInterna: debitoIsento(user?.role),
    /**
     * O que a IA custou de verdade. É o número de calibrar preço, e o único
     * que diz alguma coisa para quem tem bypass de admin.
     */
    consumo: {
      chamadas30d: gastoDoMes._count,
      usd30d: Number(gastoDoMes._sum?.costUsd ?? 0),
      brl30d: Number(gastoDoMes._sum?.costUsd ?? 0) * DOLAR,
      ultimaCampanha: ultimaCampanha
        ? {
            tema: ultimaCampanha.topic,
            quando: ultimaCampanha.startedAt,
            usd: Number(gastoDeUmaCampanha?._sum.costUsd ?? 0),
            brl: Number(gastoDeUmaCampanha?._sum.costUsd ?? 0) * DOLAR,
          }
        : null,
    },
    doPlano,
    resetadoEm: user?.creditsResetAt,
    plano: user?.plan ?? "free",
    // A tela precisa saber que é acesso interno para não desenhar barra de
    // consumo nem oferta de plano para quem não é cobrado.
    admin: user?.role === "admin",
    /** Só admin: o que o ciclo teria cobrado, somado das notas "custaria N". */
    consumoSimulado: simulado,
    /** Membro da equipe: de quem é o saldo. Null para o dono. */
    equipe: membro ? { dono: donoDaEquipe ?? "quem administra a conta" } : null,
    extrato: extrato.map((t) => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
    })),
    /**
     * A última recarga da conta (07/10): a marca do aviso "créditos
     * acabando" e do painel de compra que abre sozinho. Toda recarga traz os
     * dois de volta quando o saldo baixar de novo.
     */
    ultimaRecarga:
      (
        await prisma.creditTransaction
          .findFirst({ where: { userId: contaId, amount: { gt: 0 } }, orderBy: { createdAt: "desc" }, select: { id: true } })
          .catch(() => null)
      )?.id ?? "sem-recarga",
  });
}
