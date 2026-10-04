import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { askClaude, askClaudeComImagens } from "@/lib/claude";
import { ATORES, estimativaDoAtor } from "@/lib/referencias/apify";
import { Caixa, maxItensPorPerfil, redesLigadas } from "@/lib/referencias/config";
import { coletarReferencia, dadosDoInstagram, perfilCanonico, urlDoPerfil } from "@/lib/referencias/coletar";
import { gravarPostsDaColeta, motivoDaColeta, rotuloDoPerfil } from "@/lib/referencias/estudo";
import { calcularGanhos, etiquetarPosts } from "@/lib/referencias/padroes";
import { etiquetarExtras } from "@/lib/referencias/etiquetas-extras";
import { painelExecutivo, type PostParaAchado } from "@/lib/referencias/achados";
import { cabeNoMes, tetoPorExecucaoUsd } from "@/lib/referencias/tetos";
import type { MedidaDoVideo } from "@/lib/referencias/medidas";
import type { RedeDeReferencia } from "@/lib/referencias/tipos";
import { ROTULO_DO_ESTILO_DE_ARTE, ROTULO_DO_TOM, type ExtrasDoPost, type EtiquetasExtras, type GraficoDoPainel } from "@/lib/referencias/tipos-das-analises";
import {
  REDES_DO_CLIENTE,
  STATUS_DO_PERFIL_PROPRIO,
  type CustoDoEstudo,
  type EstadoDoPerfilProprio,
  type EtapaDoPerfilProprio,
  type FatiaDoPerfil,
  type QuemE,
  type RedeLidaDoCliente,
  type RelatorioDoPerfil,
  type VisualDoPerfil,
} from "@/lib/referencias/tipos-do-perfil-proprio";

/**
 * O ESTUDO DO PERFIL DO PRÓPRIO CLIENTE (03/10/2026), a primeira tela da
 * jornada de entrada ("Coloque aqui as suas redes").
 *
 * A MESMA COLETA das referências (lib/referencias/coletar.ts), o mesmo formato
 * de post, as mesmas etiquetas (padroes.ts e etiquetas-extras.ts) e a mesma
 * conta de rendimento (cada post contra a mediana do próprio perfil). O que é
 * novo aqui:
 *   • o perfil mora em referencias_perfis com status "proprio", e por isso
 *     nunca entra nos achados, nos cartões, na medida nem nas tendências, que
 *     leem só "confirmado";
 *   • os dados do perfil do Instagram (seguidores, total de posts, bio);
 *   • UMA leitura de IA (Sonnet com até 6 capas): quem é a pessoa, o produto,
 *     o objetivo, o público, a linguagem, as cores e o estilo visual. Os
 *     números do relatório são contados pelo código, nunca pelo modelo.
 *
 * O DINHEIRO: entra na mesma conta das referências (referencias_coletas),
 * então obedece o mesmo teto do mês (US$ 12, lib/referencias/tetos.ts) e o
 * mesmo caixa por execução (US$ 0,30). A estimativa sai ANTES de gastar
 * (`estimarEstudoDoPerfil`); o custo real fica no relatório: Apify pelas
 * coletas gravadas e IA pelo ai_usage das operações desta execução.
 *
 * O TEMPO: roda em `after` (rota app/api/projects/[id]/perfil-proprio), com o
 * estado em ProjectMemory (tipo "perfil_proprio", chave "estado") e o prazo
 * lido por quem consulta, a mesma regra da fila: função morta pela
 * plataforma vira "parou no meio" na tela.
 */

const TIPO = "perfil_proprio";
const PRAZO_MS = 830_000;
const onde = (projectId: string, key: string) => ({ projectId_type_key: { projectId, type: TIPO, key } });

/** Operações de IA desta etapa, para somar o custo real no ai_usage. */
export const OPERACOES_DE_IA_DO_PERFIL = ["referencias_etiquetas", "referencias_etiquetas_extras", "referencias_arte", "perfil_proprio_leitura"];

/** Capas lidas na leitura do perfil (o caro da leitura é a imagem). */
const CAPAS_NA_LEITURA = 6;

// ── As redes do cliente ─────────────────────────────────────────────────────

export async function redesDoCliente(projectId: string) {
  return prisma.referenciaPerfil.findMany({ where: { projectId, status: STATUS_DO_PERFIL_PROPRIO }, orderBy: { createdAt: "asc" } });
}

/**
 * Grava as redes que o cliente escreveu na primeira tela. Rede que saiu da
 * lista é apagada junto com os posts (são dados do próprio cliente, e post
 * de perfil que ele tirou não pode continuar no relatório).
 */
export async function salvarRedesDoCliente(projectId: string, entrada: Array<{ rede: string; perfil: string }>): Promise<{ redes: Array<{ rede: RedeDeReferencia; perfil: string }>; recusadas: string[] }> {
  const recusadas: string[] = [];
  const validas: Array<{ rede: RedeDeReferencia; perfil: string }> = [];
  for (const e of entrada) {
    const rede = e.rede as RedeDeReferencia;
    const bruto = (e.perfil ?? "").trim();
    if (!bruto || !REDES_DO_CLIENTE.includes(rede)) continue;
    if (rede === "linkedin" && !/linkedin\.com\/(company|school|showcase)\//i.test(bruto)) {
      recusadas.push("LinkedIn: só dá para ler página de empresa (o link com /company/); perfil pessoal fica de fora");
      continue;
    }
    const perfil = perfilCanonico(rede, bruto);
    if (perfil && !validas.some((v) => v.rede === rede)) validas.push({ rede, perfil });
  }
  const atuais = await redesDoCliente(projectId);
  const sair = atuais.filter((a) => !validas.some((v) => v.rede === a.rede && v.perfil === a.perfil));
  if (sair.length) await prisma.referenciaPerfil.deleteMany({ where: { id: { in: sair.map((s) => s.id) } } });
  for (const v of validas) {
    await prisma.referenciaPerfil.upsert({
      where: { projectId_rede_perfil: { projectId, rede: v.rede, perfil: v.perfil } },
      create: { projectId, rede: v.rede, perfil: v.perfil, url: urlDoPerfil(v.rede, v.perfil), nome: v.perfil, motivo: "perfil do próprio cliente", status: STATUS_DO_PERFIL_PROPRIO, origem: "cliente" },
      update: { status: STATUS_DO_PERFIL_PROPRIO, origem: "cliente" },
    });
  }
  return { redes: validas, recusadas };
}

// ── A estimativa antes de gastar ────────────────────────────────────────────

/** Cerca de US$ 0,01 por lote de 12 legendas nas etiquetas de base (Haiku, medido em 01/10). */
const IA_ETIQUETA_BASE_POR_LOTE = 0.01;
const IA_TEXTO_POR_LOTE = 0.008;
const IA_CAPAS_POR_LOTE = 0.015;
/** A leitura do perfil: Sonnet 5 com até 6 capas e as legendas (estimado: 12 mil tokens de entrada, 3 mil de saída). */
export const IA_DA_LEITURA_USD = 0.06;

function iaPorPosts(posts: number, comLeitura: boolean): number {
  const lotes = Math.ceil(posts / 12);
  const capas = Math.ceil(Math.min(posts, 48) / 8);
  return lotes * (IA_ETIQUETA_BASE_POR_LOTE + IA_TEXTO_POR_LOTE) + capas * IA_CAPAS_POR_LOTE + (comLeitura ? IA_DA_LEITURA_USD : 0);
}

/** O preço da leitura de uma rede (o maior caso: todos os itens pedidos). */
export function apifyDaRede(rede: RedeDeReferencia, itens: number, comPerfil: boolean): number {
  if (rede === "instagram") return estimativaDoAtor(ATORES.instagramPosts, itens) + (comPerfil ? estimativaDoAtor(ATORES.instagramPerfil, 1) : 0);
  if (rede === "tiktok") return estimativaDoAtor(ATORES.tiktok, itens);
  if (rede === "linkedin") return estimativaDoAtor(ATORES.linkedinEmpresa, itens);
  // YouTube pela API oficial (cota grátis); X não entra na jornada.
  return 0;
}

const arred = (n: number) => Math.round(n * 1000) / 1000;

export function estimarEstudoDoPerfil(redes: RedeDeReferencia[]): CustoDoEstudo {
  const itens = maxItensPorPerfil();
  const apify = redes.reduce((s, r) => s + apifyDaRede(r, itens, true), 0);
  return { apifyUsd: arred(apify), iaUsd: arred(iaPorPosts(itens * redes.length, true)), estimado: true };
}

/** O estudo das até 3 referências (sem a medida dos vídeos), mais as regras e as tendências. */
export function estimarEstudoDasReferencias(redes: RedeDeReferencia[], comTendencias: { apifyUsd: number; iaUsd: number }): CustoDoEstudo {
  const itens = maxItensPorPerfil();
  const apify = redes.reduce((s, r) => s + apifyDaRede(r, itens, true), 0) + comTendencias.apifyUsd;
  // Regras: uma chamada de Sonnet (lib/referencias/regras.ts, CUSTO_DAS_PROPOSTAS_USD) entra pela tendência estimada junto.
  return { apifyUsd: arred(apify), iaUsd: arred(iaPorPosts(itens * redes.length, false) + 0.05 + comTendencias.iaUsd), estimado: true };
}

// ── O estado em segundo plano ───────────────────────────────────────────────

export async function lerEstadoDoPerfil(projectId: string): Promise<{ estado: EstadoDoPerfilProprio | null; parado: boolean }> {
  const linha = await prisma.projectMemory.findUnique({ where: onde(projectId, "estado"), select: { value: true } });
  const estado = (linha?.value as unknown as EstadoDoPerfilProprio | undefined) ?? null;
  if (!estado) return { estado: null, parado: false };
  return { estado, parado: estado.status === "rodando" && Date.now() > new Date(estado.prazoEm).getTime() };
}

async function gravarEstado(projectId: string, e: EstadoDoPerfilProprio) {
  await prisma.projectMemory
    .upsert({ where: onde(projectId, "estado"), create: { projectId, type: TIPO, key: "estado", value: e as never }, update: { value: e as never } })
    .catch((err) => console.error(`[perfil-proprio][${projectId}] não gravei o estado: ${err instanceof Error ? err.message : err}`));
}

/** Reserva o estudo. Null se já há um vivo (clique duplo, duas abas). */
export async function pedirEstudoDoPerfil(projectId: string): Promise<EstadoDoPerfilProprio | null> {
  const agora = new Date();
  const novo: EstadoDoPerfilProprio = {
    status: "rodando",
    etapa: "coletando",
    pedidoEm: agora.toISOString(),
    prazoEm: new Date(agora.getTime() + PRAZO_MS).toISOString(),
    terminadoEm: null,
    erro: null,
    avisos: [],
  };
  const linha = await prisma.projectMemory.findUnique({ where: onde(projectId, "estado"), select: { id: true, value: true, updatedAt: true } });
  if (linha) {
    const ant = linha.value as unknown as EstadoDoPerfilProprio;
    if (ant.status === "rodando" && Date.now() <= new Date(ant.prazoEm).getTime()) return null;
    const r = await prisma.projectMemory.updateMany({ where: { id: linha.id, updatedAt: linha.updatedAt }, data: { value: novo as unknown as Prisma.InputJsonValue } });
    if (r.count === 0) return null;
  } else {
    try {
      await prisma.projectMemory.create({ data: { projectId, type: TIPO, key: "estado", value: novo as unknown as Prisma.InputJsonValue } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null;
      throw e;
    }
  }
  return novo;
}

export async function lerRelatorio(projectId: string): Promise<RelatorioDoPerfil | null> {
  const linha = await prisma.projectMemory.findUnique({ where: onde(projectId, "relatorio"), select: { value: true } });
  return (linha?.value as unknown as RelatorioDoPerfil | undefined) ?? null;
}

// ── Os posts no formato dos achados ─────────────────────────────────────────

/** Os posts de um conjunto de perfis no formato dos achados (o mesmo de achados.ts). */
export async function postsParaAchado(where: Prisma.ReferenciaPostWhereInput): Promise<Array<PostParaAchado & { legenda: string | null; seguidoresDoAutor: number | null }>> {
  const linhas = await prisma.referenciaPost.findMany({
    where,
    select: {
      id: true,
      perfilId: true,
      rede: true,
      url: true,
      formato: true,
      legenda: true,
      duracaoSeg: true,
      publicadoEm: true,
      curtidas: true,
      comentarios: true,
      visualizacoes: true,
      compartilhamentos: true,
      seguidoresDoAutor: true,
      ganho: true,
      etiquetas: true,
      extras: true,
      medidas: true,
      perfil: { select: { perfil: true } },
    },
  });
  return linhas.map((l) => ({
    id: l.id,
    perfilId: l.perfilId,
    rede: l.rede as RedeDeReferencia,
    perfil: l.perfil.perfil,
    url: l.url,
    formato: l.formato,
    legenda: l.legenda,
    duracaoSeg: l.duracaoSeg,
    publicadoEm: l.publicadoEm,
    curtidas: l.curtidas,
    comentarios: l.comentarios,
    visualizacoes: l.visualizacoes,
    compartilhamentos: l.compartilhamentos,
    seguidoresDoAutor: l.seguidoresDoAutor,
    ganho: l.ganho,
    etiquetas: (l.etiquetas as PostParaAchado["etiquetas"]) ?? null,
    extras: (l.extras as ExtrasDoPost | null) ?? null,
    medidas: (l.medidas as MedidaDoVideo | null) ?? null,
  }));
}

// ── As contas do relatório (puras) ──────────────────────────────────────────

export function mediana(xs: number[]): number | null {
  const a = xs.filter((x) => Number.isFinite(x)).sort((p, q) => p - q);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** Interação ponderada, a mesma do ganho: compartilhar espalha, comentar é conversa. */
export function interacaoDoPost(p: { curtidas: number | null; comentarios: number | null; compartilhamentos: number | null }): number | null {
  if (p.curtidas === null && p.comentarios === null && p.compartilhamentos === null) return null;
  return (p.curtidas ?? 0) + 2 * (p.comentarios ?? 0) + 3 * (p.compartilhamentos ?? 0);
}

/**
 * Posts por semana no período lido.
 *
 * O POST FIXADO ENGANAVA A CONTA (achado na prova de 03/10): o Instagram
 * devolve os fixados primeiro, e um fixado de 2022 fazia 20 posts parecerem 3
 * anos de trabalho (0,5 por semana para quem posta quase todo dia). Agora a
 * série começa no post mais novo e para no primeiro buraco grande (5 vezes o
 * intervalo típico, no mínimo 30 dias): o que vem depois do buraco é fixado
 * ou é de outra fase do perfil. O período vai até HOJE: quem parou de postar
 * há um mês não aparece com a frequência de quando postava.
 */
export function postsPorSemana(datas: Array<Date | null>, agora = Date.now()): { porSemana: number | null; periodoDias: number | null } {
  const ts = datas.filter((d): d is Date => Boolean(d)).map((d) => d.getTime()).sort((a, b) => b - a);
  if (ts.length < 2) return { porSemana: null, periodoDias: null };
  const dia = 86_400_000;
  const intervalos = ts.slice(1).map((t, i) => (ts[i] - t) / dia);
  const tipico = Math.max(0.5, mediana(intervalos) ?? 1);
  const limite = Math.max(30, tipico * 5);
  let n = 1;
  while (n < ts.length && (ts[n - 1] - ts[n]) / dia <= limite) n++;
  const dias = Math.max(7, (agora - ts[n - 1]) / dia);
  return { porSemana: Math.round((n / (dias / 7)) * 10) / 10, periodoDias: Math.round(dias) };
}

/** Engajamento por seguidor (curtida e comentário sobre seguidores), mediano, em %. */
export function taxaDeEngajamento(posts: Array<{ curtidas: number | null; comentarios: number | null }>, seguidores: number | null): number | null {
  if (!seguidores || seguidores < 50) return null;
  const xs = posts.filter((p) => p.curtidas !== null || p.comentarios !== null).map((p) => (((p.curtidas ?? 0) + (p.comentarios ?? 0)) / seguidores) * 100);
  const m = mediana(xs);
  return m === null ? null : Math.round(m * 100) / 100;
}

export const NOME_DO_FORMATO: Record<string, string> = { reel: "Reels", carrossel: "Carrosséis", imagem: "Imagem única", video: "Vídeos", short: "Shorts", texto: "Só texto", documento: "Documentos" };
const FORMATO_NO_SINGULAR: Record<string, string> = { reel: "reel", carrossel: "carrossel", imagem: "imagem única", video: "vídeo", short: "short", texto: "post de texto", documento: "documento" };
const NOME_DO_GANCHO: Record<string, string> = {
  pergunta: "Pergunta",
  numero: "Número",
  contraintuitivo: "Contra o senso comum",
  historia: "História",
  promessa: "Promessa de resultado",
  lista: "Anuncia uma lista",
  polemica: "Polêmica",
  outro: "Outro jeito",
};
const NOME_DO_TOM: Record<string, string> = { humor: "Humor", serio: "Sério", inspirador: "Inspirador", educativo: "Educativo", polemico: "Polêmico", emocional: "Emotivo" };

/** A distribuição de uma dimensão, com o rendimento do gráfico quando ele existe. */
function fatias(posts: PostParaAchado[], valor: (p: PostParaAchado) => string | null, nome: (v: string) => string, grafico?: GraficoDoPainel): FatiaDoPerfil[] {
  const cont = new Map<string, number>();
  for (const p of posts) {
    const v = valor(p);
    if (v) cont.set(v, (cont.get(v) ?? 0) + 1);
  }
  const total = [...cont.values()].reduce((s, n) => s + n, 0);
  return [...cont.entries()]
    .map(([chave, n]) => ({ chave, nome: nome(chave), posts: n, pct: total ? Math.round((n / total) * 100) : 0, vezes: grafico?.barras.find((b) => b.chave === chave)?.vezes ?? null }))
    .sort((a, b) => b.posts - a.posts)
    .slice(0, 8);
}

const et = (p: PostParaAchado) => (p.etiquetas ?? {}) as Record<string, unknown> & EtiquetasExtras;

/** O tema de 4 palavras das etiquetas, normalizado para agrupar. */
const temaDe = (p: PostParaAchado) => {
  const t = String(et(p).tema ?? "").trim().toLowerCase();
  // O etiquetador escreve "sem conteúdo identificável" quando a legenda é vazia: não é tema.
  if (t.length <= 2 || /^(sem |nenhum|não |indefinido|desconhecido|outro)/.test(t)) return null;
  return t;
};

const vezesTexto = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x`;

/** Monta o relatório a partir dos posts gravados (sem IA; a leitura entra pronta). */
export function montarRelatorio(
  posts: Array<PostParaAchado & { legenda: string | null; seguidoresDoAutor: number | null }>,
  redes: RedeLidaDoCliente[],
  extra: { nome: string | null; bio: string | null; visual: VisualDoPerfil | null; quemE: QuemE | null; custo: CustoDoEstudo }
): RelatorioDoPerfil {
  const painel = painelExecutivo(posts);
  const g = (id: string) => painel.graficos.find((x) => x.id === id);
  const seguidores = redes.reduce((s, r) => s + (r.seguidores ?? 0), 0) || null;
  const { porSemana, periodoDias } = postsPorSemana(posts.map((p) => p.publicadoEm));
  // Taxa por rede (cada rede contra os próprios seguidores), mediana entre elas.
  const taxas = redes
    .map((r) => taxaDeEngajamento(posts.filter((p) => p.rede === r.rede), r.seguidores))
    .filter((t): t is number => t !== null);
  const taxa = taxas.length ? mediana(taxas) : null;

  // O POST DE MAIOR ENGAJAMENTO: a maior interação absoluta (curtida,
  // comentário e compartilhamento, a mesma ponderação do ganho), que vale para
  // foto e vídeo igual; o ganho entra no porquê. Sem interação, o maior ganho.
  const comGanho = posts.filter((p) => p.ganho !== null).sort((a, b) => b.ganho! - a.ganho!);
  const porInteracao = posts.filter((p) => interacaoDoPost(p) !== null).sort((a, b) => interacaoDoPost(b)! - interacaoDoPost(a)!);
  const melhor = porInteracao[0] ?? comGanho[0] ?? null;
  let melhorPost: RelatorioDoPerfil["melhorPost"] = null;
  if (melhor) {
    const e = et(melhor);
    const como = [
      FORMATO_NO_SINGULAR[melhor.formato] ?? melhor.formato,
      e.gancho && e.gancho !== "outro" ? `abre com ${String(NOME_DO_GANCHO[String(e.gancho)] ?? e.gancho).toLowerCase()}` : null,
      e.tom ? `tom ${String(NOME_DO_TOM[String(e.tom)] ?? e.tom).toLowerCase()}` : null,
    ].filter(Boolean);
    melhorPost = {
      rede: melhor.rede,
      perfil: melhor.perfil,
      url: melhor.url,
      formato: melhor.formato,
      publicadoEm: melhor.publicadoEm?.toISOString() ?? null,
      visualizacoes: melhor.visualizacoes,
      curtidas: melhor.curtidas,
      comentarios: melhor.comentarios,
      compartilhamentos: melhor.compartilhamentos,
      salvamentos: melhor.extras?.salvamentos ?? null,
      ganho: melhor.ganho !== null ? Math.round(melhor.ganho * 10) / 10 : null,
      capa: melhor.extras?.capa ?? null,
      legenda: (melhor.legenda ?? "").replace(/\s+/g, " ").trim().slice(0, 220) || null,
      tema: temaDe(melhor),
      porQue:
        (melhor.ganho !== null ? `A maior interação do período lido, ${vezesTexto(melhor.ganho)} o normal do seu perfil` : "A maior interação do período lido") +
        (como.length ? ` (${como.join(", ")}).` : "."),
    };
  }

  // O QUE RENDE: as barras de 3 posts ou mais, as de cima e a de baixo.
  const oQueRende: string[] = [];
  for (const gr of painel.graficos) {
    const boas = gr.barras.filter((b) => b.posts >= 3 && b.vezes >= 1.3);
    if (boas[0]) oQueRende.push(`${boas[0].nome} rende ${vezesTexto(boas[0].vezes)} o resto do seu perfil (${boas[0].posts} posts).`);
  }
  for (const gr of painel.graficos) {
    const ruim = [...gr.barras].filter((b) => b.posts >= 3 && b.vezes <= 0.7).sort((a, b) => a.vezes - b.vezes)[0];
    if (ruim) oQueRende.push(`${ruim.nome} rende só ${vezesTexto(ruim.vezes)} o resto do seu perfil (${ruim.posts} posts).`);
  }

  const nums = (f: (p: PostParaAchado) => number | null) => posts.map(f).filter((x): x is number => x !== null && x !== undefined);
  return {
    geradoEm: new Date().toISOString(),
    redes,
    nome: extra.nome,
    bio: extra.bio,
    numeros: {
      posts: posts.length,
      porSemana,
      periodoDias,
      medianaVisualizacoes: mediana(nums((p) => (p.visualizacoes && p.visualizacoes > 0 ? p.visualizacoes : null))),
      medianaCurtidas: mediana(nums((p) => p.curtidas)),
      medianaComentarios: mediana(nums((p) => p.comentarios)),
      taxaDeEngajamento: taxa,
      seguidores,
    },
    melhorPost,
    formatos: fatias(posts, (p) => p.formato, (v) => NOME_DO_FORMATO[v] ?? v, g("formatos")),
    temas: fatias(posts, temaDe, (v) => v.charAt(0).toUpperCase() + v.slice(1)),
    tons: fatias(posts, (p) => (et(p).tom ? String(et(p).tom) : null), (v) => NOME_DO_TOM[v] ?? ROTULO_DO_TOM[v] ?? v, g("tom")),
    ganchos: fatias(posts, (p) => (et(p).gancho ? String(et(p).gancho) : null), (v) => NOME_DO_GANCHO[v] ?? v, g("ganchos")),
    graficos: painel.graficos,
    oQueRende: oQueRende.slice(0, 6),
    visual: extra.visual,
    quemE: extra.quemE,
    custo: extra.custo,
  };
}

// ── A leitura de IA: quem é, produto, objetivo, linguagem, cores e estilo ──

const semTravessao = (t: string) => t.replace(/\s*[—–]\s*/g, ", ").trim();
const HEX = /^#[0-9a-f]{6}$/i;

async function baixarImagem(url: string): Promise<{ base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" } | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    const tipo = (r.headers.get("content-type") ?? "").split(";")[0].trim();
    const mediaType = tipo === "image/png" ? "image/png" : tipo === "image/webp" ? "image/webp" : tipo.startsWith("image/jp") ? "image/jpeg" : null;
    if (!mediaType) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 2000 || buf.length > 4_500_000) return null;
    return { base64: buf.toString("base64"), mediaType };
  } catch {
    return null;
  }
}

/**
 * UMA chamada: as legendas (as 15 que mais renderam e as 5 mais novas), a bio e
 * até 6 capas. Devolve o retrato e o visual. Falha não derruba o relatório:
 * os números ficam, o retrato fica para o próximo estudo.
 */
async function lerOPerfil(
  projectId: string,
  posts: Array<PostParaAchado & { legenda: string | null }>,
  perfil: { nome: string | null; bio: string | null; redes: string }
): Promise<{ quemE: QuemE | null; visual: Pick<VisualDoPerfil, "cores" | "estilo"> | null }> {
  const ordenados = [...posts].sort((a, b) => (b.ganho ?? 0) - (a.ganho ?? 0));
  const novos = [...posts].sort((a, b) => (b.publicadoEm?.getTime() ?? 0) - (a.publicadoEm?.getTime() ?? 0)).slice(0, 5);
  const escolhidos = [...new Map([...ordenados.slice(0, 15), ...novos].map((p) => [p.id, p])).values()];
  const legendas = escolhidos
    .map((p, i) => `${i + 1}. [${p.rede}, ${p.formato}${p.ganho !== null ? `, rendeu ${p.ganho.toFixed(1)}x o normal` : ""}] ${(p.legenda ?? "").replace(/\s+/g, " ").slice(0, 380)}`)
    .join("\n");
  const capas: Array<{ base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp"; rotulo: string }> = [];
  for (const p of ordenados) {
    if (capas.length >= CAPAS_NA_LEITURA) break;
    const url = p.extras?.capa;
    if (!url) continue;
    const img = await baixarImagem(url);
    if (img) capas.push({ ...img, rotulo: `Capa ${capas.length + 1} (${p.formato}):` });
  }
  const sistema =
    "Você é o analista de marca de uma plataforma de conteúdo. Lê o perfil de um CLIENTE nas redes para preparar o time de conteúdo dele. Escreve em português do Brasil, frases curtas e concretas, nunca usa travessão (use vírgula, dois-pontos ou parênteses). Não inventa fato: o que não dá para saber pelos posts, diga \"não está claro nos posts\". Responda só com JSON.";
  const pedido = `PERFIL: ${perfil.nome ?? "(sem nome)"} | redes lidas: ${perfil.redes}
BIO: ${perfil.bio ?? "(sem bio)"}

LEGENDAS (as que mais renderam e as mais novas):
${legendas || "(nenhuma legenda)"}

${capas.length ? `As ${capas.length} imagens acima são capas dos posts dele.` : "Sem capas para ver."}

Devolva:
{"pessoa":"quem é, em uma frase (profissão, papel, cidade se aparecer)","produto":"o que vende ou oferece, em uma frase","objetivo":"o que o conteúdo dele tenta conseguir (atrair cliente, vender, autoridade...), em uma frase","publico":"para quem ele fala, em uma frase","linguagem":"como ele escreve e fala: registro, pessoa do discurso, tamanho das frases, emoji, bordões, em duas frases","temas":["4 a 6 temas recorrentes, de 2 a 4 palavras"],"cores":["3 a 5 cores dominantes das capas em hexadecimal #rrggbb, da mais presente para a menos"],"estilo":"o estilo visual das capas em uma ou duas frases (foto, texto, enquadramento, acabamento)"}`;
  try {
    const bruto = capas.length
      ? await askClaudeComImagens(sistema, pedido, capas, { maxTokens: 6000, effort: "low", usage: { projectId, operation: "perfil_proprio_leitura" } })
      : await askClaude(sistema, pedido, { maxTokens: 6000, effort: "low", usage: { projectId, operation: "perfil_proprio_leitura" } });
    const j = JSON.parse(bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1)) as Record<string, unknown>;
    const s = (k: string) => semTravessao(String(j[k] ?? "")).slice(0, 400);
    const quemE: QuemE = {
      pessoa: s("pessoa"),
      produto: s("produto"),
      objetivo: s("objetivo"),
      publico: s("publico"),
      linguagem: s("linguagem"),
      temas: (Array.isArray(j.temas) ? j.temas : []).map((t) => semTravessao(String(t)).slice(0, 60)).filter(Boolean).slice(0, 6),
    };
    const cores = (Array.isArray(j.cores) ? j.cores : []).map((c) => String(c).trim().toLowerCase()).filter((c) => HEX.test(c)).slice(0, 5);
    return { quemE, visual: capas.length ? { cores, estilo: s("estilo") } : null };
  } catch (e) {
    console.warn(`[perfil-proprio][${projectId}] leitura falhou: ${e instanceof Error ? e.message : e}`);
    return { quemE: null, visual: null };
  }
}

/** O custo real de IA desta execução, somado do ai_usage. */
export async function custoDeIaDesde(projectId: string, desde: Date, operacoes: string[]): Promise<number> {
  const r = await prisma.aiUsage.aggregate({ where: { projectId, createdAt: { gte: desde }, operation: { in: operacoes } }, _sum: { costUsd: true } });
  return arred(Number(r._sum.costUsd ?? 0));
}

/**
 * Recalcula o relatório a partir do que já está no banco, SEM coletar nem ler
 * de novo: os números e as distribuições saem dos posts gravados; o retrato
 * (quem é, cores, estilo) e o custo continuam os do último estudo. Serve para
 * quando a conta do relatório muda e o estudo pago já foi feito.
 */
export async function remontarRelatorio(projectId: string): Promise<RelatorioDoPerfil | null> {
  const anterior = await lerRelatorio(projectId);
  if (!anterior) return null;
  const posts = await postsParaAchado({ projectId, perfil: { status: STATUS_DO_PERFIL_PROPRIO } });
  if (!posts.length) return anterior;
  const comArte = posts.filter((p) => et(p).arte?.estilo);
  const visual: VisualDoPerfil | null = anterior.visual
    ? {
        ...anterior.visual,
        artes: fatias(comArte, (p) => String(et(p).arte!.estilo), (v) => ROTULO_DO_ESTILO_DE_ARTE[v] ?? v),
        comRostoPct: comArte.length ? Math.round((comArte.filter((p) => et(p).arte!.rosto).length / comArte.length) * 100) : null,
      }
    : null;
  const r = montarRelatorio(posts, anterior.redes, { nome: anterior.nome, bio: anterior.bio, visual, quemE: anterior.quemE, custo: anterior.custo });
  // A data é a do ESTUDO, não a da conta refeita: dado novo não há, e a sugestão do setup não precisa ser refeita.
  r.geradoEm = anterior.geradoEm;
  await prisma.projectMemory.update({ where: onde(projectId, "relatorio"), data: { value: r as never } });
  return r;
}

// ── O estudo ────────────────────────────────────────────────────────────────

/**
 * Lê as redes do cliente, etiqueta, calcula o rendimento, lê o perfil com IA e
 * grava o relatório. Sempre termina o estado (pronto ou erro com motivo).
 */
export async function rodarEstudoDoPerfil(projectId: string): Promise<RelatorioDoPerfil | null> {
  const inicio = new Date();
  const e: EstadoDoPerfilProprio = (await lerEstadoDoPerfil(projectId)).estado ?? {
    status: "rodando",
    etapa: "coletando",
    pedidoEm: inicio.toISOString(),
    prazoEm: new Date(Date.now() + PRAZO_MS).toISOString(),
    terminadoEm: null,
    erro: null,
    avisos: [],
  };
  const passo = async (etapa: EtapaDoPerfilProprio) => {
    e.etapa = etapa;
    e.prazoEm = new Date(Date.now() + PRAZO_MS).toISOString();
    await gravarEstado(projectId, e);
  };
  try {
    const perfis = await redesDoCliente(projectId);
    if (!perfis.length) throw new Error("sem redes");
    const ligadas = redesLigadas();
    const est = estimarEstudoDoPerfil(perfis.map((p) => p.rede as RedeDeReferencia));
    const mes = await cabeNoMes(est.apifyUsd);
    if (!mes.cabe) {
      e.status = "erro";
      e.erro = "O limite de leitura de perfis deste mês acabou (código REF-MES). O estudo volta a rodar no começo do mês que vem; se precisar antes, abra um chamado com o código.";
      e.terminadoEm = new Date().toISOString();
      await gravarEstado(projectId, e);
      return null;
    }
    const caixa = new Caixa(tetoPorExecucaoUsd());
    const maxItens = maxItensPorPerfil();
    const redes: RedeLidaDoCliente[] = [];
    const avisos: string[] = [];
    let nome: string | null = null;
    let bio: string | null = null;

    await passo("coletando");
    for (const p of perfis) {
      const rede = p.rede as RedeDeReferencia;
      const linha: RedeLidaDoCliente = { rede, perfil: p.perfil, url: p.url, seguidores: p.seguidores, postsNoPerfil: null, lidos: 0, motivo: null };
      redes.push(linha);
      if (!ligadas.includes(rede)) {
        linha.motivo = "a leitura desta rede está desligada no momento (código REF-CFG)";
        continue;
      }
      const r = await coletarReferencia(rede, p.perfil, { maxItens, caixa });
      await prisma.referenciaColeta.create({
        data: { projectId, perfilId: p.id, rede, fonte: r.fonte, itens: r.posts.length, custoUsd: r.custoUsd, status: r.status, erro: r.erro?.slice(0, 300) },
      });
      linha.motivo = motivoDaColeta(rede, r.status, r.erro);
      linha.lidos = await gravarPostsDaColeta(projectId, p.id, rede, r.posts);
      if (r.posts[0]?.seguidoresDoAutor) linha.seguidores = Math.round(r.posts[0].seguidoresDoAutor);
      if (rede === "instagram") {
        const d = await dadosDoInstagram([p.perfil], caixa);
        await prisma.referenciaColeta.create({
          data: { projectId, perfilId: p.id, rede, fonte: `apify:${ATORES.instagramPerfil}`, itens: d.dados.length, custoUsd: d.custoUsd, status: d.dados.length ? "ok" : "erro", erro: d.erro?.slice(0, 300) },
        });
        const x = d.dados[0];
        if (x) {
          linha.seguidores = x.seguidores ?? linha.seguidores;
          linha.postsNoPerfil = x.posts;
          nome = nome ?? x.nome;
          bio = bio ?? [x.bio, x.categoria ? `Categoria: ${x.categoria}` : null, x.site ? `Site: ${x.site}` : null].filter(Boolean).join(" | ");
        }
      }
      await prisma.referenciaPerfil.update({
        where: { id: p.id },
        data: {
          ultimoErro: linha.motivo ? linha.motivo.slice(0, 300) : null,
          ...(r.status === "ok" ? { ultimaColeta: new Date() } : {}),
          ...(linha.seguidores ? { seguidores: linha.seguidores } : {}),
          ...(nome && rede === "instagram" ? { nome } : {}),
        },
      });
      if (linha.motivo) avisos.push(`${rotuloDoPerfil(rede, p.perfil)}: ${linha.motivo}`);
    }
    if (!redes.some((r) => r.lidos > 0)) {
      e.status = "erro";
      e.erro = "Não consegui ler nenhuma das suas redes desta vez. Veja o motivo de cada uma abaixo, confira o @ e tente de novo.";
      e.avisos = avisos.slice(0, 6);
      e.terminadoEm = new Date().toISOString();
      await gravarEstado(projectId, e);
      return null;
    }

    // As etiquetas de forma (gancho, estrutura, chamada, tema) e as novas (tom,
    // recurso, molde, estilo da arte), as mesmas das referências.
    await passo("etiquetando");
    await etiquetarPosts(projectId);
    await etiquetarExtras(projectId);

    // O rendimento: cada post do cliente contra a mediana do próprio perfil.
    const brutos = await prisma.referenciaPost.findMany({
      where: { projectId, perfil: { status: STATUS_DO_PERFIL_PROPRIO } },
      select: { id: true, perfilId: true, formato: true, publicadoEm: true, curtidas: true, comentarios: true, visualizacoes: true, compartilhamentos: true },
    });
    const ganhos = calcularGanhos(brutos);
    for (const b of brutos) await prisma.referenciaPost.update({ where: { id: b.id }, data: { ganho: ganhos.get(b.id) ?? null } });

    await passo("lendo");
    const posts = await postsParaAchado({ projectId, perfil: { status: STATUS_DO_PERFIL_PROPRIO } });
    const leitura = await lerOPerfil(projectId, posts, { nome, bio, redes: redes.filter((r) => r.lidos).map((r) => rotuloDoPerfil(r.rede, r.perfil)).join(", ") });

    // As artes das capas (etiquetas de estilo), contadas pelo código.
    const comArte = posts.filter((p) => et(p).arte?.estilo);
    const visual: VisualDoPerfil | null =
      leitura.visual || comArte.length
        ? {
            cores: leitura.visual?.cores ?? [],
            estilo: leitura.visual?.estilo ?? "",
            artes: fatias(comArte, (p) => String(et(p).arte!.estilo), (v) => ROTULO_DO_ESTILO_DE_ARTE[v] ?? v),
            comRostoPct: comArte.length ? Math.round((comArte.filter((p) => et(p).arte!.rosto).length / comArte.length) * 100) : null,
          }
        : null;

    const apify = await prisma.referenciaColeta.aggregate({ where: { projectId, createdAt: { gte: inicio }, perfilId: { in: perfis.map((p) => p.id) } }, _sum: { custoUsd: true } });
    const custo: CustoDoEstudo = {
      apifyUsd: arred(Number(apify._sum.custoUsd ?? 0)),
      // A gravação do uso é assíncrona: meio segundo para a última chamada (a leitura) entrar na soma.
      iaUsd: await new Promise((ok) => setTimeout(ok, 800)).then(() => custoDeIaDesde(projectId, inicio, OPERACOES_DE_IA_DO_PERFIL)),
      estimado: false,
    };
    const relatorio = montarRelatorio(posts, redes, { nome, bio, visual, quemE: leitura.quemE, custo });
    await prisma.projectMemory.upsert({
      where: onde(projectId, "relatorio"),
      create: { projectId, type: TIPO, key: "relatorio", value: relatorio as never },
      update: { value: relatorio as never },
    });
    console.log(`[perfil-proprio][${projectId}] ${Math.round((Date.now() - inicio.getTime()) / 1000)}s, ${posts.length} posts, Apify US$ ${custo.apifyUsd}, IA US$ ${custo.iaUsd}`);
    e.status = "pronto";
    e.etapa = "pronto";
    e.avisos = avisos.slice(0, 6);
    e.terminadoEm = new Date().toISOString();
    await gravarEstado(projectId, e);
    return relatorio;
  } catch (err) {
    console.error(`[perfil-proprio][${projectId}] falhou em ${e.etapa}:`, err);
    e.status = "erro";
    e.erro = "Não consegui terminar o estudo do seu perfil agora (código REF-PRO). O que já foi lido ficou guardado; tente de novo em alguns minutos e, se repetir, abra um chamado com o código.";
    e.terminadoEm = new Date().toISOString();
    await gravarEstado(projectId, e);
    return null;
  }
}
