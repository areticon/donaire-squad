import { prisma } from "@/lib/db/prisma";
import { creditar } from "@/lib/credits";
import { contaPagante } from "@/lib/equipe/conta";
import { RecusaDoAdmin, type Admin } from "@/lib/admin/acoes";

/**
 * CONCEDER CRÉDITOS PELO ADMIN (06/10/2026), para qualquer conta.
 *
 * Pedido do Bruno em 06/10, junto com a decisão de o admin passar a debitar
 * como cliente (lib/credits/isencao.ts): sem uma porta para repor saldo, o
 * admin que zerasse ficaria travado. Vale para qualquer usuário, e as regras
 * são as da casa:
 *
 *  - o saldo muda SÓ por `creditar` (lib/credits), que grava o extrato na
 *    mesma transação. Nunca `creditsBalance` direto;
 *  - membro de equipe não tem saldo próprio: o crédito vai para a conta do
 *    DONO (resolvida por `contaPagante`), e o registro diz para quem o admin
 *    pediu e em que conta caiu;
 *  - motivo obrigatório, porque ele vai para o extrato do cliente e para o
 *    registro em `admin_acoes`;
 *  - idempotente contra clique duplo: a tela manda uma `chave` gerada quando
 *    o formulário abre, e o crédito é único por ela (`refId` "concessao:<chave>"
 *    com a trava de `creditar({ unico })`). O segundo clique não soma nada e
 *    não grava um segundo registro;
 *  - crédito concedido NÃO é receita: não passa pelo Stripe, e a receita real
 *    do painel (lib/admin/receita-real.ts) só soma cobrança paga. A operação
 *    `concessao_admin` fica fora do consumo (lib/admin/tipos-do-uso-de-ia.ts).
 *
 * Quem pode: só `role = "admin"`, conferido na rota por `exigirAdmin`, que lê
 * o papel do banco a cada chamada.
 */

export const OPERACAO_DA_CONCESSAO = "concessao_admin";

/** O teto por concessão: erro de digitação não pode virar prejuízo. */
export const MAXIMO_POR_CONCESSAO = 50_000;

type Banco = typeof prisma;

export type ResultadoDaConcessao = {
  duplicado: boolean;
  /** A conta que recebeu (o dono, quando o alvo é membro de equipe). */
  contaId: string;
  contaEmail: string;
  /** Preenchido quando o crédito caiu na conta do dono e não na do alvo. */
  viaDono: string | null;
  saldo: number;
};

export function conferirPedido(quantidade: unknown, motivo: unknown, chave: unknown): { quantidade: number; motivo: string; chave: string } {
  const q = Number(quantidade);
  if (!Number.isInteger(q) || q <= 0) throw new RecusaDoAdmin("Informe um número inteiro de créditos maior que zero.");
  if (q > MAXIMO_POR_CONCESSAO) {
    throw new RecusaDoAdmin(`Concessão acima de ${MAXIMO_POR_CONCESSAO.toLocaleString("pt-BR")} créditos: faça em partes, para o erro de digitação não virar prejuízo.`);
  }
  const m = typeof motivo === "string" ? motivo.trim() : "";
  if (m.length < 3) throw new RecusaDoAdmin("Escreva o motivo: ele aparece no extrato do cliente e no registro do admin.");
  const c = typeof chave === "string" ? chave.trim() : "";
  if (!/^[A-Za-z0-9-]{8,64}$/.test(c)) throw new RecusaDoAdmin("Pedido sem chave válida. Recarregue a ficha e tente de novo.");
  return { quantidade: q, motivo: m.slice(0, 300), chave: c };
}

export async function concederCreditos(
  admin: Admin,
  userId: string,
  pedido: { quantidade: unknown; motivo: unknown; chave: unknown },
  db: Banco = prisma
): Promise<ResultadoDaConcessao> {
  const { quantidade, motivo, chave } = conferirPedido(pedido.quantidade, pedido.motivo, pedido.chave);
  const alvo = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  if (!alvo) throw new RecusaDoAdmin("Conta não encontrada.");

  const { contaId } = await contaPagante(userId, db);
  const conta = contaId === alvo.id ? alvo : await db.user.findUnique({ where: { id: contaId }, select: { id: true, email: true } });
  if (!conta) throw new RecusaDoAdmin("A conta que paga por este usuário não foi encontrada.");
  const viaDono = conta.id !== alvo.id ? conta.email : null;

  const r = await creditar(
    {
      // Em nome da CONTA, e não do membro: creditado em nome do membro, a linha
      // levaria o `autorId` dele e o consumo do mês (consumoDoMembro) leria a
      // concessão como estorno, abrindo o teto que o dono deu a ele.
      userId: conta.id,
      quantidade,
      operation: OPERACAO_DA_CONCESSAO,
      refId: `concessao:${chave}`,
      note: `Concedido pelo admin: ${motivo}${viaDono ? ` (pedido para ${alvo.email}, membro da equipe)` : ""}`,
      unico: true,
      // O registro do admin na MESMA transação do crédito: os dois existem ou
      // nenhum, e o clique duplo (duplicado) não grava um segundo registro.
      junto: async (tx, saldoDepois) => {
        await tx.acaoDeAdmin.create({
          data: {
            adminId: admin.id,
            adminEmail: admin.email,
            alvoId: conta.id,
            alvoEmail: conta.email,
            acao: "conceder_creditos",
            detalhe: {
              quantidade,
              motivo,
              chave,
              saldoDepois,
              ...(viaDono ? { pedidoPara: alvo.email, pedidoParaId: alvo.id } : {}),
              receita: false,
            },
          },
        });
      },
    },
    db
  );
  return { duplicado: r.duplicado, contaId: conta.id, contaEmail: conta.email, viaDono, saldo: r.balance };
}
