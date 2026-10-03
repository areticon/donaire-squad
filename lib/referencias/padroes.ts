import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";
import { IDADE_MINIMA_DIAS } from "@/lib/referencias/config";
import type { CartaoDePadrao, RedeDeReferencia } from "@/lib/referencias/tipos";

/**
 * DO POST AO PADRÃO (01/10), em três passos, como a pesquisa de 01/10 manda:
 *
 *   1. ETIQUETAR (Haiku, JSON de esquema fixo): tipo de gancho, estrutura,
 *      chamada para ação e tema. Formato e faixa de duração saem do dado, sem
 *      IA. Só aqui a legenda do concorrente é lida, pelo analista.
 *   2. GANHO: cada post contra a MEDIANA DO PRÓPRIO PERFIL (tira o efeito do
 *      tamanho da conta). Visualização onde a rede mostra; interação
 *      ponderada onde não mostra. Post com menos de 7 dias fica de fora.
 *   3. PADRÃO, por estatística e só depois por IA: um valor de etiqueta vira
 *      padrão com pelo menos 5 posts, ganho de 1,5 vez ou mais contra o resto
 *      e presença em pelo menos 2 perfis (senão é jeito de uma pessoa só).
 *
 * O cartão do padrão é escrito a partir das ETIQUETAS e dos números, nunca da
 * legenda: molde sim, conteúdo não. É ele, e só ele, que a linha editorial
 * recebe (lib/editorial/fontes-da-linha.ts, origem "padrão de referência").
 */

export const GANCHOS = ["pergunta", "numero", "contraintuitivo", "historia", "promessa", "lista", "polemica", "outro"] as const;
export const ESTRUTURAS = ["problema_solucao", "lista", "antes_depois", "bastidor", "tutorial", "opiniao", "caso", "outro"] as const;
export const CHAMADAS = ["comentar", "salvar", "compartilhar", "link", "seguir", "nenhuma"] as const;

export type Etiquetas = {
  gancho: (typeof GANCHOS)[number];
  estrutura: (typeof ESTRUTURAS)[number];
  cta: (typeof CHAMADAS)[number];
  tema: string;
};

const NOME_DO_VALOR: Record<string, string> = {
  pergunta: "abre com uma pergunta",
  numero: "abre com um número",
  contraintuitivo: "abre contrariando o senso comum",
  historia: "abre contando uma história",
  promessa: "abre com uma promessa de resultado",
  lista: "em formato de lista",
  polemica: "abre com uma polêmica",
  problema_solucao: "estrutura problema e solução",
  antes_depois: "estrutura antes e depois",
  bastidor: "mostra bastidor",
  tutorial: "é um passo a passo",
  opiniao: "é opinião direta",
  caso: "conta um caso",
  comentar: "termina pedindo comentário",
  salvar: "termina pedindo para salvar",
  compartilhar: "termina pedindo para compartilhar",
  link: "termina mandando para um link",
  seguir: "termina pedindo para seguir",
  nenhuma: "termina sem chamada",
};

export function faixaDeDuracao(seg: number | null): string | null {
  if (seg === null || seg === undefined) return null;
  if (seg <= 15) return "ate-15s";
  if (seg <= 30) return "15-30s";
  if (seg <= 60) return "30-60s";
  if (seg <= 180) return "1-3min";
  return "mais-de-3min";
}

/** Etiqueta os posts que ainda não têm etiqueta, em lotes de 12 (Haiku). */
export async function etiquetarPosts(projectId: string): Promise<number> {
  const pendentes = await prisma.referenciaPost.findMany({
    where: { projectId, etiquetas: { equals: Prisma.DbNull } },
    select: { id: true, formato: true, duracaoSeg: true, legenda: true },
    take: 120,
  });
  let feitos = 0;
  for (let i = 0; i < pendentes.length; i += 12) {
    const lote = pendentes.slice(i, i + 12);
    const lista = lote
      .map((p, k) => `${k + 1}. [${p.formato}${p.duracaoSeg ? `, ${p.duracaoSeg}s` : ""}] ${(p.legenda ?? "").replace(/\s+/g, " ").slice(0, 600)}`)
      .join("\n");
    try {
      const bruto = await askClaude(
        "Você etiqueta posts de redes sociais pela FORMA, não pelo conteúdo. Responda só com JSON.",
        `Para cada post, devolva as etiquetas:
- gancho (como a primeira frase prende): ${GANCHOS.join(", ")}
- estrutura: ${ESTRUTURAS.join(", ")}
- cta (como termina): ${CHAMADAS.join(", ")}
- tema: o assunto em até 4 palavras, genérico (sem nome de pessoa nem de marca)

POSTS:
${lista}

Responda {"posts":[{"n":1,"gancho":"...","estrutura":"...","cta":"...","tema":"..."}]}`,
        { model: "claude-haiku-4-5", maxTokens: 4000, usage: { projectId, operation: "referencias_etiquetas" } }
      );
      const j = JSON.parse(bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1)) as { posts?: Array<Partial<Etiquetas> & { n?: number }> };
      for (const e of j.posts ?? []) {
        const p = lote[Number(e.n) - 1];
        if (!p) continue;
        const et: Etiquetas = {
          gancho: GANCHOS.includes(e.gancho as never) ? (e.gancho as Etiquetas["gancho"]) : "outro",
          estrutura: ESTRUTURAS.includes(e.estrutura as never) ? (e.estrutura as Etiquetas["estrutura"]) : "outro",
          cta: CHAMADAS.includes(e.cta as never) ? (e.cta as Etiquetas["cta"]) : "nenhuma",
          tema: String(e.tema ?? "").slice(0, 60),
        };
        await prisma.referenciaPost.update({ where: { id: p.id }, data: { etiquetas: et as never } });
        feitos++;
      }
    } catch (e) {
      console.warn(`[referencias][etiquetas] ${e instanceof Error ? e.message : e}`);
    }
  }
  return feitos;
}

function mediana(xs: number[]): number {
  if (!xs.length) return 0;
  const a = [...xs].sort((p, q) => p - q);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

type PostParaGanho = {
  id: string;
  perfilId: string;
  formato: string;
  publicadoEm: Date | null;
  curtidas: number | null;
  comentarios: number | null;
  visualizacoes: number | null;
  compartilhamentos: number | null;
};

/** Interação ponderada: compartilhar espalha, comentar é conversa, curtir é o mínimo. */
function interacao(p: PostParaGanho): number | null {
  if (p.curtidas === null && p.comentarios === null && p.compartilhamentos === null) return null;
  return (p.curtidas ?? 0) + 2 * (p.comentarios ?? 0) + 3 * (p.compartilhamentos ?? 0);
}

/**
 * O ganho de cada post contra a mediana do próprio perfil. Puro, sem banco,
 * para o teste com dados de exemplo.
 */
export function calcularGanhos(posts: PostParaGanho[], agora = Date.now()): Map<string, number> {
  const saida = new Map<string, number>();
  const porPerfil = new Map<string, PostParaGanho[]>();
  for (const p of posts) {
    if (!p.publicadoEm || agora - p.publicadoEm.getTime() < IDADE_MINIMA_DIAS * 24 * 3600_000) continue;
    porPerfil.set(p.perfilId, [...(porPerfil.get(p.perfilId) ?? []), p]);
  }
  for (const lista of porPerfil.values()) {
    // A métrica do perfil é uma só, para comparar igual com igual: visualização
    // se 60% ou mais dos posts dele têm, senão interação.
    const comVisu = lista.filter((p) => (p.visualizacoes ?? 0) > 0).length;
    const metrica = comVisu >= lista.length * 0.6 ? (p: PostParaGanho) => p.visualizacoes : interacao;
    const valores = lista.map((p) => ({ p, v: metrica(p) })).filter((x): x is { p: PostParaGanho; v: number } => x.v !== null && x.v !== undefined);
    const med = mediana(valores.map((x) => x.v));
    if (valores.length < 3 || med <= 0) continue;
    for (const { p, v } of valores) saida.set(p.id, v / med);
  }
  return saida;
}

export type PostComEtiqueta = {
  id: string;
  perfilId: string;
  rede: RedeDeReferencia;
  formato: string;
  duracaoSeg: number | null;
  ganho: number;
  etiquetas: Etiquetas;
};

export type PadraoBruto = {
  chave: string;
  dimensao: string;
  valor: string;
  rede: RedeDeReferencia | "todas";
  posts: number;
  perfis: number;
  ganho: number;
};

/** A regra do padrão: 5 posts, 1,5 vez, 2 perfis. Pura, sem banco nem IA. */
export const REGRA_DO_PADRAO = { minPosts: 5, minGanho: 1.5, minPerfis: 2 };

export function acharPadroes(posts: PostComEtiqueta[]): PadraoBruto[] {
  const dimensoes: Array<{ nome: string; valor: (p: PostComEtiqueta) => string | null }> = [
    { nome: "formato", valor: (p) => p.formato },
    { nome: "duracao", valor: (p) => faixaDeDuracao(p.duracaoSeg) },
    { nome: "gancho", valor: (p) => (p.etiquetas.gancho === "outro" ? null : p.etiquetas.gancho) },
    { nome: "estrutura", valor: (p) => (p.etiquetas.estrutura === "outro" ? null : p.etiquetas.estrutura) },
    { nome: "cta", valor: (p) => p.etiquetas.cta },
  ];
  const achados: PadraoBruto[] = [];
  for (const d of dimensoes) {
    const valores = new Set(posts.map(d.valor).filter((v): v is string => Boolean(v)));
    for (const v of valores) {
      const grupo = posts.filter((p) => d.valor(p) === v);
      const resto = posts.filter((p) => d.valor(p) !== v);
      const perfis = new Set(grupo.map((p) => p.perfilId)).size;
      if (grupo.length < REGRA_DO_PADRAO.minPosts || perfis < REGRA_DO_PADRAO.minPerfis || resto.length < 3) continue;
      const base = mediana(resto.map((p) => p.ganho));
      if (base <= 0) continue;
      const ganho = mediana(grupo.map((p) => p.ganho)) / base;
      if (ganho < REGRA_DO_PADRAO.minGanho) continue;
      const redes = new Set(grupo.map((p) => p.rede));
      achados.push({
        chave: `${d.nome}:${v}`,
        dimensao: d.nome,
        valor: v,
        rede: redes.size === 1 ? [...redes][0] : "todas",
        posts: grupo.length,
        perfis,
        ganho: Math.round(ganho * 10) / 10,
      });
    }
  }
  return achados.sort((a, b) => b.ganho - a.ganho).slice(0, 8);
}

/** O nome legível do valor de uma etiqueta ("abre com um número", "reel"). */
export function descreverValor(dimensao: string, valor: string): string {
  if (dimensao === "duracao") return `duração de ${valor.replace("ate-", "até ").replace("mais-de-", "mais de ").replace("-", " a ")}`;
  if (dimensao === "formato") return `formato ${valor}`;
  return NOME_DO_VALOR[valor] ?? valor;
}

/**
 * Escreve os cartões a partir dos números e das etiquetas (sem legenda) e
 * grava em ProjectMemory tipo "padrao". Padrão que não se confirmou nesta
 * rodada sai da memória: cartão velho que ninguém apaga vira mentira no prompt.
 */
export async function gravarCartoes(projectId: string, achados: PadraoBruto[], contexto: { nicho: string; publico: string }): Promise<CartaoDePadrao[]> {
  let textos: Record<string, { oQueE?: string; comoAplicar?: string; oQueNaoLevar?: string }> = {};
  if (achados.length) {
    try {
      const lista = achados
        .map((a) => `- ${a.chave} (${a.rede}): ${descreverValor(a.dimensao, a.valor)}; ${a.posts} posts em ${a.perfis} perfis; ${a.ganho} vezes a mediana`)
        .join("\n");
      const bruto = await askClaude(
        "Você escreve cartões de padrão de conteúdo: o MOLDE que rende, nunca o conteúdo de quem fez. Nunca use travessão. Responda só com JSON.",
        `NICHO DO CLIENTE: ${contexto.nicho.slice(0, 400)}\nPÚBLICO: ${contexto.publico.slice(0, 300)}\n\nPADRÕES MEDIDOS NOS PERFIS DE REFERÊNCIA:\n${lista}\n\nPara cada chave: "oQueE" (o molde em uma frase), "comoAplicar" (como a marca do cliente usa o molde com o tema e a prova dela, uma frase), "oQueNaoLevar" (o que não copiar: frases, casos, números, visual e nome de quem fez, adaptado ao padrão, uma frase).\nResponda {"chave":{"oQueE":"...","comoAplicar":"...","oQueNaoLevar":"..."}}`,
        { maxTokens: 6000, effort: "low", usage: { projectId, operation: "referencias_cartoes" } }
      );
      textos = JSON.parse(bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1));
    } catch (e) {
      console.warn(`[referencias][cartoes] ${e instanceof Error ? e.message : e}`);
    }
  }
  const agora = new Date().toISOString();
  const cartoes: CartaoDePadrao[] = achados.map((a) => ({
    chave: a.chave,
    rede: a.rede,
    oQueE: textos[a.chave]?.oQueE ?? `Post que ${descreverValor(a.dimensao, a.valor)}`,
    prova: { posts: a.posts, perfis: a.perfis, ganho: a.ganho },
    comoAplicar: textos[a.chave]?.comoAplicar ?? "Aplicar o molde a um tema próprio da marca, com prova própria.",
    oQueNaoLevar: textos[a.chave]?.oQueNaoLevar ?? "Frases, casos, números, visual e nome de quem fez.",
    geradoEm: agora,
  }));
  // Os cartões do padrão VISUAL e do RITMO do nicho (01/10, padrao-visual.ts)
  // têm o próprio ciclo (a medida dos vídeos): não saem com os de texto.
  await prisma.projectMemory.deleteMany({
    where: {
      projectId,
      type: "padrao",
      key: { notIn: cartoes.map((c) => c.chave) },
      NOT: [{ key: { startsWith: "visual:" } }, { key: { startsWith: "ritmo:" } }],
    },
  });
  for (const c of cartoes) {
    await prisma.projectMemory.upsert({
      where: { projectId_type_key: { projectId, type: "padrao", key: c.chave } },
      create: { projectId, type: "padrao", key: c.chave, value: c as never },
      update: { value: c as never },
    });
  }
  return cartoes;
}

/** Recalcula ganho e padrões do projeto a partir do que está no banco. */
export async function atualizarPadroes(projectId: string, contexto: { nicho: string; publico: string }): Promise<CartaoDePadrao[]> {
  const posts = await prisma.referenciaPost.findMany({
    where: { projectId },
    select: { id: true, perfilId: true, rede: true, formato: true, duracaoSeg: true, publicadoEm: true, curtidas: true, comentarios: true, visualizacoes: true, compartilhamentos: true, etiquetas: true, perfil: { select: { status: true } } },
  });
  const ganhos = calcularGanhos(posts);
  for (const p of posts) {
    const g = ganhos.get(p.id) ?? null;
    await prisma.referenciaPost.update({ where: { id: p.id }, data: { ganho: g } });
  }
  const etiquetados: PostComEtiqueta[] = posts
    .filter((p) => ganhos.has(p.id) && p.etiquetas && p.perfil.status !== "proprio")
    .map((p) => ({ id: p.id, perfilId: p.perfilId, rede: p.rede as RedeDeReferencia, formato: p.formato, duracaoSeg: p.duracaoSeg, ganho: ganhos.get(p.id)!, etiquetas: p.etiquetas as Etiquetas }));
  return gravarCartoes(projectId, acharPadroes(etiquetados), contexto);
}
  // O ganho vale para todo post (é contra o próprio perfil, inclusive o do
  // cliente, 03/10); o CARTÃO DE PADRÃO só sai das referências: o perfil do
  // cliente (status "proprio") nunca vira molde do nicho de si mesmo.
