import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";
import { ATORES, estimativaDoAtor, rodarAtor } from "@/lib/referencias/apify";
import { Caixa, redesLigadas } from "@/lib/referencias/config";
import { extrasDoInstagram, extrasDoTiktok } from "@/lib/referencias/extras-da-coleta";
import { blocoDasRegrasDoProjeto } from "@/lib/referencias/regras";
import { buscaComGoogle, regraDaBusca, territorioDoProjeto } from "@/lib/research/radar-da-semana";
import { gastoDoMesNasReferencias, tetoDoMesUsd, tetoPorExecucaoUsd } from "@/lib/referencias/tetos";
import type { CenaDoRoteiro, FonteDaIdeia, PapelDaCena } from "@/lib/editorial/tipos";
import type { ExtrasDoPost, ProvaDaTendencia, Tendencia, TendenciasDaSemana } from "@/lib/referencias/tipos-das-analises";

/**
 * AS TENDÊNCIAS DA SEMANA QUE VIRAM IDEIAS (02/10/2026).
 *
 * Pedido do Bruno: "isso gera ideias: essa semana está no hype vídeos com o
 * roteiro (hoje é primeiro de outubro, e já há uns 50 vídeos que usaram a
 * música do Racionais, Diário de um Detento, só o comecinho, com frases do
 * tipo 'esperei o ano inteiro para colocar essa música'). A análise deve fazer
 * esse trabalho, para sugerir temas. É claro, tem que fazer sentido para o
 * nicho, voz e linha de comunicação da pessoa, sempre!"
 *
 * OS SINAIS (uma execução, teto de US$ 0,30 na Apify):
 *   • TikTok, busca de vídeos da ÚLTIMA SEMANA pelos termos do nicho (20
 *     vídeos, US$ 0,005 cada com o filtro de data);
 *   • Instagram, reels das hashtags do nicho (20, US$ 0,0026 cada);
 *   • os posts dos perfis de referência das últimas 3 semanas (já pagos);
 *   • duas buscas no Google (Gemini): o que está em alta nas redes no Brasil
 *     esta semana, e o que está em alta entre criadores do nicho.
 *
 * QUEM CONTA É O CÓDIGO: o modelo agrupa os sinais em tendências e cita os
 * números dos sinais que provam cada uma; quantos vídeos, de quantos
 * criadores, quantas visualizações e os links saem da contagem desses
 * sinais, nunca do texto do modelo. Tendência sem prova válida não entra.
 *
 * O CRUZAMENTO é obrigatório: cada tendência sai com "combina" e o motivo,
 * lendo nicho, público, voz e as regras aprovadas. A que não combina fica na
 * tela como descartada, com o motivo; a que combina vira sugestão de tema com
 * o roteiro na voz do cliente, pronto para levar à linha editorial.
 *
 * DIREITO AUTORAL: a música em alta nunca é embutida no vídeo que a
 * plataforma renderiza. A sugestão manda usar o áudio pela biblioteca da
 * própria rede na hora de publicar (é onde a licença existe).
 */

const TIPO = "tendencia";
const CHAVE = "semana";
/** Uma busca por projeto a cada 24 h: cada uma paga Apify e IA. */
export const INTERVALO_DAS_TENDENCIAS_MS = 24 * 3600_000;

/** O aviso fixo de direito autoral, dito pelo código e não pelo modelo. */
export const AVISO_DO_AUDIO =
  "A música não vai dentro do vídeo que a Demandou entrega: na hora de publicar, escolha esse áudio na biblioteca de áudios do Instagram ou do TikTok, que é onde o uso está licenciado.";

/** Estimativas por item com o filtro de data do TikTok (lidas na tabela da Apify em 02/10). */
const TIKTOK_COM_DATA_POR_ITEM = 0.0037 + 0.0013;
const VIDEOS_DO_TIKTOK = 20;
const REELS_DO_INSTAGRAM = 20;
/** Custo estimado da IA de uma busca (Sonnet 5 no cruzamento; Gemini no Google, quase zero). */
export const CUSTO_IA_DAS_TENDENCIAS_USD = 0.12;

export function estimativaDasTendencias(): { apifyUsd: number; iaUsd: number } {
  const tiktok = 0.001 + VIDEOS_DO_TIKTOK * TIKTOK_COM_DATA_POR_ITEM;
  const instagram = estimativaDoAtor(ATORES.instagramHashtag, REELS_DO_INSTAGRAM);
  return { apifyUsd: Math.round((tiktok + instagram) * 1000) / 1000, iaUsd: CUSTO_IA_DAS_TENDENCIAS_USD };
}

type SinalDeVideo = {
  id: string;
  rede: "tiktok" | "instagram";
  origem: "busca" | "referencia";
  autor: string | null;
  url: string | null;
  visualizacoes: number | null;
  curtidas: number | null;
  publicadoEm: string | null;
  legenda: string;
  audio: ExtrasDoPost["audio"];
  hashtags: string[];
};

type SinalDePagina = { id: string; texto: string; url: string | null; titulo: string | null };

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Os termos da busca paga em PORTUGUÊS (02/10): o território da Demandou tem
 * "LinkedIn strategy" e "content consistency", e a busca por eles trouxe
 * criadores dos Estados Unidos. Fica o que não tem palavra inglesa comum.
 */
export function termosEmPortugues(termos: string[]): string[] {
  const ingles = /\b(strategy|content|personal|branding|growth|tips|creator|creators|business|consistency|marketing|social|media|sales|brand|online)\b/i;
  const saida = termos.filter((t) => t.trim() && !ingles.test(t));
  return [...new Set(saida.length ? saida : termos)];
}
/** Sem travessão e sem a sigla do jargão (na prova de 02/10 a cena dizia "CTA: salve"). */
const semTravessao = (t: string) =>
  t
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\bCTA\b\s*:?\s*/g, "Chamada: ")
    .replace(/\bPOV\b/g, "ponto de vista");

export async function lerTendencias(projectId: string): Promise<TendenciasDaSemana | null> {
  const m = await prisma.projectMemory.findUnique({ where: { projectId_type_key: { projectId, type: TIPO, key: CHAVE } }, select: { value: true } });
  const v = m?.value as unknown as TendenciasDaSemana | undefined;
  return v && Array.isArray(v.itens) ? v : null;
}

async function gravarTendencias(projectId: string, t: TendenciasDaSemana) {
  await prisma.projectMemory.upsert({
    where: { projectId_type_key: { projectId, type: TIPO, key: CHAVE } },
    create: { projectId, type: TIPO, key: CHAVE, value: t as never },
    update: { value: t as never },
  });
}

/** Quando a próxima busca fica liberada (null = já pode). */
export function liberadaEm(t: TendenciasDaSemana | null): Date | null {
  if (!t) return null;
  const quando = new Date(new Date(t.geradaEm).getTime() + INTERVALO_DAS_TENDENCIAS_MS);
  return quando.getTime() > Date.now() ? quando : null;
}

async function videosDoTiktok(termos: string[], caixa: Caixa, avisos: string[], projectId: string): Promise<SinalDeVideo[]> {
  const estimado = 0.001 + VIDEOS_DO_TIKTOK * TIKTOK_COM_DATA_POR_ITEM;
  if (!termos.length || !caixa.cabe(estimado)) return [];
  const busca = termos.slice(0, 2);
  const r = await rodarAtor<Record<string, unknown>>(
    ATORES.tiktok,
    { searchQueries: busca, searchSection: "/video", videoSearchDateFilter: "PAST_WEEK", resultsPerPage: Math.ceil(VIDEOS_DO_TIKTOK / busca.length) },
    { maxItens: VIDEOS_DO_TIKTOK, maxUsd: caixa.teto - caixa.gasto }
  );
  // O filtro de data é cobrado à parte e o custo informado chega atrasado:
  // fica o maior entre o informado e a conta pelos itens entregues.
  const custo = Math.max(r.custoUsd, 0.001 + r.itens.length * TIKTOK_COM_DATA_POR_ITEM);
  caixa.anotar(custo);
  await prisma.referenciaColeta
    .create({ data: { projectId, rede: "tiktok", fonte: "tendencias:tiktok-busca", itens: r.itens.length, custoUsd: custo, status: r.status, erro: r.erro?.slice(0, 300) } })
    .catch(() => {});
  if (r.erro) avisos.push(`TikTok (busca): ${r.erro.slice(0, 120)}`);
  // Só legenda em português (ou sem idioma): em 02/10 a busca por "LinkedIn"
  // trouxe seis criadores em inglês, e a trend virou "dica de LinkedIn em série"
  // dos Estados Unidos. A cobrança é pelo item entregue, então o teto não muda.
  const emPortugues = r.itens.filter((i) => !i.textLanguage || ["pt", "un", ""].includes(String(i.textLanguage)));
  return emPortugues.map((i, k) => {
    const ex = extrasDoTiktok(i);
    const autor = (i.authorMeta as { name?: string } | undefined)?.name ?? null;
    return {
      id: `t${k + 1}`,
      rede: "tiktok" as const,
      origem: "busca" as const,
      autor,
      url: typeof i.webVideoUrl === "string" ? i.webVideoUrl : null,
      visualizacoes: typeof i.playCount === "number" ? i.playCount : null,
      curtidas: typeof i.diggCount === "number" ? i.diggCount : null,
      publicadoEm: typeof i.createTimeISO === "string" ? i.createTimeISO : null,
      legenda: String(i.text ?? "").replace(/\s+/g, " ").slice(0, 220),
      audio: ex.audio,
      hashtags: ex.hashtags ?? [],
    };
  });
}

async function reelsDoInstagram(termos: string[], caixa: Caixa, avisos: string[], projectId: string): Promise<SinalDeVideo[]> {
  const hashtags = termos.map((t) => semAcento(t.toLowerCase()).replace(/[^a-z0-9]/g, "")).filter((h) => h.length >= 4).slice(0, 2);
  const estimado = estimativaDoAtor(ATORES.instagramHashtag, REELS_DO_INSTAGRAM);
  if (!hashtags.length || !caixa.cabe(estimado)) return [];
  const r = await rodarAtor<Record<string, unknown>>(
    ATORES.instagramHashtag,
    { hashtags, resultsType: "reels", resultsLimit: Math.ceil(REELS_DO_INSTAGRAM / hashtags.length) },
    { maxItens: REELS_DO_INSTAGRAM, maxUsd: caixa.teto - caixa.gasto }
  );
  caixa.anotar(r.custoUsd);
  await prisma.referenciaColeta
    .create({ data: { projectId, rede: "instagram", fonte: "tendencias:instagram-hashtag", itens: r.itens.length, custoUsd: r.custoUsd, status: r.status, erro: r.erro?.slice(0, 300) } })
    .catch(() => {});
  if (r.erro) avisos.push(`Instagram (hashtag): ${r.erro.slice(0, 120)}`);
  const umaSemana = Date.now() - 10 * 24 * 3600_000;
  return r.itens
    .filter((i) => typeof i.timestamp !== "string" || new Date(i.timestamp).getTime() > umaSemana)
    .map((i, k) => {
      const ex = extrasDoInstagram(i);
      return {
        id: `i${k + 1}`,
        rede: "instagram" as const,
        origem: "busca" as const,
        autor: typeof i.ownerUsername === "string" ? i.ownerUsername : null,
        url: typeof i.url === "string" ? i.url : null,
        visualizacoes: typeof i.videoPlayCount === "number" ? i.videoPlayCount : typeof i.videoViewCount === "number" ? i.videoViewCount : null,
        curtidas: typeof i.likesCount === "number" && i.likesCount >= 0 ? i.likesCount : null,
        publicadoEm: typeof i.timestamp === "string" ? i.timestamp : null,
        legenda: String(i.caption ?? "").replace(/\s+/g, " ").slice(0, 220),
        audio: ex.audio,
        hashtags: ex.hashtags ?? [],
      };
    });
}

/** Os posts dos perfis de referência das últimas 3 semanas (já pagos, custo zero). */
async function videosDasReferencias(projectId: string): Promise<SinalDeVideo[]> {
  const desde = new Date(Date.now() - 21 * 24 * 3600_000);
  const posts = await prisma.referenciaPost.findMany({
    where: { projectId, rede: { in: ["instagram", "tiktok"] }, publicadoEm: { gte: desde }, perfil: { status: "confirmado" } },
    select: { rede: true, url: true, visualizacoes: true, curtidas: true, publicadoEm: true, legenda: true, extras: true, perfil: { select: { perfil: true } } },
    orderBy: { publicadoEm: "desc" },
    take: 40,
  });
  return posts.map((p, k) => {
    const ex = (p.extras ?? {}) as ExtrasDoPost;
    return {
      id: `r${k + 1}`,
      rede: p.rede as "tiktok" | "instagram",
      origem: "referencia" as const,
      autor: p.perfil.perfil,
      url: p.url,
      visualizacoes: p.visualizacoes,
      curtidas: p.curtidas,
      publicadoEm: p.publicadoEm?.toISOString() ?? null,
      legenda: (p.legenda ?? "").replace(/\s+/g, " ").slice(0, 220),
      audio: ex.audio ?? null,
      hashtags: ex.hashtags ?? [],
    };
  });
}

/**
 * As buscas no Google (Gemini com busca). Medido em 02/10: o pedido genérico
 * ("o que está em alta nas redes") volta com trend dos Estados Unidos ou com
 * nada; o que achou a trend do Racionais de 1º de outubro, com o número ("quase
 * 1 milhão de acessos") e o link, foi perguntar PELO DIA ("o que os
 * brasileiros postaram por causa do dia 1 de outubro"). Por isso são três
 * tipos de busca: as trends brasileiras da semana, as do nicho, e uma por dia
 * (anteontem, ontem e hoje). Página sem link não conta como prova.
 */
async function paginasDoGoogle(assunto: string, publico: string, avisos: string[]): Promise<SinalDePagina[]> {
  const chave = process.env.GEMINI_API_KEY;
  if (!chave) {
    avisos.push("GEMINI_API_KEY ausente: sem busca no Google");
    return [];
  }
  const hoje = new Date();
  const dia = (k: number) => new Date(hoje.getTime() + k * 86400_000).toLocaleDateString("pt-BR", { day: "numeric", month: "long", timeZone: "America/Sao_Paulo" });
  const formato = "- NOME DA TREND | COMO AS PESSOAS USAM (o roteiro que se repete) | NÚMERO OU QUEM USOU, SÓ SE A PÁGINA DISSER";
  const pedidos = [
    `${regraDaBusca(hoje, 14)}
Pesquise "trends do TikTok essa semana" e "áudios em alta no Reels" em sites brasileiros. Quais trends, áudios e memes estão em alta entre criadores BRASILEIROS no Instagram e no TikTok nesta semana? Ignore o que só existe fora do Brasil. Até 8 itens no formato: ${formato}`,
    `${regraDaBusca(hoje, 14)}
Trends, formatos e memes que estão em alta NESTAS DUAS SEMANAS entre criadores brasileiros de conteúdo sobre ${assunto} para ${publico} (Instagram, TikTok, LinkedIn e YouTube Shorts). Até 6 itens no formato: ${formato}`,
    ...[-2, -1, 0].map(
      (k) =>
        `${regraDaBusca(hoje, 10)}
Pesquise "${dia(k)} trend" e "música que viraliza todo ano em ${dia(k)}" em sites brasileiros. O que os brasileiros postaram nas redes por causa do dia ${dia(k)} deste ano (música cujo verso cita a data, meme da data, data comemorativa que virou trend)? Até 3 itens no formato: ${formato}`
    ),
  ];
  // Uma segunda tentativa para a busca que voltou vazia: o Gemini com busca às
  // vezes devolve nada para o mesmo pedido que, repetido, traz itens (medido em
  // 01/10 na linha editorial e de novo em 02/10 nas buscas por dia).
  const buscar = async (p: string) => {
    const primeira = await buscaComGoogle(p, chave, "radar", 21);
    return primeira.itens.some((i) => i.fonte?.url) ? primeira : buscaComGoogle(p, chave, "radar", 21);
  };
  const r = await Promise.allSettled(pedidos.map(buscar));
  const vistos = new Set<string>();
  const itens = r
    .flatMap((x) => (x.status === "fulfilled" ? x.value.itens : []))
    // Página sem link não prova nada para o cliente; a mesma trend em duas buscas entra uma vez.
    .filter((i) => i.fonte?.url && !vistos.has(i.texto.slice(0, 40).toLowerCase()) && vistos.add(i.texto.slice(0, 40).toLowerCase()));
  if (!itens.length) avisos.push("a busca no Google não trouxe tendências com fonte desta vez");
  return itens.slice(0, 16).map((i, k) => ({ id: `g${k + 1}`, texto: i.texto.slice(0, 380), url: i.fonte?.url ?? null, titulo: i.fonte?.titulo ?? null }));
}

/** O áudio que aparece em vídeos de criadores diferentes: a pista mais forte de trend. Puro. */
export function audiosRepetidos(videos: SinalDeVideo[]): Array<{ nome: string; autor: string | null; ids: string[]; criadores: number }> {
  const grupos = new Map<string, { nome: string; autor: string | null; ids: string[]; autores: Set<string> }>();
  for (const v of videos) {
    if (!v.audio || v.audio.original) continue;
    const chave = v.audio.id ?? semAcento(`${v.audio.nome}|${v.audio.autor ?? ""}`.toLowerCase());
    const g = grupos.get(chave) ?? { nome: v.audio.nome, autor: v.audio.autor, ids: [], autores: new Set<string>() };
    g.ids.push(v.id);
    if (v.autor) g.autores.add(v.autor.toLowerCase());
    grupos.set(chave, g);
  }
  return [...grupos.values()]
    .filter((g) => g.autores.size >= 2)
    .map((g) => ({ nome: g.nome, autor: g.autor, ids: g.ids, criadores: g.autores.size }))
    .sort((a, b) => b.criadores - a.criadores);
}

function numero(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} milhões`;
  if (n >= 10_000) return `${Math.round(n / 1000).toLocaleString("pt-BR")} mil`;
  return Math.round(n).toLocaleString("pt-BR");
}

/** A evidência contada pelo código a partir das provas citadas. Pura. */
export function contarEvidencia(ids: string[], videos: SinalDeVideo[], paginas: SinalDePagina[]): { evidencia: Tendencia["evidencia"]; provas: ProvaDaTendencia[] } {
  const vs = videos.filter((v) => ids.includes(v.id));
  const ps = paginas.filter((p) => ids.includes(p.id) && p.url);
  const autores = new Set(vs.map((v) => (v.autor ?? v.id).toLowerCase()));
  const visualizacoes = vs.reduce((s, v) => s + (v.visualizacoes ?? 0), 0);
  const partes: string[] = [];
  if (vs.length) {
    partes.push(
      `${vs.length} ${vs.length === 1 ? "vídeo" : "vídeos"} de ${autores.size} ${autores.size === 1 ? "criador" : "criadores"} entre os ${videos.length} vídeos recentes que olhamos${visualizacoes ? `, somando ${numero(visualizacoes)}${visualizacoes >= 1_000_000 ? " de" : ""} visualizações` : ""}`
    );
  }
  if (ps.length) partes.push(`${ps.length} ${ps.length === 1 ? "página fala" : "páginas falam"} dela nesta semana`);
  const provas: ProvaDaTendencia[] = [
    ...[...vs]
      .sort((a, b) => (b.visualizacoes ?? 0) - (a.visualizacoes ?? 0))
      .slice(0, 4)
      .map((v) => ({ tipo: "video" as const, rede: v.rede, autor: v.autor, url: v.url, visualizacoes: v.visualizacoes, publicadoEm: v.publicadoEm })),
    ...ps.slice(0, 3).map((p) => ({ tipo: "pagina" as const, url: p.url, titulo: p.titulo ?? p.texto.slice(0, 80) })),
  ];
  return {
    evidencia: { videos: vs.length, autores: autores.size, visualizacoes, paginas: ps.length, amostra: videos.length, frase: partes.join("; ") },
    provas,
  };
}

type TendenciaDoModelo = {
  nome?: string;
  tipo?: string;
  oQueE?: string;
  provas?: string[];
  audio?: { nome?: string; autor?: string | null } | null;
  combina?: boolean;
  motivo?: string;
  sugestao?: {
    tema?: string;
    formato?: string;
    redes?: string[];
    abertura?: string;
    cenas?: Array<{ papel?: string; fala?: string; naTela?: string }>;
    comoUsarOAudio?: string | null;
    cuidado?: string | null;
  } | null;
};

const PAPEIS: PapelDaCena[] = ["gancho", "desenvolvimento", "fechamento"];

/**
 * A busca da semana. Grava em ProjectMemory (tipo "tendencia", chave
 * "semana") e devolve. `caixa`: o teto desta execução (US$ 0,30).
 */
export async function buscarTendencias(projectId: string, opcoes: { forcar?: boolean } = {}): Promise<TendenciasDaSemana> {
  const anterior = await lerTendencias(projectId);
  if (!opcoes.forcar && liberadaEm(anterior)) return anterior!;
  const avisos: string[] = [];
  const p = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { name: true, niche: true, targetAudience: true, voice: true } });
  const t = await territorioDoProjeto(projectId, p.niche ?? "negócios", p.targetAudience ?? "empresários");
  const termos = termosEmPortugues([...(t.termosX ?? []), ...t.subtemas]);
  const ligadas = redesLigadas();

  // O teto do mês vale ANTES de gastar: passou, só as fontes de custo zero.
  const gastoDoMes = await gastoDoMesNasReferencias();
  const estimado = estimativaDasTendencias().apifyUsd;
  const podeGastar = gastoDoMes + estimado <= tetoDoMesUsd();
  if (!podeGastar) avisos.push(`teto do mês na Apify (US$ ${tetoDoMesUsd().toFixed(2)}) atingido: só o Google e as referências desta vez`);
  const caixa = new Caixa(podeGastar ? tetoPorExecucaoUsd() : 0);

  const [tiktok, instagram, referencias, paginas] = await Promise.all([
    podeGastar && ligadas.includes("tiktok") ? videosDoTiktok(termos, caixa, avisos, projectId) : Promise.resolve([] as SinalDeVideo[]),
    podeGastar && ligadas.includes("instagram") ? reelsDoInstagram(termos, caixa, avisos, projectId) : Promise.resolve([] as SinalDeVideo[]),
    videosDasReferencias(projectId),
    paginasDoGoogle(t.assunto, t.publico, avisos),
  ]);
  const videos = [...tiktok, ...instagram, ...referencias];
  const repetidos = audiosRepetidos(videos);

  const regras = await blocoDasRegrasDoProjeto(projectId, ["roteiro", "redacao"]);
  const hoje = new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
  const listaDeVideos = videos
    .map(
      (v) =>
        `[${v.id}] ${v.rede}${v.origem === "referencia" ? " (perfil de referência)" : ""}, @${v.autor ?? "?"}, ${v.visualizacoes ? `${numero(v.visualizacoes)} visualizações, ` : ""}${v.publicadoEm?.slice(0, 10) ?? ""}; áudio: ${
          v.audio ? (v.audio.original ? "voz original" : `"${v.audio.nome}"${v.audio.autor ? ` de ${v.audio.autor}` : ""}`) : "?"
        }; legenda: ${v.legenda}`
    )
    .join("\n");
  const listaDePaginas = paginas.map((g) => `[${g.id}] ${g.texto}${g.titulo ? ` (fonte: ${g.titulo})` : ""}`).join("\n");
  const listaDeAudios = repetidos.map((a) => `- "${a.nome}"${a.autor ? ` de ${a.autor}` : ""}: ${a.criadores} criadores (${a.ids.join(", ")})`).join("\n");

  const sistema =
    "Você é o Roberto, estrategista da linha editorial da Demandou. Lê os sinais da semana nas redes, acha as TENDÊNCIAS (o que se repete em muitos vídeos ou o que as páginas dizem estar em alta) e decide, para UM cliente, quais combinam com o nicho, a voz e a linha dele. Nunca use travessão: use vírgula, dois-pontos ou parênteses. Nunca invente número nem fonte: a prova de cada tendência é a lista de ids dos sinais. Não use sigla sem explicar (POV vira \"ponto de vista\"). Responda só com JSON.";
  const pedido = `HOJE: ${hoje}

CLIENTE: ${p.name}
NICHO: ${(p.niche ?? "").slice(0, 700)}
PÚBLICO: ${(p.targetAudience ?? "").slice(0, 500)}
VOZ E LINHA DE COMUNICAÇÃO: ${(p.voice ?? "").slice(0, 1500)}${regras}

VÍDEOS RECENTES (busca da semana nas redes e perfis de referência):
${listaDeVideos || "(nenhum)"}

ÁUDIOS QUE APARECEM EM VÍDEOS DE CRIADORES DIFERENTES (contado pelo sistema):
${listaDeAudios || "(nenhum)"}

PÁGINAS DA SEMANA (Google):
${listaDePaginas || "(nenhuma)"}

Ache até 8 tendências desta semana: áudio ou música em alta, formato de meme, roteiro que se repete em vários vídeos, data do dia que virou trend. Para cada uma:
- "provas": os ids dos sinais que provam (pelo menos 2 vídeos de criadores diferentes, ou 1 página). Sem prova, não liste.
- "combina": true só se fizer sentido para o nicho, o público e a VOZ deste cliente; false se não combinar (tema sensível para brincar, humor que a voz não tem, assunto fora do nicho, público errado). "motivo": a razão em uma ou duas frases.
- se combina, "sugestao": o tema adaptado ao nicho, o formato ("reel", "tiktok", "carrossel" ou "story"), as redes, a "abertura" (a primeira frase do jeito que o cliente fala) e de 3 a 5 "cenas" ({"papel":"gancho|desenvolvimento|fechamento","fala":"o que a pessoa diz","naTela":"o que aparece"}), na voz do cliente e com o MOLDE da tendência, nunca a frase ou o caso de quem fez. Nunca invente número, prazo ou resultado na fala: onde um número ajudaria, escreva [DADO: o que o cliente deve medir ou contar]. Se a tendência é de música ou áudio, "comoUsarOAudio" diz em que momento do vídeo o áudio entra e que ele é escolhido na biblioteca da rede ao publicar (o vídeo sai daqui sem a música). "cuidado": o risco, se houver (ex.: a música fala de um tema trágico, não fazer piada com ele).
- "audio": {"nome","autor"} quando a tendência é um áudio.

Responda {"tendencias":[{"nome":"...","tipo":"audio|meme|roteiro|formato|data","oQueE":"como as pessoas estão usando","provas":["t1","t4","g2"],"audio":null,"combina":true,"motivo":"...","sugestao":{"tema":"...","formato":"reel","redes":["instagram","tiktok"],"abertura":"...","cenas":[{"papel":"gancho","fala":"...","naTela":"..."}],"comoUsarOAudio":null,"cuidado":null}}]}`;

  let lidas: TendenciaDoModelo[] = [];
  if (videos.length || paginas.length) {
    const bruto = await askClaude(sistema, pedido, { maxTokens: 16000, effort: "medium", usage: { projectId, operation: "referencias_tendencias" } });
    try {
      lidas = (JSON.parse(bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1)) as { tendencias?: TendenciaDoModelo[] }).tendencias ?? [];
    } catch {
      avisos.push("a leitura das tendências voltou fora do formato");
    }
  } else {
    avisos.push("nenhum sinal desta semana para ler");
  }

  const itens: Tendencia[] = [];
  for (const l of lidas) {
    const ids = (Array.isArray(l.provas) ? l.provas : []).map(String);
    const { evidencia, provas } = contarEvidencia(ids, videos, paginas);
    // A régua da prova, conferida no código: 2 vídeos de criadores diferentes, ou uma página.
    if (evidencia.autores < 2 && evidencia.paginas < 1) continue;
    const nome = semTravessao(String(l.nome ?? "")).slice(0, 120);
    if (!nome) continue;
    const s = l.combina ? l.sugestao : null;
    const cenas: CenaDoRoteiro[] = (s?.cenas ?? [])
      .filter((c) => c && typeof c.fala === "string" && c.fala.trim())
      .slice(0, 6)
      .map((c, i) => ({
        id: `c${i + 1}`,
        papel: PAPEIS.includes(c.papel as PapelDaCena) ? (c.papel as PapelDaCena) : i === 0 ? "gancho" : "desenvolvimento",
        fala: semTravessao(String(c.fala)).slice(0, 600),
        naTela: semTravessao(String(c.naTela ?? "")).slice(0, 300),
      }));
    const audio = l.audio && typeof l.audio.nome === "string" && l.audio.nome.trim() ? { nome: l.audio.nome.slice(0, 120), autor: l.audio.autor ? String(l.audio.autor).slice(0, 80) : null } : null;
    itens.push({
      id: randomUUID(),
      nome,
      tipo: ["audio", "meme", "roteiro", "formato", "data"].includes(String(l.tipo)) ? String(l.tipo) : "formato",
      oQueE: semTravessao(String(l.oQueE ?? "")).slice(0, 500),
      evidencia,
      provas,
      audio,
      combina: Boolean(l.combina) && Boolean(s) && cenas.length > 0,
      motivo: semTravessao(String(l.motivo ?? "")).slice(0, 400),
      sugestao:
        l.combina && s && cenas.length
          ? {
              tema: semTravessao(String(s.tema ?? nome)).slice(0, 160),
              formato: String(s.formato ?? "reel").slice(0, 20),
              redes: (Array.isArray(s.redes) ? s.redes : []).map(String).slice(0, 4),
              abertura: semTravessao(String(s.abertura ?? cenas[0].fala)).slice(0, 240),
              cenas,
              comoUsarOAudio: audio || s.comoUsarOAudio ? `${s.comoUsarOAudio ? `${semTravessao(String(s.comoUsarOAudio)).slice(0, 300)} ` : ""}${AVISO_DO_AUDIO}` : null,
              cuidado: s.cuidado ? semTravessao(String(s.cuidado)).slice(0, 300) : null,
            }
          : null,
      roteiroId: null,
    });
  }
  // As que combinam primeiro; dentro de cada lado, a mais provada.
  itens.sort((a, b) => Number(b.combina) - Number(a.combina) || b.evidencia.autores + b.evidencia.paginas - (a.evidencia.autores + a.evidencia.paginas));

  const custoUsd = Math.round((caixa.gasto + (lidas.length || videos.length ? CUSTO_IA_DAS_TENDENCIAS_USD : 0)) * 1000) / 1000;
  const resultado: TendenciasDaSemana = {
    geradaEm: new Date().toISOString(),
    itens,
    sinais: { videos: videos.length, paginas: paginas.length },
    custoUsd,
    avisos: [...new Set(avisos)].slice(0, 6),
  };
  await gravarTendencias(projectId, resultado);
  return resultado;
}

/**
 * Leva uma sugestão para a linha editorial: vira um roteiro PRONTO (com as
 * cenas), de origem "tendência da semana", para o cliente editar e gravar.
 */
export async function levarParaALinha(projectId: string, userId: string, tendenciaId: string): Promise<{ roteiroId: string }> {
  const semana = await lerTendencias(projectId);
  const t = semana?.itens.find((i) => i.id === tendenciaId);
  if (!semana || !t) throw new Error("Essa tendência não está mais na lista desta semana.");
  if (t.roteiroId) return { roteiroId: t.roteiroId };
  if (!t.combina || !t.sugestao) throw new Error("Essa tendência foi descartada para o seu nicho, então não tem roteiro.");
  const s = t.sugestao;
  const fonte: FonteDaIdeia = {
    origem: "tendencia",
    titulo: t.nome,
    url: t.provas.find((p) => p.url)?.url ?? undefined,
    angulo: t.oQueE.slice(0, 300),
    abertura: s.abertura,
  };
  const segundos = s.cenas.reduce((n, c) => n + Math.max(2, Math.round(c.fala.split(/\s+/).length / 2.4)), 0);
  const r = await prisma.roteiro.create({
    data: {
      projectId,
      userId,
      status: "pronto",
      titulo: s.tema,
      gancho: [`Tendência da semana: ${t.nome}. ${t.evidencia.frase}.`, s.comoUsarOAudio ?? "", s.cuidado ? `Cuidado: ${s.cuidado}` : ""].filter(Boolean).join(" ").slice(0, 600),
      fonte: fonte as never,
      tese: t.motivo,
      cenas: s.cenas as never,
      duracao: segundos <= 70 ? 60 : 180,
    },
    select: { id: true },
  });
  t.roteiroId = r.id;
  await gravarTendencias(projectId, semana);
  return { roteiroId: r.id };
}
