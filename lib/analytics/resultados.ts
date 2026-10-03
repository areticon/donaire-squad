import { prisma } from "@/lib/db/prisma";
import {
  CAMPOS_DOS_NUMEROS,
  interacoes,
  rotuloDaFonte,
  temNumero,
  vistos,
  type NumerosLidos,
} from "@/lib/analytics/fontes-da-leitura";
import type {
  EstadoNaConta,
  PostNosResultados,
  ResultadosDoProjeto,
  ResumoDoPeriodo,
} from "@/lib/analytics/tipos-dos-resultados";

/**
 * OS NÚMEROS DA ABA RESULTADOS (01/10).
 *
 * Pedido do Bruno: "o que foi publicado, aprovado, cancelado, tudo tem que
 * aparecer nas métricas". A aba antiga buscava `status: "published"` e só
 * mostrava post com número: arquivar dois projetos zerou a tela.
 *
 * Aqui entram TODAS as peças do projeto, cada uma num estado (publicado,
 * agendado, rascunho, cancelado ou arquivado, com falha, reprovado), e os
 * publicados com os números de cada rede, a fonte e a data da leitura. O que
 * ainda não tem número aparece como pendente, com o motivo, nunca como zero.
 */

const DIA = 86400_000;

function estadoNaConta(p: { status: string; publishedAt: Date | null; run: { archived: boolean } | null }): EstadoNaConta {
  if (p.publishedAt || p.status === "published") return "publicado";
  if (p.status === "publishing") return "publicando";
  if (p.status === "failed") return "falhou";
  if (p.status === "rejected") return "reprovado";
  if (p.status === "cancelled") return "arquivado";
  // Campanha arquivada inteira: a peça que nunca saiu foi arquivada junto.
  if (p.run?.archived) return "arquivado";
  if (p.status === "scheduled") return "agendado";
  return "rascunho";
}

function resumoVazio(rotulo: string): ResumoDoPeriodo {
  return {
    rotulo,
    porEstado: { publicado: 0, publicando: 0, agendado: 0, rascunho: 0, arquivado: 0, falhou: 0, reprovado: 0 },
    aprovados: 0,
    publicadosArquivados: 0,
    medidos: 0,
    pendentes: 0,
    interacoes: 0,
    vistos: 0,
    porRede: [],
  };
}

export async function resultadosDoProjeto(projectId: string, agora = new Date()): Promise<ResultadosDoProjeto> {
  const [posts, leituras] = await Promise.all([
    prisma.post.findMany({
      where: { projectId },
      orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      select: {
        id: true,
        platform: true,
        status: true,
        mediaType: true,
        content: true,
        publishedAt: true,
        scheduledAt: true,
        createdAt: true,
        externalUrl: true,
        run: { select: { archived: true } },
        metrics: true,
        socialAccount: { select: { username: true, displayName: true, accountType: true } },
      },
    }),
    prisma.leituraDeMetrica.findMany({
      where: { projectId },
      orderBy: { lidoEm: "asc" },
      select: { postId: true, fonte: true, status: true, motivo: true, lidoEm: true, criadoEm: true, impressoes: true, alcance: true, visualizacoes: true, curtidas: true, comentarios: true, compartilhamentos: true, salvamentos: true, cliques: true },
    }),
  ]);

  const leiturasDo = new Map<string, typeof leituras>();
  for (const l of leituras) {
    const lista = leiturasDo.get(l.postId) ?? [];
    lista.push(l);
    leiturasDo.set(l.postId, lista);
  }

  const publicados: PostNosResultados[] = [];
  const estadoDe = new Map<string, EstadoNaConta>();
  for (const p of posts) {
    const estado = estadoNaConta(p);
    estadoDe.set(p.id, estado);
    if (estado !== "publicado") continue;
    const lista = leiturasDo.get(p.id) ?? [];
    const oks = lista.filter((l) => l.status === "ok");
    let numeros: NumerosLidos | null = null;
    let fonte: string | null = null;
    let lidoEm: string | null = null;
    if (oks.length) {
      // Para cada campo, a leitura mais recente que trouxe aquele campo.
      numeros = {};
      for (const c of CAMPOS_DOS_NUMEROS) {
        const com = [...oks].reverse().find((l) => l[c] !== null);
        numeros[c] = com ? com[c] : null;
      }
      const ultima = oks[oks.length - 1];
      fonte = ultima.fonte;
      lidoEm = ultima.lidoEm.toISOString();
    } else if (!lista.length && p.metrics) {
      // Número gravado antes do histórico de leituras (post_metrics).
      numeros = { curtidas: p.metrics.likes, comentarios: p.metrics.comments, compartilhamentos: p.metrics.shares, impressoes: p.metrics.impressions || null, visualizacoes: p.metrics.videoViews || null, cliques: p.metrics.clicks || null };
      fonte = "anterior";
      lidoEm = p.metrics.syncedAt.toISOString();
    }
    const ultimaTentativa = lista[lista.length - 1];
    const conta = p.socialAccount
      ? p.socialAccount.accountType === "organization"
        ? `Página ${p.socialAccount.displayName ?? p.socialAccount.username ?? ""}`.trim()
        : p.socialAccount.username && !p.socialAccount.username.includes("@")
          ? `@${p.socialAccount.username}`
          : p.socialAccount.displayName ?? "perfil pessoal"
      : null;
    publicados.push({
      id: p.id,
      rede: p.platform,
      conta,
      mediaType: p.mediaType,
      titulo: (p.content.split("\n").find((l) => l.trim()) ?? "").slice(0, 140),
      publicadoEm: (p.publishedAt ?? p.createdAt).toISOString(),
      arquivado: p.status === "cancelled" || Boolean(p.run?.archived),
      link: p.externalUrl,
      numeros: temNumero(numeros) ? numeros : null,
      fonte: temNumero(numeros) ? fonte : null,
      lidoEm: temNumero(numeros) ? lidoEm : null,
      pendente: temNumero(numeros)
        ? null
        : ultimaTentativa?.motivo ?? "Ainda não medido: a primeira leitura sai 2 horas depois da publicação, ou agora em \"Sincronizar números\".",
      historico: oks.map((l) => ({ lidoEm: l.lidoEm.toISOString(), interacoes: interacoes(l), vistos: vistos(l), fonte: l.fonte })),
    });
  }
  const numerosDo = new Map(publicados.map((p) => [p.id, p]));

  // A data da peça na conta do período: publicação, senão agendamento,
  // senão criação.
  const dataDa = (p: (typeof posts)[number]) => p.publishedAt ?? p.scheduledAt ?? p.createdAt;
  const resumir = (rotulo: string, desde: Date | null): ResumoDoPeriodo => {
    const r = resumoVazio(rotulo);
    const redes = new Map<string, ResumoDoPeriodo["porRede"][number]>();
    for (const p of posts) {
      if (desde && dataDa(p) < desde) continue;
      const e = estadoDe.get(p.id)!;
      r.porEstado[e]++;
      if (e !== "publicado") continue;
      const n = numerosDo.get(p.id)!;
      const rede = redes.get(p.platform) ?? { rede: p.platform, publicados: 0, medidos: 0, interacoes: 0, vistos: 0 };
      rede.publicados++;
      if (n.arquivado) r.publicadosArquivados++;
      if (n.numeros) {
        r.medidos++;
        rede.medidos++;
        r.interacoes += interacoes(n.numeros) ?? 0;
        rede.interacoes += interacoes(n.numeros) ?? 0;
        r.vistos += vistos(n.numeros) ?? 0;
        rede.vistos += vistos(n.numeros) ?? 0;
      } else r.pendentes++;
      redes.set(p.platform, rede);
    }
    r.aprovados = r.porEstado.publicado + r.porEstado.publicando + r.porEstado.agendado;
    r.porRede = [...redes.values()].sort((a, b) => b.interacoes - a.interacoes || b.publicados - a.publicados);
    return r;
  };

  // Publicados por semana (8 semanas), arquivados inclusos.
  const semanas: ResultadosDoProjeto["semanas"] = [];
  for (let i = 7; i >= 0; i--) {
    const fim = new Date(agora.getTime() - i * 7 * DIA);
    const ini = new Date(fim.getTime() - 7 * DIA);
    const porRede: Record<string, number> = {};
    for (const p of publicados) {
      const d = new Date(p.publicadoEm);
      if (d >= ini && d < fim) porRede[p.rede] = (porRede[p.rede] ?? 0) + 1;
    }
    semanas.push({ rotulo: fim.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }), porRede });
  }

  const contagemDeFontes = new Map<string, number>();
  for (const p of publicados) if (p.fonte) contagemDeFontes.set(p.fonte, (contagemDeFontes.get(p.fonte) ?? 0) + 1);
  const ultima = leituras.reduce<Date | null>((m, l) => (!m || l.criadoEm > m ? l.criadoEm : m), null);

  return {
    geradoEm: agora.toISOString(),
    semana: resumir("Últimos 7 dias", new Date(agora.getTime() - 7 * DIA)),
    mes: resumir("Últimos 30 dias", new Date(agora.getTime() - 30 * DIA)),
    tudo: resumir("Desde o início", null),
    semanas,
    posts: publicados,
    fontes: [...contagemDeFontes.entries()].map(([fonte, n]) => ({ fonte, rotulo: rotuloDaFonte(fonte), posts: n })).sort((a, b) => b.posts - a.posts),
    ultimaLeitura: ultima?.toISOString() ?? null,
  };
}
