import { membroAtivo, projetoVisivel } from "@/lib/equipe/conta";
import { prisma } from "@/lib/db/prisma";
import { AGENTES } from "@/lib/squad/estado-do-squad";
import { consolidarNumerosDoPost, REDE_DO_AGENTE, resultadoDaRede, type NumerosDoPost, type ResultadoDaRede } from "@/lib/painel/resultado-das-redes";

/**
 * OS NÚMEROS DA TELA INICIAL (28/09).
 *
 * Pedido do Bruno: "a tela inicial deve ter os agentes, os números deles, os
 * projetos, campanhas, posts, redes, com números para análise", e "gráficos ao
 * invés de cards". A tela tinha quatro contadores soltos e duas listas: nada
 * que respondesse "estou crescendo?" ou "qual rede rende?".
 *
 * Tudo em janelas de 30 dias contra os 30 anteriores, porque número sozinho
 * não diz se melhorou. Engajamento é curtida + comentário + compartilhamento
 * + salvamento, que é o que as redes entregam; alcance só entra quando existe
 * (LinkedIn de página, X, YouTube, Instagram com permissão de insights).
 *
 * 06/10 (pedido do Bruno, "esses números precisam ser reais"): os números de
 * cada post saem das LEITURAS (leituras_de_metrica, campo a campo, com a fonte)
 * e não mais do post_metrics, que gravava zero no que a fonte não mede. Cada
 * especialista de rede mostra o resultado da rede dele; quem não publica
 * (Roberto, Diana, Vitor, Vera) mostra o trabalho conferido no banco: só conta
 * card com conteúdo de fato (texto, arte ou vídeo pronto, veredito dado), e
 * não o card de espera que a esteira abre antes de o agente trabalhar.
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

  const noMes = { ...doUsuario, createdAt: { gte: ha30 } };
  const [publicados90, runs60, escritos30, comMidia30, revisoes30, contas, projetos, agendados, creditos30] = await Promise.all([
    prisma.post.findMany({
      // Sem `status: "published"` (01/10): arquivar grava "cancelled", e o
      // Bruno arquivou dois projetos e viu os números sumirem. Ter data de
      // publicação é o fato "foi ao ar", que arquivar não apaga.
      where: { ...doUsuario, publishedAt: { gte: ha90 } },
      select: { id: true, platform: true, publishedAt: true, content: true, projectId: true, externalUrl: true, metrics: true },
    }),
    prisma.pipelineRun.findMany({ where: { ...doUsuario, startedAt: { gte: ha60 } }, select: { startedAt: true, status: true } }),
    // Peça escrita: card com texto (o de espera nasce vazio).
    prisma.campaignCard.groupBy({ by: ["agentId"], where: { ...noMes, AND: [{ content: { not: null } }, { content: { not: "" } }] }, _count: true }),
    // Arte e corte: só o que tem a mídia gerada.
    prisma.campaignCard.groupBy({ by: ["agentId"], where: { ...noMes, cardType: { in: ["media", "video_clip", "video_completo"] }, mediaUrl: { not: null } }, _count: true }),
    // Revisão da Vera: o card de prévia que recebeu veredito.
    prisma.campaignCard.findMany({ where: { ...noMes, cardType: "preview" }, select: { metadata: true } }),
    prisma.socialAccount.findMany({ where: { project: projetoVisivel(userId), isActive: true }, select: { platform: true } }),
    prisma.project.findMany({ where: projetoVisivel(userId), orderBy: { updatedAt: "desc" }, select: { id: true, name: true, status: true } }),
    prisma.post.groupBy({ by: ["projectId"], where: { ...doUsuario, status: "scheduled", scheduledAt: { gte: agora } }, _count: true }),
    prisma.creditTransaction.findMany({ where: { ...(membro ? { userId: membro.donoId, autorId: userId } : { userId }), createdAt: { gte: ha30 }, amount: { lt: 0 } }, select: { amount: true, carteira: true } }),
  ]);

  // Os números de cada post pelas leituras (06/10), com o post_metrics só para
  // post medido antes do histórico de leituras existir.
  const leituras = publicados90.length
    ? await prisma.leituraDeMetrica.findMany({
        where: { postId: { in: publicados90.map((p) => p.id) }, status: "ok" },
        select: { postId: true, fonte: true, lidoEm: true, impressoes: true, alcance: true, visualizacoes: true, curtidas: true, comentarios: true, compartilhamentos: true, salvamentos: true, cliques: true, extras: true },
      })
    : [];
  const leiturasDo = new Map<string, typeof leituras>();
  for (const l of leituras) leiturasDo.set(l.postId, [...(leiturasDo.get(l.postId) ?? []), l]);
  const numerosDo = new Map<string, NumerosDoPost | null>(publicados90.map((p) => [p.id, consolidarNumerosDoPost(leiturasDo.get(p.id) ?? [], p.metrics)]));
  const eng = (p: (typeof publicados90)[number]) => {
    const m = numerosDo.get(p.id);
    return m ? (m.curtidas ?? 0) + (m.comentarios ?? 0) + (m.compartilhamentos ?? 0) + (m.salvamentos ?? 0) : 0;
  };
  const dentro = (d: Date | null, de: Date, ate: Date) => Boolean(d && d >= de && d < ate);

  const pub30 = publicados90.filter((p) => dentro(p.publishedAt, ha30, agora));
  const pubAnt = publicados90.filter((p) => dentro(p.publishedAt, ha60, ha30));
  const engajamento30 = pub30.reduce((s, p) => s + eng(p), 0);
  const engajamentoAnt = pubAnt.reduce((s, p) => s + eng(p), 0);
  const alcance30 = pub30.reduce((s, p) => {
    const m = numerosDo.get(p.id);
    return s + (m?.visualizacoes ?? m?.impressoes ?? m?.alcance ?? 0);
  }, 0);
  const medidos30 = pub30.filter((p) => numerosDo.get(p.id)).length;

  // Posts publicados por semana, empilhados por rede (8 semanas).
  const semanas: Array<{ rotulo: string; porRede: Record<string, number> }> = [];
  for (let i = 7; i >= 0; i--) {
    const fim = new Date(agora.getTime() - i * 7 * DIA);
    const ini = new Date(fim.getTime() - 7 * DIA);
    const porRede: Record<string, number> = {};
    for (const p of publicados90) if (dentro(p.publishedAt, ini, fim)) porRede[p.platform] = (porRede[p.platform] ?? 0) + 1;
    semanas.push({ rotulo: fim.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }), porRede });
  }

  // O resultado de cada rede nos últimos 30 dias (06/10): a mesma conta do
  // cartão do especialista e do gráfico "Qual rede rende mais".
  const redesDoMes = new Map<string, Array<{ numeros: NumerosDoPost | null }>>();
  for (const p of pub30) redesDoMes.set(p.platform, [...(redesDoMes.get(p.platform) ?? []), { numeros: numerosDo.get(p.id) ?? null }]);
  const resultadoPorRede = new Map<string, ResultadoDaRede>([...redesDoMes].map(([rede, posts]) => [rede, resultadoDaRede(rede, posts)]));
  const porRede = [...resultadoPorRede.values()]
    .map((r) => ({ ...r, media: r.medidos && r.interacoes !== null ? r.interacoes / r.medidos : null }))
    .sort((a, b) => (b.media ?? -1) - (a.media ?? -1) || b.publicados - a.publicados);

  // Os agentes e o que cada um fez nos últimos 30 dias.
  // As threads antigas foram gravadas com o id do Tiago, e são do Xavier.
  const somar = (lista: Array<{ agentId: string; _count: number }>, id: string) =>
    (lista.find((c) => c.agentId === id)?._count ?? 0) + (id === "xavier-x" ? lista.find((c) => c.agentId === "tiago-twitter")?._count ?? 0 : 0);
  const revisoes = revisoes30.filter((c) => Boolean((c.metadata as { veredito?: unknown } | null)?.veredito)).length;
  const UNIDADE: Record<string, [string, string]> = {
    "roberto-radar": ["pesquisa entregue", "pesquisas entregues"],
    "lucas-linkedin": ["post escrito", "posts escritos"],
    "xavier-x": ["thread escrita", "threads escritas"],
    "igor-instagram": ["legenda escrita", "legendas escritas"],
    "fernanda-facebook": ["post escrito", "posts escritos"],
    "tiago-tiktok": ["legenda escrita", "legendas escritas"],
    "yan-youtube": ["vídeo descrito", "vídeos descritos"],
    "diana-design": ["arte ou vídeo pronto", "artes e vídeos prontos"],
    "vitor-video": ["corte pronto", "cortes prontos"],
    "vera-veredito": ["revisão com veredito", "revisões com veredito"],
    "paulo-publicador": ["post no ar", "posts no ar"],
  };
  const agentes = AGENTES.map((a) => {
    // O Paulo conta o que foi AO AR; Diana e Vitor, a mídia pronta; a Vera, o
    // veredito dado; o resto, a peça com texto.
    const n =
      a.id === "paulo-publicador" ? pub30.length
      : a.id === "diana-design" || a.id === "vitor-video" ? somar(comMidia30, a.id)
      : a.id === "vera-veredito" ? revisoes
      : somar(escritos30, a.id);
    const [um, varios] = UNIDADE[a.id] ?? ["peça", "peças"];
    const rede = REDE_DO_AGENTE[a.id] ?? null;
    return {
      id: a.id,
      nome: a.nome,
      papel: a.papel,
      cor: a.cor,
      numero: n,
      unidade: n === 1 ? um : varios,
      rede,
      resultado: rede ? resultadoPorRede.get(rede) ?? resultadoDaRede(rede, []) : null,
    };
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
      // Nulo quando nenhum post do projeto foi medido: "sem medição", não zero.
      engajamento30: doProjeto.some((p) => numerosDo.get(p.id)) ? doProjeto.reduce((s, p) => s + eng(p), 0) : null,
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
      curtidas: numerosDo.get(p.id)?.curtidas ?? null,
      comentarios: numerosDo.get(p.id)?.comentarios ?? null,
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
