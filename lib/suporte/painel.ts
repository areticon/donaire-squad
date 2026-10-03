import { prisma } from "@/lib/db/prisma";
import { eixoDoTempo } from "@/lib/admin/graficos-do-painel";
import type { DadosNoTempo, Periodo } from "@/lib/admin/tipos-do-painel";
import { contaComoReclamacao } from "@/lib/suporte/regras";

/**
 * OS NÚMEROS DO SUPORTE PARA O PAINEL (02/10/2026): situação da fila,
 * categorias, reclamações e o tempo até a primeira resposta, mais os chamados
 * por dia no padrão gráfico do painel (lib/admin/graficos-do-painel.ts).
 * Só servidor.
 */

const diaEmSP = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export type ResumoDoSuporte = {
  porStatus: { aberto: number; andamento: number; resolvido: number };
  porCategoria: Record<string, number>;
  reclamacoes: number;
  /** Mediana, em horas, da abertura até a primeira resposta, no período. */
  primeiraRespostaHoras: number | null;
  noTempo: DadosNoTempo;
  noPeriodo: number;
};

export async function resumoDoSuporte(dias: Periodo, agora = new Date(), userId?: string | null): Promise<ResumoDoSuporte> {
  const eixo = eixoDoTempo(dias, agora);
  const onde = userId ? { userId } : {};
  const [porStatus, todos, doPeriodo] = await Promise.all([
    prisma.chamado.groupBy({ by: ["status"], where: onde, _count: { _all: true } }),
    prisma.chamado.findMany({ where: onde, select: { categoria: true, reclamacao: true } }),
    prisma.chamado.findMany({
      where: { ...onde, createdAt: { gte: eixo.desde } },
      select: { createdAt: true, categoria: true, reclamacao: true, eventos: { where: { tipo: "resposta" }, orderBy: { createdAt: "asc" }, take: 1, select: { createdAt: true } } },
    }),
  ]);
  const st = { aberto: 0, andamento: 0, resolvido: 0 };
  for (const g of porStatus) if (g.status in st) st[g.status as keyof typeof st] = g._count._all;
  const porCategoria: Record<string, number> = {};
  for (const c of todos) porCategoria[c.categoria] = (porCategoria[c.categoria] ?? 0) + 1;

  const abertos = eixo.baldes.map(() => 0);
  const reclam = eixo.baldes.map(() => 0);
  const horas: number[] = [];
  for (const c of doPeriodo) {
    const b = eixo.balde(diaEmSP(c.createdAt));
    if (b !== undefined) {
      abertos[b] += 1;
      if (contaComoReclamacao(c)) reclam[b] += 1;
    }
    const r = c.eventos[0]?.createdAt;
    if (r) horas.push((r.getTime() - c.createdAt.getTime()) / 3600000);
  }
  horas.sort((a, b) => a - b);
  const mediana = horas.length ? horas[Math.floor(horas.length / 2)] : null;

  return {
    porStatus: st,
    porCategoria,
    reclamacoes: todos.filter(contaComoReclamacao).length,
    primeiraRespostaHoras: mediana,
    noPeriodo: doPeriodo.length,
    noTempo: {
      baldes: eixo.baldes,
      series: [
        { chave: "chamados", nome: "Chamados abertos", cor: "var(--painel-1)", valores: abertos },
        { chave: "reclamacoes", nome: "Dos quais reclamação", cor: "var(--painel-2)", valores: reclam },
      ],
    },
  };
}
