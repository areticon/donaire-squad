import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";
import { oQueSeFalaNoX, resumoDoX, type PostDoX } from "@/lib/research/x-search";
import type { OrigemDaIdeia } from "@/lib/editorial/tipos";

/**
 * O RADAR DA SEMANA E A MEMÓRIA DO QUE JÁ FOI (28/09).
 *
 * Queixa do Bruno: "a campanha dessa semana está exatamente igual, ou muito
 * parecida da semana passada, a IA sugeriu os mesmos temas, não pegou nenhuma
 * novidade, nada do hype do momento". Medido nas duas campanhas: "as 7 horas
 * de Priestley", "quanto custa cada caminho (R$ 300 a hora)" e "a terceira
 * semana" nas duas. Quatro causas somadas:
 *
 *   1. MEMÓRIA CURTA. O sugeridor via os últimos 5 posts, 60 caracteres cada:
 *      um dia só, em cinco redes. As semanas anteriores não existiam para ele.
 *   2. OS DOCUMENTOS MANDAVAM. A regra dizia que os números dos documentos da
 *      marca "valem mais que tendência", e eles são os mesmos toda semana.
 *   3. A TENDÊNCIA ERA UMA PERGUNTA GENÉRICA ("o que está em alta no nicho"),
 *      sem janela de datas, e o nicho da Demandou é a própria categoria.
 *   4. A ORDEM. O tema era escolhido antes, e a pesquisa do Roberto só
 *      aprofundava o tema escolhido: novidade não tinha por onde entrar.
 *
 * Aqui mora o que corrige 1 e 3: a lista do que o projeto já publicou nas
 * últimas oito semanas, e um radar de novidades dos últimos 14 dias no mundo
 * do PÚBLICO (não só do nicho), com fonte e data, guardado por seis horas
 * para o "outro tema" de um dia só não pagar a busca de novo.
 */

const SEIS_HORAS_MS = 6 * 60 * 60 * 1000;

/** Os temas que o projeto já usou, das campanhas das últimas `semanas`. */
export async function temasJaUsados(projectId: string, semanas = 8): Promise<string[]> {
  const desde = new Date(Date.now() - semanas * 7 * 24 * 3600_000);
  const runs = await prisma.pipelineRun.findMany({
    where: { projectId, startedAt: { gte: desde } },
    orderBy: { startedAt: "desc" },
    take: 30,
    select: { topic: true, config: true },
  });
  const temas: string[] = [];
  for (const r of runs) {
    const porDia = ((r.config ?? {}) as { topicsPerDay?: Record<string, string> }).topicsPerDay ?? {};
    const doDia = Object.values(porDia).filter((t) => typeof t === "string" && t.trim());
    if (doDia.length) temas.push(...doDia);
    else if (r.topic) temas.push(r.topic);
  }
  // Sem repetidos e sem o que é curto demais para dizer alguma coisa.
  return [...new Set(temas.map((t) => t.trim()))].filter((t) => t.length > 15).slice(0, 60);
}

const PALAVRAS_VAZIAS = new Set(
  "para como porque quando onde qual quais sobre entre depois antes ainda mesmo muito mais menos voce voces seus suas este esta esse essa isso aqui cada todo toda todos todas nunca sempre tambem pelo pela pelos pelas numa num uma umas uns dos das nos nas que com sem por ele ela eles elas quem tem ter sao esta estao foi ser vai fazer faz feito".split(
    " "
  )
);

function semAcento(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** As palavras que carregam o assunto, em ordem, sem acento e sem as vazias. */
function palavrasDoAssunto(tema: string): string[] {
  return semAcento(tema.toLowerCase())
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((p) => (p.length >= 4 || /^\d+$/.test(p)) && !PALAVRAS_VAZIAS.has(p));
}

/**
 * AS ÂNCORAS de um tema: o que faz dois temas serem o mesmo assunto mesmo
 * escritos com palavras diferentes.
 *
 *   • número com a palavra seguinte ("7 horas", "300 hora"), menos anos;
 *   • nome próprio no meio da frase ("Priestley");
 *   • pares de palavras do assunto ("terceira semana", "quanto custa").
 */
function ancoras(tema: string): Set<string> {
  const saida = new Set<string>();
  const cru = semAcento(tema).replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  cru.forEach((p, i) => {
    if (/^\d+$/.test(p) && !/^(19|20)\d\d$/.test(p) && cru[i + 1]) saida.add(`n:${p} ${cru[i + 1].toLowerCase()}`);
    if (i > 0 && /^[A-Z][a-z]{3,}$/.test(p)) saida.add(`p:${p.toLowerCase()}`);
  });
  const ps = palavrasDoAssunto(tema).filter((p) => !/^\d+$/.test(p));
  for (let i = 0; i + 1 < ps.length; i++) saida.add(`b:${ps[i]} ${ps[i + 1]}`);
  return saida;
}

/**
 * O quanto dois temas são o mesmo assunto, de 0 a 1: a sobreposição das
 * palavras do assunto medida pelo tema MENOR, e 1 quando dividem uma âncora.
 *
 * A primeira versão (Jaccard puro) foi medida contra as duas campanhas reais
 * e não pegou nenhuma repetição: "quanto custa cada caminho" deu 0,25 e "as 7
 * horas" deu 0,04, porque o tema longo dilui o que tem em comum. Âncora e
 * tema menor são o que um leitor percebe como "é o mesmo post".
 */
export function parecenca(a: string, b: string): number {
  const A = ancoras(a);
  for (const x of ancoras(b)) if (A.has(x)) return 1;
  const PA = new Set(palavrasDoAssunto(a));
  const PB = new Set(palavrasDoAssunto(b));
  if (PA.size === 0 || PB.size === 0) return 0;
  let comum = 0;
  for (const p of PA) if (PB.has(p)) comum++;
  return comum / Math.min(PA.size, PB.size);
}
export const LIMITE_DE_PARECENCA = 0.4;

/** O tema já usado mais parecido com este, se passar do limite. */
export function repeteAlgum(tema: string, usados: string[]): string | null {
  let pior: { t: string; p: number } | null = null;
  for (const u of usados) {
    const p = parecenca(tema, u);
    if (p >= LIMITE_DE_PARECENCA && (!pior || p > pior.p)) pior = { t: u, p };
  }
  return pior?.t ?? null;
}

/**
 * De onde veio uma pauta (01/10). A linha editorial mostra a origem em cada
 * ideia, e o sorteio de cada rodada mistura origens para não sair tudo do
 * mesmo lugar.
 */
export type OrigemDaPauta = OrigemDaIdeia;

/** Um fato solto do radar, com a fonte própria (e não a lista de fontes da busca inteira). */
export type ItemDaPauta = {
  /** Impressão do texto: a mesma notícia em duas buscas vira o mesmo item. */
  id: string;
  origem: OrigemDaPauta;
  texto: string;
  fonte?: { titulo: string; url: string } | null;
};

export type Radar = {
  texto: string;
  fontes: Array<{ titulo: string; url: string }>;
  geradoEm: string;
  /** Os fatos um a um, desde 01/10. Radar guardado antes disso não tem. */
  itens?: ItemDaPauta[];
};

/** Impressão curta de um texto, sem acento, caixa e pontuação. */
export function impressao(texto: string): string {
  const base = semAcento(texto.toLowerCase()).replace(/[^a-z0-9]+/g, " ").trim().slice(0, 160);
  let h = 5381;
  for (let i = 0; i < base.length; i++) h = ((h << 5) + h + base.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

type RespostaDoGemini = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    groundingMetadata?: {
      groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
      groundingSupports?: Array<{ segment?: { text?: string }; groundingChunkIndices?: number[] }>;
    };
  }>;
};

const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/**
 * A data no começo de um fato ("30 de setembro de 2026 | ...", "04/03/2026",
 * "fevereiro de 2026"). Existe porque o Gemini não respeita a janela pedida:
 * em 01/10 o radar de "últimos 14 dias" trouxe guia de março e notícia de
 * fevereiro de 2025. Sem ano, devolve null (data futura de calendário).
 */
export function dataDoFato(texto: string): Date | null {
  const cabeca = semAcento(texto.split(" | ")[0].toLowerCase());
  let m = cabeca.match(/(\d{1,2}) de ([a-z]+) de (\d{4})/);
  if (m && MESES.includes(m[2])) return new Date(Number(m[3]), MESES.indexOf(m[2]), Number(m[1]));
  m = cabeca.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  m = cabeca.match(/([a-z]+) de (\d{4})/);
  if (m && MESES.includes(m[1])) return new Date(Number(m[2]), MESES.indexOf(m[1]), 15);
  m = cabeca.match(/^(?:em )?((?:19|20)\d\d)$/);
  if (m) return new Date(Number(m[1]), 6, 1);
  return null;
}

/**
 * Corta a resposta da busca em fatos, um por marcador, e casa cada fato com a
 * fonte que o próprio Google apontou para aquele trecho (groundingSupports).
 * Antes (até 01/10) a ideia recebia a primeira fonte da busca inteira, que
 * podia ser de outro fato.
 */
function itensDaResposta(texto: string, d: RespostaDoGemini, origem: OrigemDaPauta, maxDias?: number): ItemDaPauta[] {
  const c = d.candidates?.[0];
  const pedacos = c?.groundingMetadata?.groundingChunks ?? [];
  const apoios = c?.groundingMetadata?.groundingSupports ?? [];
  const blocos: string[] = [];
  for (const linha of texto.split(/\r?\n/)) {
    const l = linha.trim();
    if (!l) continue;
    if (/^([*•-]|\d+[.)])\s+/.test(l) || l.includes(" | ")) blocos.push(l);
    else if (blocos.length && /^\s/.test(linha)) blocos[blocos.length - 1] += ` ${l}`;
  }
  const itens: ItemDaPauta[] = [];
  for (const bruto of blocos) {
    const limpo = bruto.replace(/^([*•-]|\d+[.)])\s+/, "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
    if (limpo.length < 25 || /^nada novo/i.test(limpo)) continue;
    // Fato com data mais velha que a janela não entra (sem data, entra).
    const quando = maxDias ? dataDoFato(limpo) : null;
    if (quando && maxDias && Date.now() - quando.getTime() > maxDias * 24 * 3600_000) continue;
    let fonte: ItemDaPauta["fonte"] = null;
    for (const a of apoios) {
      const trecho = (a.segment?.text ?? "").replace(/\*\*/g, "").trim().slice(0, 50);
      if (trecho.length < 12 || !limpo.includes(trecho)) continue;
      const web = pedacos[a.groundingChunkIndices?.[0] ?? -1]?.web;
      if (web?.uri) {
        fonte = { titulo: web.title ?? web.uri, url: web.uri };
        break;
      }
    }
    itens.push({ id: impressao(limpo), origem, texto: limpo.slice(0, 420), fonte });
  }
  return itens;
}

/** Uma busca no Google pelo Gemini. Exportada para as fontes da linha editorial. */
export async function buscaComGoogle(
  prompt: string,
  chave: string,
  origem: OrigemDaPauta = "radar",
  /** Descarta o fato cuja data passe desta idade. */
  maxDias?: number
): Promise<{ texto: string; fontes: Array<{ titulo: string; url: string }>; itens: ItemDaPauta[] }> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${chave}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tools: [{ googleSearch: {} }],
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2200, thinkingConfig: { thinkingBudget: 0 } },
      }),
      signal: AbortSignal.timeout(45_000),
    }
  ).catch(() => null);
  if (!res?.ok) return { texto: "", fontes: [], itens: [] };
  const d = (await res.json().catch(() => ({}))) as RespostaDoGemini;
  const c = d.candidates?.[0];
  const texto = (c?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  return {
    texto,
    fontes: (c?.groundingMetadata?.groundingChunks ?? [])
      .filter((g) => g.web?.uri)
      .map((g) => ({ titulo: g.web!.title ?? g.web!.uri!, url: g.web!.uri! })),
    itens: itensDaResposta(texto, d, origem, maxDias),
  };
}

/**
 * O TERRITÓRIO DO PROJETO EM POUCAS PALAVRAS (01/10).
 *
 * O nicho e o público são parágrafos (o da Demandou tem 600 caracteres), e o
 * radar colava os dois inteiros na pergunta ao Google. Medido em 01/10: o
 * Gemini transformava isso em consultas de 20 palavras entre aspas, mais as
 * datas da janela escritas por extenso ("17 setembro 2026 hoje"), e o Google
 * devolvia zero resultado. As quatro buscas do radar voltaram "nada novo" e a
 * linha editorial ficou só com seis posts do X de contas de 282 seguidores.
 *
 * Aqui o Haiku resume uma vez: o assunto, o público e de 6 a 8 subtemas de
 * 2 a 4 palavras. Fica guardado até o nicho ou o público mudarem.
 */
export type Territorio = {
  assunto: string;
  publico: string;
  subtemas: string[];
  /**
   * Termos de 1 ou 2 palavras para a busca do X. Os subtemas são longos
   * demais para o X: em 01/10, "Construção de autoridade online" entre aspas
   * não casou com nenhum post de conta com plateia.
   */
  termosX?: string[];
};

export async function territorioDoProjeto(projectId: string, nicho: string, publico: string): Promise<Territorio> {
  const base = impressao(`${nicho}|${publico}`);
  const guardado = await prisma.projectMemory
    .findUnique({ where: { projectId_type_key: { projectId, type: "radar", key: "territorio" } }, select: { value: true } })
    .catch(() => null);
  const g = guardado?.value as (Territorio & { base?: string }) | undefined;
  if (g?.base === base && g.assunto && g.subtemas?.length && g.termosX?.length) return g;

  const reserva: Territorio = { assunto: nicho.slice(0, 90), publico: publico.slice(0, 70), subtemas: [] };
  try {
    const bruto = await askClaude(
      "Você resume o território de conteúdo de uma empresa em termos que funcionam numa busca do Google. Responda só com JSON.",
      `NICHO: """${nicho.slice(0, 1500)}"""\nPÚBLICO: """${publico.slice(0, 1000)}"""\n\nDevolva {"assunto":"o mercado em até 8 palavras","publico":"quem compra em até 6 palavras","subtemas":["6 a 8 assuntos de 2 a 4 palavras, do jeito que aparecem em manchete"],"termosX":["6 termos de 1 ou 2 palavras que aparecem em posts sobre o TRABALHO desse público no X, como marca pessoal, LinkedIn, social media; nada de frase do cotidiano"]}`,
      { model: "claude-haiku-4-5", maxTokens: 4000, usage: { projectId, operation: "radar_territorio" } }
    );
    const j = JSON.parse(bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1)) as Partial<Territorio>;
    const t: Territorio = {
      assunto: String(j.assunto ?? reserva.assunto).slice(0, 90),
      publico: String(j.publico ?? reserva.publico).slice(0, 70),
      subtemas: (Array.isArray(j.subtemas) ? j.subtemas : []).map(String).filter((s) => s.length > 2).slice(0, 8),
      termosX: (Array.isArray(j.termosX) ? j.termosX : []).map(String).filter((s) => s.length > 2 && s.split(" ").length <= 2).slice(0, 6),
    };
    await prisma.projectMemory
      .upsert({
        where: { projectId_type_key: { projectId, type: "radar", key: "territorio" } },
        create: { projectId, type: "radar", key: "territorio", value: { ...t, base } as never },
        update: { value: { ...t, base } as never },
      })
      .catch(() => {});
    return t;
  } catch {
    return reserva;
  }
}

/**
 * O FILTRO DO X (01/10). A busca do X casa palavras, e "marca pessoal" também
 * aparece em fã-clube: no radar de 01/10 o único post com plateia era de uma
 * conta de fãs de um cantor coreano, e virou ideia de vídeo. O Haiku separa o
 * post que fala do TRABALHO do público do resto, numa chamada só e barata.
 */
async function postsQueServem(projectId: string, posts: PostDoX[], t: Territorio): Promise<PostDoX[]> {
  if (posts.length === 0) return [];
  try {
    const lista = posts.map((p, i) => `${i + 1}. @${p.autor}: ${p.texto.replace(/\s+/g, " ").slice(0, 260)}`).join("\n");
    const bruto = await askClaude(
      "Você filtra posts do X para uma pauta de conteúdo. Responda só com JSON.",
      `ASSUNTO: ${t.assunto}\nPÚBLICO: ${t.publico}\n\nPOSTS:\n${lista}\n\nQuais posts falam do trabalho, do mercado ou da estratégia desse público (e não de celebridade, fã-clube, política partidária, futebol ou vida pessoal)? Devolva {"servem":[números]}`,
      { model: "claude-haiku-4-5", maxTokens: 4000, usage: { projectId, operation: "radar_filtro_x" } }
    );
    const j = JSON.parse(bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1)) as { servem?: number[] };
    const servem = new Set((j.servem ?? []).map(Number));
    return posts.filter((_, i) => servem.has(i + 1));
  } catch {
    // Sem o filtro, melhor nenhum post do X que um post fora do assunto.
    return [];
  }
}

/**
 * A regra comum das buscas. A frase "não ponha datas na consulta" é o conserto
 * de 01/10: com a janela escrita por extenso no pedido, o Gemini copiava as
 * datas para dentro da consulta e o Google não achava nada.
 */
export function regraDaBusca(hoje: Date, janela: number | "futuro"): string {
  const fmt = hoje.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const corte = janela === "futuro" ? "Descarte o que já passou." : `Descarte o que tiver mais de ${janela} dias.`;
  return `Hoje é ${fmt}. Pesquise no Google agora; nada da memória de treinamento. Não ponha datas, meses nem anos dentro da consulta de busca: pesquise o assunto e confira a data de cada resultado depois. ${corte} Responda SÓ a lista, um item por linha começando com "- ", no formato pedido. Se não achar nada, escreva "nada novo".`;
}

/**
 * O radar: quatro buscas no Google, em paralelo, todas com janela de datas.
 *
 * Olha o mundo do PÚBLICO, e não só o do nicho: o nicho da Demandou é a
 * própria categoria ("conteúdo com IA"), e perguntar só por ela devolve o
 * mesmo pano de fundo toda semana. O que muda de uma semana para outra é o que
 * aconteceu com quem compra: uma regra nova, um estudo, alguém que ganhou
 * atenção com uma ideia, uma data que vem aí.
 */
export async function radarDaSemana(args: {
  projectId: string;
  nicho: string;
  publico: string;
  forcar?: boolean;
}): Promise<Radar | null> {
  const chave = process.env.GEMINI_API_KEY;
  if (!chave) return null;

  if (!args.forcar) {
    const guardado = await prisma.projectMemory.findUnique({
      where: { projectId_type_key: { projectId: args.projectId, type: "radar", key: "semana" } },
      select: { value: true },
    });
    const r = guardado?.value as Radar | undefined;
    // Radar guardado antes de 01/10 não tem os itens um a um: refaz.
    if (r?.geradoEm && Date.now() - new Date(r.geradoEm).getTime() < SEIS_HORAS_MS && r.texto && r.itens) return r;
  }

  const hoje = new Date();
  const t = await territorioDoProjeto(args.projectId, args.nicho, args.publico);
  const assuntos = [t.assunto, ...t.subtemas.slice(0, 4)].join("; ");

  // maxDias é a janela conferida em código, com folga sobre a pedida: o Gemini
  // não respeita a janela sozinho.
  const buscas: Array<{ rotulo: string; origem: OrigemDaPauta; pedido: string; maxDias?: number }> = [
    {
      rotulo: "NOTÍCIAS DOS ÚLTIMOS 14 DIAS",
      origem: "radar",
      maxDias: 21,
      pedido: `${regraDaBusca(hoje, 14)}\nNotícias, lançamentos e mudanças recentes no Brasil ou no mundo que afetam ${t.publico}, sobre: ${assuntos}. Até 6 itens no formato: - DATA | O FATO EM UMA FRASE | VEÍCULO`,
    },
    {
      rotulo: "NÚMEROS NOVOS",
      origem: "pesquisa",
      maxDias: 75,
      pedido: `${regraDaBusca(hoje, 45)}\nPesquisas, relatórios e estatísticas recentes que interessam a ${t.publico} sobre: ${assuntos} (também vendas, comportamento do comprador, redes sociais e inteligência artificial no trabalho). Até 6 itens no formato: - DATA | INSTITUIÇÃO | O NÚMERO E O QUE ELE DIZ`,
    },
    {
      rotulo: "QUEM GANHOU ATENÇÃO COM UMA IDEIA NOVA",
      origem: "radar",
      maxDias: 35,
      pedido: `${regraDaBusca(hoje, 21)}\nPessoas, criadores, executivos ou empresas que ganharam atenção recentemente com uma ideia, frase, método, campanha ou polêmica sobre: ${assuntos}. Até 6 itens no formato: - DATA | QUEM | O QUE DISSE OU FEZ | ONDE SAIU`,
    },
    {
      rotulo: "O QUE VEM NAS PRÓXIMAS DUAS SEMANAS",
      origem: "curiosidade",
      pedido: `${regraDaBusca(hoje, "futuro")}\nDatas, eventos, feiras, prazos e mudanças de regra ou de plataforma no Brasil nas PRÓXIMAS duas semanas que importam para ${t.publico} (datas comerciais e comemorativas, eventos do setor, lançamentos e mudanças nas redes sociais). Aqui vale data futura. Até 6 itens no formato: - DATA | O QUE É`,
    },
  ];

  // O X entra junto (28/09): é o único lugar em que dá para ver o que está
  // PEGANDO entre pessoas, com autor e número, e não só o que saiu na imprensa.
  // Desde 01/10 a busca usa os termos curtos do território (sem gastar uma
  // chamada do Claude para inventar termos) e só leva post de quem tem
  // plateia (500 seguidores ou mais): os seis posts de 29/09 eram de contas de
  // 243 a 9.579 seguidores, e quatro deles de 282.
  const [resultados, doX] = await Promise.all([
    Promise.allSettled(buscas.map((b) => buscaComGoogle(b.pedido, chave, b.origem, b.maxDias))),
    oQueSeFalaNoX(`${args.nicho}. Público: ${args.publico}`, { termos: t.termosX?.length ? t.termosX : t.subtemas.slice(0, 6), minSeguidores: 500 }).catch(() => ({
      resumo: "",
      fontes: [],
      termos: [] as string[],
      posts: [] as PostDoX[],
    })),
  ]);
  const partes: string[] = [];
  const fontes: Array<{ titulo: string; url: string }> = [];
  const itens: ItemDaPauta[] = [];
  resultados.forEach((r, i) => {
    // O texto do bloco sai dos fatos que passaram na janela de datas, e não
    // da resposta crua: os sugeridores de tema também leem este texto.
    if (r.status !== "fulfilled" || r.value.itens.length === 0) return;
    partes.push(`## ${buscas[i].rotulo}\n${r.value.itens.map((it) => `- ${it.texto}`).join("\n")}`);
    fontes.push(...r.value.fontes);
    itens.push(...r.value.itens);
  });
  const doXQueServe = await postsQueServem(args.projectId, doX.posts, t);
  if (doXQueServe.length) {
    partes.push(
      `## O QUE ESTÁ PEGANDO NO X (últimos 7 dias, busca por: ${doX.termos.join(", ")}; nem tudo é do nicho, use só o que conversa com o público)\n${resumoDoX(doXQueServe, 8, 500)}`
    );
    fontes.push(...doXQueServe.slice(0, 5).map((p) => ({ titulo: `@${p.autor} no X`, url: p.url })));
    for (const p of doXQueServe) {
      const data = new Date(p.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
      const texto = `@${p.autor} (${p.seguidores.toLocaleString("pt-BR")} seguidores), ${data}: "${p.texto.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim().slice(0, 260)}" [${p.curtidas} curtidas, ${p.reposts} reposts]`;
      itens.push({ id: impressao(p.url), origem: "x", texto, fonte: { titulo: `@${p.autor} no X`, url: p.url } });
    }
  }
  if (partes.length === 0) return null;

  const radar: Radar = {
    texto: partes.join("\n\n").slice(0, 9000),
    fontes: fontes.filter((f, i, arr) => arr.findIndex((x) => x.url === f.url) === i).slice(0, 20),
    geradoEm: hoje.toISOString(),
    itens: itens.filter((it, i, arr) => arr.findIndex((x) => x.id === it.id) === i).slice(0, 40),
  };
  await prisma.projectMemory
    .upsert({
      where: { projectId_type_key: { projectId: args.projectId, type: "radar", key: "semana" } },
      create: { projectId: args.projectId, type: "radar", key: "semana", value: radar as never },
      update: { value: radar as never },
    })
    .catch(() => {});
  return radar;
}

/** Os blocos de prompt que os dois sugeridores de tema usam. */
export function blocosDeNovidade(radar: Radar | null, usados: string[]): string {
  const blocoUsados = usados.length
    ? [
        "=== JÁ PUBLICADO POR ESTE PROJETO NAS ÚLTIMAS SEMANAS (PROIBIDO repetir o tema, a tese, o número-âncora ou o exemplo central; variação do mesmo ângulo também é repetição) ===",
        ...usados.map((t) => `- ${t.slice(0, 180)}`),
        "=== FIM ===",
      ].join("\n")
    : "";
  const blocoRadar = radar
    ? `=== RADAR DA SEMANA: o que é NOVO no mundo do público (Google, com datas) ===\n${radar.texto}\n=== FIM DO RADAR ===`
    : "";
  return [blocoUsados, blocoRadar].filter(Boolean).join("\n\n");
}

export const REGRAS_DE_NOVIDADE = `REGRAS DE NOVIDADE (o projeto é vivo; repetir a semana passada é o pior defeito possível):
- Pelo menos METADE dos temas nasce de um item do RADAR DA SEMANA (um fato, número, pessoa ou data dos últimos 14 dias). Diga no próprio tema qual é o gancho novo: o nome, o número ou o acontecimento.
- Os documentos da marca são a LENTE e a voz (a dor, a tese, o público), não a pauta. Número dos documentos entra em no máximo UM tema da semana, e nunca o mesmo número de uma semana anterior.
- Nada da lista JÁ PUBLICADO volta, nem reescrito com outras palavras.
- Se o radar veio vazio, busque ângulos que o projeto ainda não usou: outro recorte do público, outra objeção, outro tipo de caso.`;
