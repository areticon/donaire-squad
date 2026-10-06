import { prisma } from "@/lib/db/prisma";
import { cadastrosDeGente } from "@/lib/admin/painel";
import { eixoDoTempo } from "@/lib/admin/graficos-do-painel";
import { contaEhDaEquipe, operacaoEhRecarga } from "@/lib/admin/tipos-do-uso-de-ia";
import type { ComparacaoDoPainel, Periodo, SerieComparada } from "@/lib/admin/tipos-do-painel";

/**
 * O PERÍODO ANTERIOR, para o painel comparar como o Stripe (06/10).
 *
 * Pedido do Bruno: "quero um painel igual do Stripe". No Stripe cada número
 * vem com a variação contra o período anterior e cada gráfico tem a linha do
 * período anterior tracejada por baixo. Este módulo lê as duas janelas de uma
 * vez (a atual e a anterior do mesmo tamanho, encostadas) e devolve as séries
 * balde a balde, já alinhadas: o dia 1 da janela atual ao lado do dia 1 da
 * anterior.
 *
 * Só leitura, SELECT puro com GROUP BY, nenhum SET (a DATABASE_URL é o pooler
 * em modo transação; ver a memória do pooler). As mesmas definições dos
 * números de cima do painel, para a variação comparar coisa igual com coisa
 * igual:
 *  - custo: tudo o que os fornecedores cobraram, com e sem projeto;
 *  - custo de cliente: projeto de conta fora da equipe (mesma regra única de
 *    contaEhDaEquipe que o resto do painel usa);
 *  - créditos: o extrato líquido de estorno, sem recarga;
 *  - receita: os pagamentos confirmados que quem chama já leu.
 *
 * A janela atual termina AGORA (o dia de hoje ainda está correndo); a anterior
 * termina na meia-noite em que a atual começa. É a mesma conta do Stripe, e a
 * tela diz qual é o período comparado.
 */

const DOLAR = Number(process.env.DOLAR_PARA_REAL ?? "") || 5.4;
const FUSO = "America/Sao_Paulo";
const DIA_SQL = (coluna: string) => `to_char(((${coluna} AT TIME ZONE 'UTC') AT TIME ZONE '${FUSO}')::date, 'YYYY-MM-DD')`;

export function janelaAnterior(dias: Periodo, agora = new Date()) {
  const atual = eixoDoTempo(dias, agora);
  // Um milissegundo antes da meia-noite em que a janela atual começa: o
  // último dia da anterior é o dia de ontem dela.
  const anterior = eixoDoTempo(dias, new Date(atual.desde.getTime() - 1));
  return { atual, anterior, desdeAnterior: anterior.desde, ateAnterior: atual.desde };
}

export async function lerComparacao(
  dias: Periodo,
  agora: Date,
  pagamentos: { atuais: Array<{ quando: string; reais: number }>; anteriores: Array<{ quando: string; reais: number }> }
): Promise<ComparacaoDoPainel> {
  const { atual, anterior, desdeAnterior } = janelaAnterior(dias, agora);
  const n = atual.baldes.length;
  const zeros = () => Array.from({ length: n }, () => 0);
  const serie = (): SerieComparada => ({ atual: zeros(), anterior: zeros() });

  // O balde de um dia "AAAA-MM-DD": em qual janela ele cai, e em que posição.
  const ondeCai = (dia: string): { lado: "atual" | "anterior"; i: number } | null => {
    const a = atual.balde(dia);
    if (a !== undefined) return { lado: "atual", i: a };
    const b = anterior.balde(dia);
    if (b !== undefined) return { lado: "anterior", i: b };
    return null;
  };
  const diaLocal = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: FUSO });

  const [contas, projetos, usos, extrato, cadAtuais, cadAnteriores] = await Promise.all([
    prisma.user.findMany({ select: { id: true, email: true, role: true, contaInterna: true } }),
    prisma.project.findMany({ select: { id: true, userId: true } }),
    prisma.$queryRawUnsafe<Array<{ dia: string; projectId: string | null; usd: number }>>(
      `SELECT ${DIA_SQL('"createdAt"')} AS dia, "projectId", SUM("costUsd")::float8 AS usd
         FROM ai_usage WHERE "createdAt" >= $1 AND "createdAt" < $2 GROUP BY 1, 2`,
      desdeAnterior,
      agora
    ),
    prisma.$queryRawUnsafe<Array<{ dia: string; operation: string; liquido: number }>>(
      `SELECT ${DIA_SQL('"createdAt"')} AS dia, operation, (-SUM(amount))::int AS liquido
         FROM credit_transactions WHERE "createdAt" >= $1 AND "createdAt" < $2 GROUP BY 1, 2`,
      desdeAnterior,
      agora
    ),
    cadastrosDeGente(atual.desde),
    cadastrosDeGente(desdeAnterior, atual.desde),
  ]);

  const equipe = new Set(contas.filter((c) => contaEhDaEquipe(c)).map((c) => c.id));
  const donoDoProjeto = new Map(projetos.map((p) => [p.id, p.userId]));

  const custo = serie();
  const custoDeCliente = serie();
  for (const u of usos) {
    const onde = ondeCai(u.dia);
    if (!onde) continue;
    const reais = Number(u.usd) * DOLAR;
    custo[onde.lado][onde.i] += reais;
    const dono = u.projectId ? donoDoProjeto.get(u.projectId) : undefined;
    if (dono && !equipe.has(dono)) custoDeCliente[onde.lado][onde.i] += reais;
  }

  const creditos = serie();
  for (const e of extrato) {
    if (operacaoEhRecarga(e.operation)) continue;
    const onde = ondeCai(e.dia);
    if (!onde) continue;
    creditos[onde.lado][onde.i] += Number(e.liquido);
  }

  const receita = serie();
  for (const [lado, lista] of [["atual", pagamentos.atuais], ["anterior", pagamentos.anteriores]] as const) {
    for (const p of lista) {
      const onde = ondeCai(diaLocal(new Date(p.quando)));
      if (onde && onde.lado === lado) receita[lado][onde.i] += p.reais;
    }
  }

  const cadastros = serie();
  for (const [lado, lista] of [["atual", cadAtuais], ["anterior", cadAnteriores]] as const) {
    for (const u of lista) {
      const onde = ondeCai(diaLocal(u.createdAt));
      if (onde && onde.lado === lado) cadastros[lado][onde.i]++;
    }
  }

  const primeiro = anterior.baldes[0]?.rotulo ?? "";
  const ultimoDia = new Date(atual.desde.getTime() - 1).toLocaleDateString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit" });

  return {
    baldes: atual.baldes,
    baldesAnteriores: anterior.baldes,
    rotuloAnterior: `${primeiro} a ${ultimoDia}`,
    custo,
    custoDeCliente,
    receita,
    creditos,
    cadastros,
  };
}
