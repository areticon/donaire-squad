import { prisma } from "@/lib/db/prisma";
import {
  buscaComGoogle,
  impressao,
  radarDaSemana,
  regraDaBusca,
  territorioDoProjeto,
  type ItemDaPauta,
  type Radar,
} from "@/lib/research/radar-da-semana";
import type { OrigemDaIdeia } from "@/lib/editorial/tipos";
import type { CartaoDePadrao } from "@/lib/referencias/tipos";

/**
 * AS FONTES DE CADA RODADA DA LINHA EDITORIAL (01/10).
 *
 * Queixa do Bruno em produção: "o Roberto me deu algumas ideias, pedi para
 * gerar novas e ele repetiu as mesmas, é como se ele tivesse um banco de dados
 * limitado". Era limitado mesmo: a matéria-prima de toda rodada era o MESMO
 * texto do radar (guardado por seis horas), e naquele dia o radar tinha só
 * seis posts do X, porque as quatro buscas no Google voltaram "nada novo".
 *
 * Agora cada rodada recebe um cardápio de fatos SOLTOS, cada um com origem e
 * fonte, e um plano de oito vagas que mistura as origens e os ângulos:
 *
 *   • radar: notícias e quem ganhou atenção (lib/research/radar-da-semana.ts);
 *   • x: posts que pegaram no X, de quem tem plateia;
 *   • pesquisa: números e estudos recentes;
 *   • curiosidade: datas, eventos e fatos curiosos da semana;
 *   • publico: perguntas reais que o público faz;
 *   • documento: trechos do documento do projeto, um diferente por rodada;
 *   • padrao: cartões de padrão das referências (Fase B), só o molde.
 *
 * A MEMÓRIA DA LINHA (ProjectMemory tipo "linha"): os itens já entregues a
 * uma rodada não voltam ao cardápio, e os ângulos das duas últimas rodadas não
 * se repetem. Quando o cardápio acaba, as buscas extras rodam de novo com
 * outro foco de subtemas, no máximo uma vez a cada 10 minutos (cada busca no
 * Google com fonte custa).
 */

const SEIS_HORAS_MS = 6 * 3600_000;
const DEZ_MIN_MS = 10 * 60_000;

/** Os ângulos possíveis de uma pauta. Cada rodada usa oito diferentes da anterior. */
export const ANGULOS = [
  "mito que o público acredita e que está errado",
  "erro caro e comum, com o custo dito",
  "bastidor: como funciona por dentro",
  "comparação lado a lado de dois caminhos",
  "passo a passo prático em três movimentos",
  "opinião contrária ao que o mercado repete",
  "história ou caso concreto (do cliente, com [DADO] se faltar)",
  "a conta: um número que muda a decisão",
  "previsão: o que muda nos próximos meses",
  "resposta direta a uma pergunta do público",
  "ferramenta ou método com nome",
  "lição tirada de fora do nicho",
  "antes e depois",
  "diagnóstico: sinais de que a pessoa está no problema",
  "o que ninguém fala sobre o assunto",
  "objeção de quem compra, respondida",
];

type MemoriaDaLinha = {
  itensUsados: string[];
  /** Oferecidos ao modelo e não escolhidos: vão para o fim da fila; na segunda vez, saem. */
  vistos: Record<string, number>;
  trechosUsados: string[];
  angulosRecentes: string[][];
  focoUsado: string[];
  rodada: number;
};

type CardapioExtra = { geradoEm: string; foco: string[]; itens: ItemDaPauta[] };

export type Vaga = { origem: OrigemDaIdeia; angulo: string };

export type Rodada = {
  numero: number;
  vagas: Vaga[];
  /** Os itens que podem ser usados nesta rodada, por origem. */
  itens: ItemDaPauta[];
  /** Trechos do documento do projeto (id d1, d2...). */
  trechos: Array<{ id: string; texto: string }>;
  padroes: CartaoDePadrao[];
  radar: Radar | null;
  /** O que entrou de cada origem, para o relatório e a tela. */
  contagem: Partial<Record<OrigemDaIdeia, number>>;
  /** Subtemas que o cardápio extra focou nesta rodada (se foi refeito). */
  focoNovo: string[];
};

async function lerMemoria<T>(projectId: string, key: string): Promise<T | null> {
  const m = await prisma.projectMemory
    .findUnique({ where: { projectId_type_key: { projectId, type: "linha", key } }, select: { value: true } })
    .catch(() => null);
  return (m?.value as T | undefined) ?? null;
}

async function gravarMemoria(projectId: string, key: string, value: unknown) {
  await prisma.projectMemory
    .upsert({
      where: { projectId_type_key: { projectId, type: "linha", key } },
      create: { projectId, type: "linha", key, value: value as never },
      update: { value: value as never },
    })
    .catch(() => {});
}

/**
 * As três buscas que o radar não faz: dados e estudos com outro foco,
 * curiosidades e datas, e as perguntas reais do público.
 */
async function buscarExtras(projectId: string, nicho: string, publico: string, focoUsado: string[]): Promise<CardapioExtra> {
  const chave = process.env.GEMINI_API_KEY;
  const t = await territorioDoProjeto(projectId, nicho, publico);
  // O foco gira pelos subtemas: cada reconstrução do cardápio olha para dois
  // subtemas que ainda não foram foco, e recomeça quando todos já foram.
  const livres = t.subtemas.filter((s) => !focoUsado.includes(s));
  const foco = (livres.length >= 2 ? livres : t.subtemas).slice(0, 2);
  const assunto = foco.length ? `${foco.join(" e ")} (dentro de ${t.assunto})` : t.assunto;
  if (!chave) return { geradoEm: new Date().toISOString(), foco, itens: [] };

  const hoje = new Date();
  const pedidos: Array<{ origem: OrigemDaIdeia; pedido: string; maxDias?: number }> = [
    {
      origem: "pesquisa",
      maxDias: 200,
      pedido: `${regraDaBusca(hoje, 120)}\nPesquisas, relatórios, estudos e estatísticas recentes sobre ${assunto}, que interessam a ${t.publico}. Prefira instituições conhecidas e números concretos. Até 6 itens no formato: - DATA | INSTITUIÇÃO | O NÚMERO E O QUE ELE DIZ`,
    },
    {
      origem: "curiosidade",
      pedido: `${regraDaBusca(hoje, "futuro")}\nDuas coisas sobre ${assunto}, para ${t.publico}: (1) datas comemorativas e eventos desta semana e da próxima no Brasil que conversam com o TRABALHO desse público (negócios, empreendedorismo, vendas, comunicação, marketing, tecnologia, as profissões dele), e não datas de saúde, religião ou causas sem ligação com o trabalho; (2) curiosidades e fatos pouco conhecidos, com fonte, que surpreendem quem é do ramo (aqui vale fato antigo, desde que documentado). Até 7 itens no formato: - DATA OU "CURIOSIDADE" | O FATO EM UMA FRASE | FONTE`,
    },
    {
      origem: "publico",
      pedido: `${regraDaBusca(hoje, 365)}\nPerguntas e dúvidas REAIS que ${t.publico} fazem sobre ${assunto}: em fóruns, Reddit, Quora, comentários do YouTube e do LinkedIn, e no "as pessoas também perguntam" do Google. Traga de pelo menos três lugares diferentes, e não o FAQ de um artigo só. Escreva a pergunta como a pessoa escreveu ou quase. Até 7 itens no formato: - A PERGUNTA | ONDE APARECE`,
    },
  ];
  // Uma nova tentativa para a busca que voltou vazia: o Gemini com busca às
  // vezes devolve nada para o mesmo pedido que, repetido, traz sete itens
  // (medido em 01/10 nas perguntas do público).
  const buscar = async (p: (typeof pedidos)[number]) => {
    const primeira = await buscaComGoogle(p.pedido, chave, p.origem, p.maxDias);
    return primeira.itens.length ? primeira : buscaComGoogle(p.pedido, chave, p.origem, p.maxDias);
  };
  const r = await Promise.allSettled(pedidos.map(buscar));
  // No máximo dois fatos da mesma página: em 01/10 as sete "perguntas do
  // público" vieram do FAQ de um artigo só.
  const porFonte = new Map<string, number>();
  const itens = r
    .flatMap((x) => (x.status === "fulfilled" ? x.value.itens : []))
    .filter((it) => {
      const chaveDaFonte = it.fonte?.url ?? "";
      if (!chaveDaFonte) return true;
      porFonte.set(chaveDaFonte, (porFonte.get(chaveDaFonte) ?? 0) + 1);
      return (porFonte.get(chaveDaFonte) ?? 0) <= 2;
    });
  return { geradoEm: hoje.toISOString(), foco, itens };
}

/** Corta o documento do projeto em trechos com assunto, para girar um por rodada. */
function trechosDoDocumento(docs: string): Array<{ id: string; texto: string }> {
  const partes = docs
    .split(/\n\s*\n|\n(?=#)/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 120);
  return partes.map((p) => ({ id: `d-${impressao(p)}`, texto: p.slice(0, 700) }));
}

/** Os cartões de padrão gravados pelo trilho de referências (Fase B). */
export async function padroesDoProjeto(projectId: string): Promise<CartaoDePadrao[]> {
  const ms = await prisma.projectMemory
    // Os cartões do ritmo e do olhar do nicho (01/10, padrao-visual.ts) são da
    // edição e da arte, não da pauta: ficam de fora das ideias.
    .findMany({
      where: { projectId, type: "padrao", NOT: [{ key: { startsWith: "visual:" } }, { key: { startsWith: "ritmo:" } }] },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: { value: true },
    })
    .catch(() => []);
  return ms.map((m) => m.value as CartaoDePadrao).filter((c) => c?.oQueE);
}

function embaralhar<T>(lista: T[]): T[] {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Monta a rodada: o cardápio de fatos ainda não usados, os trechos do
 * documento, os padrões, e as vagas (origem e ângulo de cada ideia).
 */
export async function montarRodada(args: {
  projectId: string;
  nicho: string;
  publico: string;
  docs: string;
  quantas: number;
}): Promise<Rodada> {
  const { projectId, quantas } = args;
  const memoria: MemoriaDaLinha = {
    itensUsados: [],
    vistos: {},
    trechosUsados: [],
    angulosRecentes: [],
    focoUsado: [],
    rodada: 0,
    ...((await lerMemoria<MemoriaDaLinha>(projectId, "memoria")) ?? {}),
  };
  const usados = new Set([...memoria.itensUsados, ...Object.keys(memoria.vistos).filter((k) => memoria.vistos[k] >= 2)]);

  const [radar, padroes, guardado] = await Promise.all([
    radarDaSemana({ projectId, nicho: args.nicho, publico: args.publico }).catch(() => null),
    padroesDoProjeto(projectId),
    lerMemoria<CardapioExtra>(projectId, "fontes"),
  ]);

  // O cardápio extra: guardado por seis horas, refeito antes se já foi todo
  // usado (com outro foco), mas no máximo a cada 20 minutos.
  let extra = guardado;
  let focoNovo: string[] = [];
  const idade = extra?.geradoEm ? Date.now() - new Date(extra.geradoEm).getTime() : Infinity;
  const livresDoExtra = (extra?.itens ?? []).filter((i) => !usados.has(i.id)).length;
  if (!extra || idade > SEIS_HORAS_MS || (livresDoExtra < 5 && idade > DEZ_MIN_MS)) {
    extra = await buscarExtras(projectId, args.nicho, args.publico, memoria.focoUsado).catch(() => extra);
    if (extra) {
      await gravarMemoria(projectId, "fontes", extra);
      focoNovo = extra.foco;
    }
  }

  const todos = [...(radar?.itens ?? []), ...(extra?.itens ?? [])].filter(
    (it, i, arr) => arr.findIndex((x) => x.id === it.id) === i
  );
  // O que já foi oferecido uma vez e não escolhido vai para o fim da fila.
  const livres = todos
    .filter((i) => !usados.has(i.id))
    .sort((a, b) => (memoria.vistos[a.id] ?? 0) - (memoria.vistos[b.id] ?? 0));
  const porOrigem = new Map<OrigemDaIdeia, ItemDaPauta[]>();
  for (const it of livres) porOrigem.set(it.origem, [...(porOrigem.get(it.origem) ?? []), it]);

  // O plano base de oito vagas: notícia, X, dois de pesquisa, curiosidade,
  // duas perguntas do público, documento. Padrão de referência, quando existe,
  // toma o lugar da segunda pesquisa e da segunda pergunta.
  const base: OrigemDaIdeia[] = ["radar", "x", "pesquisa", "curiosidade", "publico", "documento", "pesquisa", "publico", "radar", "documento"];
  if (padroes.length) {
    base[6] = "padrao";
    if (padroes.length > 1) base[7] = "padrao";
  }
  const restantes = new Map<OrigemDaIdeia, number>([...porOrigem].map(([o, l]) => [o, l.length]));
  restantes.set("padrao", padroes.length);
  const trechos = trechosDoDocumento(args.docs);
  const trechosLivres = trechos.filter((t) => !memoria.trechosUsados.includes(t.id));
  const trechosDaRodada = (trechosLivres.length >= 2 ? trechosLivres : trechos).slice(0, 4);
  restantes.set("documento", trechosDaRodada.length ? 99 : 0);

  const origens: OrigemDaIdeia[] = [];
  for (const o of base) {
    if (origens.length >= quantas) break;
    if ((restantes.get(o) ?? 0) > 0) {
      origens.push(o);
      restantes.set(o, (restantes.get(o) ?? 0) - 1);
      continue;
    }
    // Sem item livre desta origem: a vaga vai para a origem com mais itens
    // sobrando; se nada sobrou, para o documento, com um ângulo novo.
    const melhor = [...restantes].filter(([k]) => k !== "documento").sort((a, b) => b[1] - a[1])[0];
    const destino: OrigemDaIdeia = melhor && melhor[1] > 0 ? melhor[0] : "documento";
    origens.push(destino);
    restantes.set(destino, (restantes.get(destino) ?? 0) - 1);
  }
  while (origens.length < quantas) origens.push("documento");

  const recentes = new Set(memoria.angulosRecentes.slice(-2).flat());
  const angulos = [...embaralhar(ANGULOS.filter((a) => !recentes.has(a))), ...embaralhar(ANGULOS.filter((a) => recentes.has(a)))];
  // A pergunta do público pede o ângulo de resposta direta; o resto sorteia.
  const vagas: Vaga[] = origens.map((origem) => {
    const preferido = origem === "publico" ? angulos.find((a) => a.startsWith("resposta direta")) : undefined;
    const angulo = preferido ?? angulos.find((a) => !a.startsWith("resposta direta")) ?? angulos[0];
    angulos.splice(angulos.indexOf(angulo), 1);
    return { origem, angulo };
  });

  // O cardápio vai ao modelo com folga (até três itens por vaga da origem),
  // para ele escolher o fato que serve, e não o primeiro da lista.
  const itens: ItemDaPauta[] = [];
  for (const [o, lista] of porOrigem) {
    const n = vagas.filter((v) => v.origem === o).length;
    if (n) itens.push(...lista.slice(0, n * 3));
  }
  const contagem: Partial<Record<OrigemDaIdeia, number>> = {};
  for (const v of vagas) contagem[v.origem] = (contagem[v.origem] ?? 0) + 1;

  return { numero: memoria.rodada + 1, vagas, itens, trechos: trechosDaRodada, padroes, radar, contagem, focoNovo };
}

/** Grava o que a rodada usou, para a próxima não repetir. */
export async function registrarRodada(projectId: string, rodada: Rodada, usados: { itens: string[]; angulos: string[]; trechos: string[] }) {
  const atual: MemoriaDaLinha = {
    itensUsados: [],
    vistos: {},
    trechosUsados: [],
    angulosRecentes: [],
    focoUsado: [],
    rodada: 0,
    ...((await lerMemoria<MemoriaDaLinha>(projectId, "memoria")) ?? {}),
  };
  // O item escolhido nunca volta. O oferecido e não escolhido vai para o fim
  // da fila e, na segunda vez, sai: mostrar o mesmo fato rodada após rodada é
  // exatamente a sensação de "as mesmas ideias".
  const escolhidos = new Set(usados.itens);
  const vistos = { ...atual.vistos };
  for (const it of rodada.itens) if (!escolhidos.has(it.id)) vistos[it.id] = (vistos[it.id] ?? 0) + 1;
  const chavesVistas = Object.keys(vistos).slice(-400);
  await gravarMemoria(projectId, "memoria", {
    itensUsados: [...new Set([...atual.itensUsados, ...usados.itens])].slice(-400),
    vistos: Object.fromEntries(chavesVistas.map((k) => [k, vistos[k]])),
    trechosUsados: [...new Set([...atual.trechosUsados, ...usados.trechos])].slice(-60),
    angulosRecentes: [...atual.angulosRecentes, usados.angulos].slice(-4),
    focoUsado: [...new Set([...atual.focoUsado, ...rodada.focoNovo])].slice(-12),
    rodada: rodada.numero,
  } satisfies MemoriaDaLinha);
}
