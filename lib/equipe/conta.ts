import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { fraseDosCreditosDaEquipe } from "@/lib/equipe/regras";

/**
 * A CONTA QUE PAGA, a partir de quem fez a ação (01/10/2026, acesso de equipe).
 *
 * Até aqui cada login era uma conta: o `userId` da sessão era ao mesmo tempo
 * quem fazia e quem pagava. Com a equipe, o vendedor (membro) faz e o dono
 * paga: créditos, carteira de vídeo, gravações do mês, plano, limites. Este
 * módulo é o único lugar que responde "quem paga por este userId", e quem cobra
 * (lib/credits, lib/limites-do-plano, lib/plano-do-usuario) pergunta aqui em vez
 * de usar o `userId` direto. Assim as rotas continuam passando "quem fez", e o
 * dinheiro sai sempre da conta certa, inclusive em caminhos que ninguém lembrou
 * de mudar.
 *
 * DUAS INVARIANTES que o convite garante (lib/equipe/convites.ts) e que deixam
 * este módulo simples:
 * 1. um membro ATIVO não tem plano nem projetos próprios (o aceite recusa quem
 *    tem), então "o projeto é dele" sempre quer dizer "ele é o dono";
 * 2. uma pessoa é membro ativo de uma equipe só (índice único parcial no banco).
 */

type Leitor = typeof prisma | Prisma.TransactionClient;

export type MembroDaConta = {
  id: string;
  donoId: string;
  status: string;
  tetoGravacoes: number | null;
  tetoCreditos: number | null;
  todosOsProjetos: boolean;
};

const CAMPOS = {
  id: true,
  donoId: true,
  status: true,
  tetoGravacoes: true,
  tetoCreditos: true,
  todosOsProjetos: true,
} as const;

/** A participação ATIVA desta pessoa numa equipe, ou null. */
export async function membroAtivo(userId: string, db: Leitor = prisma): Promise<MembroDaConta | null> {
  return db.membroDaEquipe.findFirst({ where: { userId, status: "ativo" }, select: CAMPOS });
}

/**
 * O NOME DO DONO como a equipe o conhece (01/10, acabamento): é ele que vai nas
 * frases do membro ("Peça a Matheus para adicionar mais"). Sem nome, o e-mail.
 */
export async function nomeDoDono(donoId: string, db: Leitor = prisma): Promise<string | null> {
  const u = await db.user.findUnique({ where: { id: donoId }, select: { name: true, email: true } });
  return u ? u.name?.trim() || u.email : null;
}

/** Se esta pessoa é membro ativo: de quem é a conta e o nome do dono. */
export async function equipeDe(userId: string, db: Leitor = prisma): Promise<{ donoId: string; dono: string } | null> {
  const m = await membroAtivo(userId, db);
  if (!m) return null;
  return { donoId: m.donoId, dono: (await nomeDoDono(m.donoId, db)) ?? "quem administra a conta" };
}

/**
 * A frase de saldo para quem é membro, ou null para quem é dono (que segue com
 * a frase de compra de sempre). Para as rotas que recusam por saldo ANTES de
 * chamar o débito, onde o erro de lib/credits não chega.
 */
export async function fraseDeSaldoDoMembro(userId: string, conta?: { necessario: number; disponivel: number }): Promise<string | null> {
  const e = await equipeDe(userId);
  return e ? fraseDosCreditosDaEquipe(e.dono, conta) : null;
}

/**
 * De quem é o PLANO que vale para esta pessoa: o do dono, se ela é membro
 * ativo; senão o dela. Para plano, limites, faixa do topo e portão de entrada.
 */
export async function contaDoPlano(userId: string, db: Leitor = prisma): Promise<string> {
  return (await membroAtivo(userId, db))?.donoId ?? userId;
}

export type ContaPagante = {
  /** Quem paga: o `userId` das linhas do extrato e o dono do saldo. */
  contaId: string;
  /** Quem fez, quando não foi o dono. Vai para `credit_transactions.autorId`. */
  autorId: string | null;
  /** A participação que liga as duas, com os tetos do membro. */
  membro: MembroDaConta | null;
};

/**
 * Quem PAGA o que esta pessoa faz. Para débito, estorno e marca de gravação.
 *
 * Membro REMOVIDO continua pagando pelo dono, mas só enquanto a pessoa não tem
 * plano próprio: o que ela começou antes da remoção (uma edição na fila, um
 * gêmeo sendo gerado) termina e é cobrado de quem pediu o trabalho, e não falha
 * no meio por falta de saldo numa conta vazia. Novas ações ela não consegue
 * mais, porque perdeu o acesso aos projetos. Se um dia ela assinar o próprio
 * plano, passa a pagar o próprio gasto.
 */
export async function contaPagante(userId: string, db: Leitor = prisma): Promise<ContaPagante> {
  const ativo = await membroAtivo(userId, db);
  if (ativo) return { contaId: ativo.donoId, autorId: userId, membro: ativo };

  const removido = await db.membroDaEquipe.findFirst({
    where: { userId, status: "removido" },
    orderBy: { removidoEm: "desc" },
    select: CAMPOS,
  });
  if (removido) {
    const eu = await db.user.findUnique({ where: { id: userId }, select: { plan: true, role: true } });
    if (eu && eu.role !== "admin" && (!eu.plan || eu.plan === "free")) {
      return { contaId: removido.donoId, autorId: userId, membro: removido };
    }
  }
  return { contaId: userId, autorId: null, membro: null };
}

/**
 * OS PROJETOS QUE ESTA PESSOA VÊ, como filtro do Prisma (síncrono, sem
 * consulta). Os dela (dono) e os que um dono liberou para ela (membro ativo),
 * um a um ou "todos".
 *
 * Use no lugar de `{ userId }` em toda consulta de projeto, e no lugar de
 * `project: { userId }` em toda consulta de algo que pertence a um projeto.
 */
export function projetoVisivel(userId: string): Prisma.ProjectWhereInput {
  return {
    OR: [
      { userId },
      { acessosDeEquipe: { some: { membro: { userId, status: "ativo" } } } },
      { user: { equipe: { some: { userId, status: "ativo", todosOsProjetos: true } } } },
    ],
  };
}

/**
 * Esta pessoa pode ver e usar este projeto? O dono responde sem consulta, que
 * é o caminho de quase toda requisição; o membro custa uma consulta.
 */
export async function podeUsarProjeto(
  userId: string,
  projeto: { id: string; userId: string } | null | undefined
): Promise<boolean> {
  if (!projeto) return false;
  if (projeto.userId === userId) return true;
  const m = await prisma.membroDaEquipe.findFirst({
    where: {
      userId,
      status: "ativo",
      donoId: projeto.userId,
      OR: [{ todosOsProjetos: true }, { projetos: { some: { projectId: projeto.id } } }],
    },
    select: { id: true },
  });
  return Boolean(m);
}

/** Atalho para quando só se tem os dois ids. */
export async function podeUsarProjetoPorId(userId: string, projectId: string): Promise<boolean> {
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, userId: true } });
  return podeUsarProjeto(userId, p);
}

/**
 * QUANTO ESTE MEMBRO JÁ GASTOU no ciclo da conta, lido do extrato do dono.
 * Créditos: o que saiu menos o que voltou em estorno, só da carteira do plano.
 * Gravações: as marcas de gravação que ele registrou.
 */
export async function consumoDoMembro(
  contaId: string,
  autorId: string,
  desde: Date,
  db: Leitor = prisma
): Promise<{ creditos: number; gravacoes: number }> {
  const [soma, gravacoes] = await Promise.all([
    db.creditTransaction.aggregate({
      where: { userId: contaId, autorId, carteira: "plano", createdAt: { gte: desde } },
      _sum: { amount: true },
    }),
    db.creditTransaction.count({
      where: { userId: contaId, autorId, operation: "gravacao_enviada", createdAt: { gte: desde } },
    }),
  ]);
  return { creditos: Math.max(0, -(soma._sum.amount ?? 0)), gravacoes };
}
