import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";
import { temasJaUsados, repeteAlgum } from "@/lib/research/radar-da-semana";
import { palavrasDaCena } from "@/lib/media/roteiro-do-video";
import { montarRodada, registrarRodada, type Rodada, type Vaga } from "@/lib/editorial/fontes-da-linha";
import { ROTULO_DA_ORIGEM, type CenaDoRoteiro, type FonteDaIdeia, type OrigemDaIdeia, type PapelDaCena } from "@/lib/editorial/tipos";
import { blocoDasRegrasDoProjeto } from "@/lib/referencias/regras";

/**
 * A LINHA EDITORIAL (29/09/2026): ideias de vídeo e roteiros por cena.
 *
 * Primeira porta do fluxo aprovado pelo Bruno: "onde o usuário gera ideias e
 * roteiros para os vídeos dele. Usa o radar da semana e a memória de 8 semanas
 * para propor pautas novas no nicho do cliente, sem repetir. O usuário escolhe
 * uma ideia, a IA escreve o roteiro por cenas, e ele edita à mão. O roteiro
 * salvo vira a partitura do editor."
 *
 * Duas chamadas, cada uma por clique do cliente, nunca em segundo plano:
 * `gerarIdeias` (8 pautas) e `escreverRoteiro` (tese e cenas de uma pauta).
 *
 * O que NÃO repete: os temas das campanhas das últimas 8 semanas
 * (`temasJaUsados`), as ideias que já estão na lista, as que viraram roteiro
 * e as descartadas. A régua de parecença é a mesma do radar (`repeteAlgum`),
 * que pega número, nome próprio e par de palavras, e não só palavra solta.
 * Desde 01/10 cada rodada também mistura origens e ângulos (ver gerarIdeias).
 */

/** O que o cliente vê de cada ideia antes de escolher. */
export type IdeiaGerada = { titulo: string; gancho: string; fonte?: { titulo: string; url: string } | null };

async function contextoDoProjeto(projectId: string) {
  const p = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      name: true,
      niche: true,
      targetAudience: true,
      voice: true,
      contexts: { where: { status: "pronto" }, select: { title: true, compiled: true }, take: 5 },
    },
  });
  const docs = p.contexts.map((c) => `## ${c.title}\n${c.compiled.slice(0, 1500)}`).join("\n\n").slice(0, 6000);
  // O documento inteiro (até 24 mil caracteres) só serve para girar um trecho
  // diferente por rodada; o prompt leva o resumo curto acima e os trechos.
  const docsCompletos = p.contexts.map((c) => `## ${c.title}\n${c.compiled}`).join("\n\n").slice(0, 24000);
  return { ...p, docs, docsCompletos };
}

function lerJson<T>(bruto: string): T | null {
  const limpo = bruto.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(limpo) as T;
  } catch {
    const a = limpo.search(/[[{]/);
    const b = Math.max(limpo.lastIndexOf("}"), limpo.lastIndexOf("]"));
    if (a < 0 || b <= a) return null;
    try {
      return JSON.parse(limpo.slice(a, b + 1)) as T;
    } catch {
      return null;
    }
  }
}

/**
 * Lê uma lista JSON, e salva os itens inteiros quando a resposta veio cortada
 * no meio (01/10): antes, uma lista cortada no oitavo item jogava fora os sete
 * que estavam prontos.
 */
function lerLista<T>(bruto: string): T[] {
  const inteira = lerJson<T[]>(bruto);
  if (Array.isArray(inteira)) return inteira;
  const a = bruto.indexOf("[");
  const b = bruto.lastIndexOf("}");
  if (a < 0 || b <= a) return [];
  try {
    const salva = JSON.parse(`${bruto.slice(a, b + 1)}]`) as T[];
    return Array.isArray(salva) ? salva : [];
  } catch {
    return [];
  }
}

const semTravessao = (t: string) => t.replace(/\s*[—–]\s*/g, ", ").trim();

/** O que o modelo devolve de cada ideia. */
type IdeiaDoModelo = {
  vaga?: number;
  item?: string;
  titulo?: string;
  gancho?: string;
  angulo?: string;
  porQueAgora?: string;
};

/** O que a rodada não pode repetir: ideias mostradas, recusadas e gravadas, e temas de campanha. */
async function oQueNaoRepete(projectId: string): Promise<{ titulos: string[]; recentes: string[] }> {
  const [usados, roteiros] = await Promise.all([
    temasJaUsados(projectId).catch(() => [] as string[]),
    // Todas as ideias das últimas 8 semanas, de qualquer status: as que estão
    // na tela, as que viraram roteiro e vídeo, e as recusadas (descartada).
    prisma.roteiro.findMany({
      where: { projectId, createdAt: { gte: new Date(Date.now() - 8 * 7 * 24 * 3600_000) } },
      orderBy: { createdAt: "desc" },
      select: { titulo: true, fonte: true },
      take: 200,
    }),
  ]);
  return {
    titulos: [...roteiros.map((r) => r.titulo), ...usados],
    // As 16 mais novas vão ao prompt com o ângulo, para o modelo não fazer a
    // mesma ideia com outras palavras.
    recentes: roteiros.slice(0, 16).map((r) => {
      const angulo = (r.fonte as FonteDaIdeia | null)?.angulo;
      return angulo ? `${r.titulo} (ângulo: ${angulo})` : r.titulo;
    }),
  };
}

export type Contexto = Awaited<ReturnType<typeof contextoDoProjeto>>;

export function pedidoDaRodada(ctx: Contexto, rodada: Rodada, proibidos: string[], vagas: Array<Vaga & { n: number }>): string {
  const origensComItem = [...new Set(vagas.map((v) => v.origem))].filter((o) => o !== "documento" && o !== "padrao");
  const cardapio = origensComItem
    .map((o) => {
      const lista = rodada.itens.filter((i) => i.origem === o);
      if (!lista.length) return "";
      return `### ${ROTULO_DA_ORIGEM[o].toUpperCase()}\n${lista.map((i) => `[${i.id}] ${i.texto}`).join("\n")}`;
    })
    .filter(Boolean)
    .join("\n\n");
  const trechos = rodada.trechos.length
    ? `### DO SEU DOCUMENTO (trechos desta rodada)\n${rodada.trechos.map((t) => `[${t.id}] ${t.texto}`).join("\n")}`
    : "";
  // MOLDE SIM, CONTEÚDO NÃO: o gerador recebe só o cartão abstrato do padrão
  // (forma e prova estatística), nunca a legenda de quem fez.
  const padroes = rodada.padroes.length
    ? `### PADRÕES DE REFERÊNCIA (só o MOLDE: formato, gancho, estrutura; nunca frase, caso ou nome de quem fez)\n${rodada.padroes
        .map(
          (p) =>
            `[${p.chave}] ${p.oQueE}. Prova: ${p.prova.posts} posts em ${p.prova.perfis} perfis, ${p.prova.ganho.toFixed(1)} vezes a mediana do próprio perfil. Como aplicar: ${p.comoAplicar}. Não levar: ${p.oQueNaoLevar}.`
        )
        .join("\n")}`
    : "";
  const plano = vagas.map((v) => `${v.n}. origem: ${ROTULO_DA_ORIGEM[v.origem]}; ângulo: ${v.angulo}`).join("\n");

  return `NICHO: ${ctx.niche ?? "negócios"}
PÚBLICO: ${ctx.targetAudience ?? "empresários"}
TOM: ${ctx.voice ?? "direto e próximo"}
${ctx.docs ? `\nO DOCUMENTO DA MARCA EM RESUMO (a lente e a voz, não a pauta):\n${ctx.docs.slice(0, 2500)}\n` : ""}
=== CARDÁPIO DESTA RODADA (fatos com id; use o id no campo "item") ===
${[cardapio, trechos, padroes].filter(Boolean).join("\n\n")}
=== FIM DO CARDÁPIO ===

=== JÁ MOSTRADO, USADO OU RECUSADO (PROIBIDO repetir o tema, a tese, o número-âncora ou o exemplo central; a mesma ideia com outras palavras também é repetição) ===
${proibidos.slice(0, 70).map((t) => `- ${t.slice(0, 160)}`).join("\n") || "- nada ainda"}
=== FIM ===

O PLANO DESTA RODADA (uma ideia por vaga, na ordem):
${plano}

Regras:
- Cada vaga usa UM item do cardápio da origem pedida (o id entre colchetes, no campo "item"). Origem "do seu documento" usa um trecho [d-...]; "padrão de referência" usa a chave do padrão e aplica o MOLDE ao tema da marca. Nenhum item em duas vagas.
- O ângulo da vaga manda: duas ideias da rodada nunca podem ser o mesmo assunto visto de lados parecidos.
- Item de outro país ou de outro mercado: traga para o mundo do público, sem inventar dado brasileiro.
- "titulo": a promessa do vídeo em até 70 caracteres, do jeito que a pessoa diria, sem clickbait vazio.
- "gancho": a PRIMEIRA FRASE que a pessoa fala na câmera (até 160 caracteres), concreta, que abre uma pergunta. Nada de "hoje vou falar".
- "angulo": em uma frase, o recorte específico desta ideia (o que ela diz que as outras não dizem).
- "porQueAgora": em uma frase, por que este vídeo é para esta semana, citando o fato do item (data, número, pessoa ou pergunta).
- Nunca invente número, pesquisa, pessoa ou link. Número só vale se estiver no item.

Responda SOMENTE com JSON: [{"vaga":1,"item":"id","titulo":"...","gancho":"...","angulo":"...","porQueAgora":"..."}]`;
}

/** Passado deste tempo, a rodada não faz a segunda chamada (a rota tem 300 s). */
const PRAZO_PARA_SEGUNDA_MS = 150_000;

export type ResultadoDaRodada = {
  novas: number;
  ids: string[];
  rodada: number;
  origens: Partial<Record<OrigemDaIdeia, number>>;
  recusadasPorParecenca: string[];
};

/**
 * Gera e grava novas ideias (status "ideia").
 *
 * A CAUSA DA REPETIÇÃO (01/10, medida no projeto da Demandou):
 *   1. A RESPOSTA CORTADA. O teto era 6.000 tokens e o Sonnet 5 (padrão desde
 *      01/10) pensa antes de escrever, e o pensamento conta no teto. Com a
 *      lista de proibidos maior a cada rodada, ele gastou os 6.000 inteiros
 *      (medido: a chamada do Bruno às 16h16 e a segunda rodada da prova, as
 *      duas com saída 6.000 de 6.000), o JSON veio cortado, nada entrou, e a
 *      tela continuou mostrando as mesmas ideias.
 *   2. O RADAR VAZIO. As quatro buscas no Google voltavam "nada novo" (ver
 *      territorioDoProjeto em lib/research/radar-da-semana.ts), e o único
 *      material da rodada eram seis posts do X de contas pequenas, os mesmos
 *      por seis horas. Rodada após rodada, o mesmo material.
 *   3. UMA FONTE SÓ, SEM PLANO. Nada obrigava a rodada a variar de origem ou
 *      de ângulo.
 * Agora: teto de 16.000 com esforço médio e leitura da lista cortada; um
 * cardápio de fatos de cinco origens, com memória do que já foi usado
 * (lib/editorial/fontes-da-linha.ts); oito vagas com origem e ângulo
 * sorteados; e a régua de parecença contra tudo que já apareceu, inclusive
 * dentro da própria rodada. Se a régua derruba ideias demais, uma segunda
 * chamada completa as vagas que faltam.
 */
export async function gerarIdeias(projectId: string, userId: string, quantas = 8): Promise<ResultadoDaRodada> {
  const inicio = Date.now();
  const ctx = await contextoDoProjeto(projectId);
  const [rodada, naoRepete] = await Promise.all([
    montarRodada({ projectId, nicho: ctx.niche ?? "negócios", publico: ctx.targetAudience ?? "empresários", docs: ctx.docsCompletos, quantas }),
    oQueNaoRepete(projectId),
  ]);
  const itensPorId = new Map(rodada.itens.map((i) => [i.id, i]));
  const trechosPorId = new Map(rodada.trechos.map((t) => [t.id, t]));
  const padroesPorChave = new Map(rodada.padroes.map((p) => [p.chave, p]));

  const sistema = `Você é o Roberto, editor de pauta de um canal de vídeo de ${ctx.name}. Propõe pautas de VÍDEO que a própria pessoa grava falando para a câmera, cada uma nascida de um fato do cardápio. Nunca use travessão: use vírgula, dois-pontos ou parênteses. Nunca invente fato, número ou fonte.${await blocoDasRegrasDoProjeto(projectId, ["roteiro"])}`;

  const aceitas: Array<{ ideia: IdeiaDoModelo; vaga: Vaga; item: string }> = [];
  const recusadas: string[] = [];
  const itensUsados = new Set<string>();
  let pendentes = rodada.vagas.map((v, i) => ({ ...v, n: i + 1 }));

  for (let tentativa = 0; tentativa < 2 && pendentes.length; tentativa++) {
    if (tentativa > 0 && Date.now() - inicio > PRAZO_PARA_SEGUNDA_MS) break;
    const proibidos = [...aceitas.map((a) => a.ideia.titulo ?? ""), ...recusadas, ...naoRepete.recentes, ...naoRepete.titulos.slice(16)];
    const bruto = await askClaude(sistema, pedidoDaRodada(ctx, rodada, proibidos, pendentes), {
      maxTokens: 16000,
      effort: "medium",
      usage: { projectId, operation: tentativa === 0 ? "linha_editorial_ideias" : "linha_editorial_ideias_completa" },
    });
    const atendidas = new Set<number>();
    for (const i of lerLista<IdeiaDoModelo>(bruto)) {
      const titulo = typeof i?.titulo === "string" ? semTravessao(i.titulo).slice(0, 140) : "";
      const vaga = pendentes.find((v) => v.n === Number(i?.vaga) && !atendidas.has(v.n)) ?? pendentes.find((v) => !atendidas.has(v.n));
      if (!vaga || titulo.length < 8) continue;
      // A régua de parecença contra tudo que já apareceu E contra as ideias
      // que já entraram nesta rodada: "nem quase repete".
      if (repeteAlgum(titulo, [...naoRepete.titulos, ...aceitas.map((a) => a.ideia.titulo ?? "")])) {
        recusadas.push(titulo);
        continue;
      }
      const item = String(i.item ?? "").replace(/^\[|\]$/g, "").trim();
      if (item && itensUsados.has(item)) continue;
      if (item) itensUsados.add(item);
      atendidas.add(vaga.n);
      aceitas.push({ ideia: { ...i, titulo }, vaga, item });
      if (aceitas.length >= quantas) break;
    }
    pendentes = pendentes.filter((v) => !atendidas.has(v.n));
    // Completar uma ideia só não paga outra chamada.
    if (pendentes.length < 2) break;
  }

  const ids: string[] = [];
  const origens: Partial<Record<OrigemDaIdeia, number>> = {};
  for (const { ideia, vaga, item } of aceitas) {
    const it = itensPorId.get(item);
    const trecho = trechosPorId.get(item);
    const padrao = padroesPorChave.get(item);
    // A origem é a do item que o modelo citou, conferido no cardápio. Item que
    // não existe vira "do seu documento" sem link: link só de fonte real.
    const origem: OrigemDaIdeia = it?.origem ?? (padrao ? "padrao" : "documento");
    origens[origem] = (origens[origem] ?? 0) + 1;
    const fonte: FonteDaIdeia = {
      origem,
      angulo: semTravessao(ideia.angulo ?? vaga.angulo).slice(0, 300),
      abertura: semTravessao(ideia.gancho ?? "").slice(0, 240),
      itemId: it || trecho || padrao ? item : undefined,
      rodada: rodada.numero,
      ...(it?.fonte?.url ? { titulo: it.fonte.titulo, url: it.fonte.url } : {}),
    };
    const r = await prisma.roteiro.create({
      data: {
        projectId,
        userId,
        status: "ideia",
        titulo: ideia.titulo ?? "",
        gancho: semTravessao(ideia.porQueAgora ?? "").slice(0, 600),
        fonte: fonte as never,
      },
      select: { id: true },
    });
    ids.push(r.id);
  }

  await registrarRodada(projectId, rodada, {
    itens: aceitas.map((a) => a.item).filter((x) => itensPorId.has(x)),
    trechos: aceitas.map((a) => a.item).filter((x) => trechosPorId.has(x)),
    angulos: aceitas.map((a) => a.vaga.angulo),
  });

  return { novas: ids.length, ids, rodada: rodada.numero, origens, recusadasPorParecenca: recusadas };
}

/**
 * Quantas cenas um vídeo desta duração pede. Uma cena a cada 15 a 40 s,
 * conforme a duração: vídeo curto troca de ideia mais depressa.
 */
function quantasCenas(duracao: number): number {
  if (duracao <= 60) return 4;
  if (duracao <= 180) return 6;
  return 9;
}

/** Escreve a tese e as cenas de uma ideia e grava (status "pronto"). */
export async function escreverRoteiro(roteiroId: string, duracao: number): Promise<void> {
  const r = await prisma.roteiro.findUniqueOrThrow({ where: { id: roteiroId } });
  const ctx = await contextoDoProjeto(r.projectId);
  const n = quantasCenas(duracao);
  const porCena = Math.round(duracao / n);
  const palavras = palavrasDaCena(porCena);
  const f = (r.fonte ?? {}) as FonteDaIdeia;

  const sistema = `Você escreve roteiros de vídeo para a pessoa gravar falando para a câmera, com a voz dela. Nunca use travessão: use vírgula, dois-pontos ou parênteses. Nunca invente número, pesquisa ou caso: onde um dado ajudaria, escreva [DADO: o que buscar] para a pessoa completar.${await blocoDasRegrasDoProjeto(r.projectId, ["roteiro"])}`;
  const pedido = `PAUTA: ${r.titulo}
POR QUE AGORA: ${r.gancho ?? ""}
${f.angulo ? `ÂNGULO (o recorte que esta pauta tem e as outras não): ${f.angulo}\n` : ""}${f.abertura ? `PRIMEIRA FRASE SUGERIDA (pode melhorar, sem perder a ideia): ${f.abertura}\n` : ""}NICHO: ${ctx.niche ?? "negócios"} | PÚBLICO: ${ctx.targetAudience ?? "empresários"} | TOM: ${ctx.voice ?? "direto e próximo"}
${ctx.docs ? `\nDOCUMENTOS DA MARCA:\n${ctx.docs}\n` : ""}
Escreva o roteiro de um vídeo de cerca de ${duracao} segundos, em ${n} cenas.

ANTES DAS CENAS, A TESE: a afirmação que a pessoa leva embora, em uma frase.
CENA 1 É O GANCHO: a tensão que o público já vive, dita de forma concreta, que abre uma pergunta. Nada de "hoje vou falar sobre", saudação ou definição.
CADA CENA PUXA A SEGUINTE: ligadas por MAS (contraria) ou POR ISSO (decorre). Lista solta não serve.
A ÚLTIMA CENA É O FECHAMENTO: entrega o que o gancho prometeu, como conclusão, e termina com uma chamada simples (comentar, salvar ou falar com a empresa).

Para cada cena:
- "papel": "gancho", "desenvolvimento" ou "fechamento";
- "fala": o que a pessoa diz, em linguagem falada, com cerca de ${palavras} palavras (a régua é 2,4 palavras por segundo);
- "naTela": o que aparece na tela nessa cena (texto de destaque, imagem de apoio, gráfico, a própria pessoa em close), em uma frase curta.

Responda SOMENTE com JSON: {"tese":"...","cenas":[{"papel":"...","fala":"...","naTela":"..."}]}`;

  const bruto = await askClaude(sistema, pedido, { maxTokens: 12000, usage: { projectId: r.projectId, operation: "linha_editorial_roteiro" } });
  const dados = lerJson<{ tese?: string; cenas?: Array<{ papel?: string; fala?: string; naTela?: string }> }>(bruto);
  if (!dados?.cenas?.length) throw new Error("O roteiro não veio em formato válido. Tente de novo.");

  const papeis: PapelDaCena[] = ["gancho", "desenvolvimento", "fechamento"];
  const cenas: CenaDoRoteiro[] = dados.cenas.map((c, i) => {
    const fala = semTravessao(String(c.fala ?? ""));
    return {
      id: `c${i + 1}-${Math.random().toString(36).slice(2, 7)}`,
      papel: papeis.includes(c.papel as PapelDaCena) ? (c.papel as PapelDaCena) : i === 0 ? "gancho" : "desenvolvimento",
      fala,
      naTela: semTravessao(String(c.naTela ?? "")),
    };
  });
  await prisma.roteiro.update({
    where: { id: roteiroId },
    data: { tese: semTravessao(dados.tese ?? ""), cenas: cenas as never, duracao, status: "pronto" },
  });
}
