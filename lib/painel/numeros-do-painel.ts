import { membroAtivo, projetoVisivel } from "@/lib/equipe/conta";
import { prisma } from "@/lib/db/prisma";
import { AGENTES } from "@/lib/squad/estado-do-squad";

/**
 * OS NÚMEROS DA TELA INICIAL (28/09).
 *
 * Pedido do Bruno: "a tela inicial deve ter os agentes, os números deles, os
 * projetos, campanhas, posts, redes, com números para análise", e "gráficos ao
 * invés de cards". A tela tinha quatro contadores soltos e duas listas: nada
 * que respondesse "estou crescendo?" ou "qual rede rende?".
 *
 * Tudo em janelas de 30 dias contra os 30 anteriores, porque número sozinho
 * não diz se melhorou. Engajamento é curtida + comentário + compartilhamento,
 * que é o que as redes entregam para todos os posts; alcance só entra quando
 * existe (LinkedIn de página, Instagram com permissão de insights).
 */

const DIA = 24 * 3600_000;

export type NumerosDoPainel = Awaited<ReturnType<typeof numerosDoPainel>>;

export async function numerosDoPainel(userId: string, agora = new Date()) {
  const ha30 = new Date(agora.getTime() - 30 * DIA);
  const ha60 = new Date(agora.getTime() - 60 * DIA);
  const ha90 = new Date(agora.getTime() - 90 * DIA);
  // Os projetos que esta pessoa vê: os dela, ou os que o dono liberou (01/10).
  const doUsuario = { project: projetoVisivel(userId) };
  const membro = await membroAtivo(userId);

  const [publicados90, runs60, cards30, contas, projetos, agendados, creditos30] = await Promise.all([
    prisma.post.findMany({
      // Sem `status: "published"` (01/10): arquivar grava "cancelled", e o
      // Bruno arquivou dois projetos e viu os números sumirem. Ter data de
      // publicação é o fato "foi ao ar", que arquivar não apaga.
      where: { ...doUsuario, publishedAt: { gte: ha90 } },
      select: { id: true, platform: true, publishedAt: true, content: true, projectId: true, externalUrl: true, metrics: true },
    }),
    prisma.pipelineRun.findMany({ where: { ...doUsuario, startedAt: { gte: ha60 } }, select: { startedAt: true, status: true } }),
    prisma.campaignCard.groupBy({ by: ["agentId"], where: { ...doUsuario, createdAt: { gte: ha30 } }, _count: true }),
    prisma.socialAccount.findMany({ where: { project: projetoVisivel(userId), isActive: true }, select: { platform: true } }),
    prisma.project.findMany({ where: projetoVisivel(userId), orderBy: { updatedAt: "desc" }, select: { id: true, name: true, status: true } }),
    prisma.post.groupBy({ by: ["projectId"], where: { ...doUsuario, status: "scheduled", scheduledAt: { gte: agora } }, _count: true }),
    prisma.creditTransaction.findMany({ where: { ...(membro ? { userId: membro.donoId, autorId: userId } : { userId }), createdAt: { gte: ha30 }, amount: { lt: 0 } }, select: { amount: true, carteira: true } }),
  ]);

  const eng = (p: (typeof publicados90)[number]) => {
    const m = p.metrics;
    return m ? m.likes + m.comments + m.shares : 0;
  };
  const dentro = (d: Date | null, de: Date, ate: Date) => Boolean(d && d >= de && d < ate);

  const pub30 = publicados90.filter((p) => dentro(p.publishedAt, ha30, agora));
  const pubAnt = publicados90.filter((p) => dentro(p.publishedAt, ha60, ha30));
  const engajamento30 = pub30.reduce((s, p) => s + eng(p), 0);
  const engajamentoAnt = pubAnt.reduce((s, p) => s + eng(p), 0);
  const alcance30 = pub30.reduce((s, p) => s + (p.metrics?.impressions ?? 0), 0);
  const medidos30 = pub30.filter((p) => p.metrics).length;

  // Posts publicados por semana, empilhados por rede (8 semanas).
  const semanas: Array<{ rotulo: string; porRede: Record<string, number> }> = [];
  for (let i = 7; i >= 0; i--) {
    const fim = new Date(agora.getTime() - i * 7 * DIA);
    const ini = new Date(fim.getTime() - 7 * DIA);
    const porRede: Record<string, number> = {};
    for (const p of publicados90) if (dentro(p.publishedAt, ini, fim)) porRede[p.platform] = (porRede[p.platform] ?? 0) + 1;
    semanas.push({ rotulo: fim.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }), porRede });
  }

  // Engajamento médio por post, por rede (90 dias, só posts medidos).
  const porRedeMap: Record<string, { posts: number; medidos: number; engajamento: number }> = {};
  for (const p of publicados90) {
    const r = (porRedeMap[p.platform] ??= { posts: 0, medidos: 0, engajamento: 0 });
    r.posts++;
    if (p.metrics) {
      r.medidos++;
      r.engajamento += eng(p);
    }
  }
  const porRede = Object.entries(porRedeMap)
    .map(([rede, r]) => ({ rede, ...r, media: r.medidos ? r.engajamento / r.medidos : 0 }))
    .sort((a, b) => b.media - a.media);

  // Os agentes e o que cada um fez nos últimos 30 dias.
  const contagem = new Map(cards30.map((c) => [c.agentId, c._count]));
  const UNIDADE: Record<string, [string, string]> = {
    "roberto-radar": ["pesquisa", "pesquisas"],
    "lucas-linkedin": ["post escrito", "posts escritos"],
    "xavier-x": ["thread", "threads"],
    "igor-instagram": ["legenda", "legendas"],
    "fernanda-facebook": ["post", "posts"],
    "tiago-tiktok": ["legenda", "legendas"],
    "yan-youtube": ["vídeo descrito", "vídeos descritos"],
    "diana-design": ["arte ou vídeo", "artes e vídeos"],
    "vitor-video": ["corte", "cortes"],
    "vera-veredito": ["revisão", "revisões"],
    "paulo-publicador": ["publicado", "publicados"],
  };
  const agentes = AGENTES.map((a) => {
    // O Paulo conta o que foi AO AR, e não os cards que montou.
    // As threads antigas foram gravadas com o id do Tiago, e são do Xavier.
    const n = a.id === "paulo-publicador" ? pub30.length : (contagem.get(a.id) ?? 0) + (a.id === "xavier-x" ? contagem.get("tiago-twitter") ?? 0 : 0);
    const [um, varios] = UNIDADE[a.id] ?? ["peça", "peças"];
    return { id: a.id, nome: a.nome, papel: a.papel, cor: a.cor, numero: n, unidade: n === 1 ? um : varios };
  });

  // Os projetos com os números de cada um.
  const agendadosPorProjeto = new Map(agendados.map((a) => [a.projectId, a._count]));
  const lista = projetos.map((pr) => {
    const doProjeto = pub30.filter((p) => p.projectId === pr.id);
    return {
      id: pr.id,
      nome: pr.name,
      status: pr.status,
      publicados30: doProjeto.length,
      agendados: agendadosPorProjeto.get(pr.id) ?? 0,
      engajamento30: doProjeto.reduce((s, p) => s + eng(p), 0),
    };
  });

  // Os posts que mais renderam (90 dias).
  const melhores = publicados90
    .filter((p) => eng(p) > 0)
    .sort((a, b) => eng(b) - eng(a))
    .slice(0, 5)
    .map((p) => ({
      id: p.id,
      rede: p.platform,
      titulo: (p.content.split("\n").find((l) => l.trim()) ?? "").slice(0, 110),
      engajamento: eng(p),
      curtidas: p.metrics?.likes ?? 0,
      comentarios: p.metrics?.comments ?? 0,
      url: p.externalUrl,
      projeto: projetos.find((x) => x.id === p.projectId)?.name ?? "",
    }));

  const campanhas30 = runs60.filter((r) => r.startedAt >= ha30).length;
  const campanhasAnt = runs60.length - campanhas30;
  const creditosPlano30 = -creditos30.filter((c) => c.carteira !== "video").reduce((s, c) => s + c.amount, 0);
  const creditosVideo30 = -creditos30.filter((c) => c.carteira === "video").reduce((s, c) => s + c.amount, 0);

  return {
    kpis: {
      publicados30: pub30.length,
      publicadosAnt: pubAnt.length,
      engajamento30,
      engajamentoAnt,
      alcance30,
      medidos30,
      campanhas30,
      campanhasAnt,
      creditosPlano30,
      creditosVideo30,
      redes: [...new Set(contas.map((c) => c.platform))],
      contas: contas.length,
    },
    semanas,
    porRede,
    agentes,
    projetos: lista,
    melhores,
  };
}
