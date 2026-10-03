import { prisma } from "@/lib/db/prisma";
import { sincronizarMetricas } from "@/lib/analytics/sincronizar";
import { MARCOS_DA_MEDICAO_H } from "@/lib/analytics/fontes-da-leitura";

/**
 * A MEDIÇÃO PERIÓDICA (01/10), no cron de publicação que já existe
 * (app/api/cron/pipeline, a cada 5 minutos): nenhum cron novo.
 *
 * Cada post publicado é lido nos marcos de MARCOS_DA_MEDICAO_H (2 h, 24 h,
 * 3 dias, 7 dias e 30 dias depois de ir ao ar). Um post está "vencido" quando
 * passou de um marco e não há tentativa de leitura (qualquer fonte, deu certo
 * ou não) depois dele. A tentativa que não trouxe número grava uma linha
 * "pendente", e é isso que impede de perguntar de novo a cada 5 minutos.
 *
 * A camada paga (perfil público pela Apify) só entra a partir do marco de
 * 24 h: duas horas depois de publicar, o Blotato e as APIs oficiais dizem se o
 * post "pegou"; o perfil público uma vez por dia basta, e ainda passa pela
 * trava de 20 h por perfil e pelo teto do mês em fonte-apify.ts.
 */

const HORA = 3600_000;
const JANELA_MS = (MARCOS_DA_MEDICAO_H[MARCOS_DA_MEDICAO_H.length - 1] + 24) * HORA;

/** O marco mais recente que o post já passou, em horas (null se nenhum). */
export function marcoAtual(publicadoEm: Date, agora: Date): number | null {
  const idadeH = (agora.getTime() - publicadoEm.getTime()) / HORA;
  let marco: number | null = null;
  for (const m of MARCOS_DA_MEDICAO_H) if (idadeH >= m) marco = m;
  return marco;
}

export async function medirPostsVencidos(opcoes: { orcamentoMs?: number; maxProjetos?: number } = {}) {
  const inicio = Date.now();
  const orcamento = opcoes.orcamentoMs ?? 90_000;
  const agora = new Date();
  const posts = await prisma.post.findMany({
    where: { publishedAt: { gte: new Date(agora.getTime() - JANELA_MS) } },
    select: { id: true, projectId: true, publishedAt: true },
  });
  if (!posts.length) return { vencidos: 0, medidos: 0, projetos: 0, custoUsd: 0 };

  // A última TENTATIVA (criadoEm), não o lidoEm: a foto do Blotato chega com a
  // hora em que ELE leu, que pode ser anterior ao marco.
  const ultimas = await prisma.leituraDeMetrica.groupBy({
    by: ["postId"],
    where: { postId: { in: posts.map((p) => p.id) } },
    _max: { criadoEm: true },
  });
  const ultimaDe = new Map(ultimas.map((u) => [u.postId, u._max.criadoEm]));

  const porProjeto = new Map<string, { ids: string[]; maiorMarco: number; maisAntigo: number }>();
  for (const p of posts) {
    const marco = marcoAtual(p.publishedAt!, agora);
    if (marco === null) continue;
    const instanteDoMarco = p.publishedAt!.getTime() + marco * HORA;
    const ultima = ultimaDe.get(p.id);
    if (ultima && ultima.getTime() >= instanteDoMarco) continue;
    const g = porProjeto.get(p.projectId) ?? { ids: [], maiorMarco: 0, maisAntigo: Infinity };
    g.ids.push(p.id);
    g.maiorMarco = Math.max(g.maiorMarco, marco);
    g.maisAntigo = Math.min(g.maisAntigo, instanteDoMarco);
    porProjeto.set(p.projectId, g);
  }

  // O projeto que espera há mais tempo vai primeiro.
  const fila = [...porProjeto.entries()].sort((a, b) => a[1].maisAntigo - b[1].maisAntigo).slice(0, opcoes.maxProjetos ?? 6);
  let medidos = 0;
  let custoUsd = 0;
  let projetos = 0;
  for (const [projectId, g] of fila) {
    if (Date.now() - inicio > orcamento) break;
    try {
      const r = await sincronizarMetricas(projectId, { postIds: g.ids.slice(0, 60), usarApify: g.maiorMarco >= 24 });
      medidos += r.synced;
      custoUsd += r.custoUsd;
      projetos++;
    } catch (e) {
      // Um projeto que falha não segura os outros; o vencido continua vencido
      // e volta na próxima passada.
      console.error(`[metricas] medição do projeto ${projectId} falhou:`, e instanceof Error ? e.message : e);
    }
  }
  const vencidos = [...porProjeto.values()].reduce((s, g) => s + g.ids.length, 0);
  return { vencidos, medidos, projetos, custoUsd: Math.round(custoUsd * 10000) / 10000 };
}
