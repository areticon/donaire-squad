import type { perguntarAoJev, PerguntaDoJev, RespostaDoJev } from "@/lib/jev/cliente";
import type { GeneroDoVideo, LeituraDoVideo, TrechoLido } from "@/lib/media/leitura-do-video";
import { DOLAR_POR_IMAGEM, DOLAR_POR_RECORTE, DOLAR_POR_SEGUNDO_DE_VIDEO } from "@/lib/credits/higgsfield-tabela";
import type { ContextoDaJornada } from "@/lib/media/jornada/contexto";
import type { IdeiaCrua } from "@/lib/media/jornada/ideias";
import type { Frase } from "@/lib/media/jornada/linha-do-tempo";
import { FORMATOS_DA_JORNADA, type AmostraDaJornada, type ElementoProposto, type FormatoDaJornada, type MidiaDaJornada } from "@/lib/media/jornada/estado";

/**
 * O PASSO 4 DA JORNADA, terceiro movimento (E2): as DECISÕES, todas pelo JEV.
 *
 * Num lote só: a força de cada momento (score), a ideia de cada momento entre
 * as do Sonnet ou "nenhuma" (choice), o formato de composição entre os que o
 * código sabe posicionar naquele trecho (choice; o formato diz ONDE e COMO a
 * mídia entra, nunca o que ela mostra) e a densidade do vídeo (choice entre
 * opções que dependem só da duração e do gênero lido).
 *
 * O código só aplica limites físicos: espaço mínimo entre elementos (o da
 * densidade escolhida), nunca dois ao mesmo tempo, teto de custo mostrado ao
 * cliente. Não há catálogo de peças, regra por estilo nem cota por minuto.
 */

export type Jev = typeof perguntarAoJev;

// ─────────────────────────────── a densidade ───────────────────────────────

export type OpcaoDeDensidade = { id: string; faixa: [number, number]; criterio: string };

/**
 * As opções de densidade ("segundos médios entre elementos"): dependem SÓ da
 * duração e do gênero lido. Vídeo longo cai naturalmente nas espaçadas (e o
 * B-roll gerado intercala); vídeo em que a tela ou a demonstração é o assunto
 * ganha opções mais espaçadas. Nenhum número preso a estilo.
 */
export function opcoesDeDensidade(duracao: number, genero: GeneroDoVideo | null | undefined): OpcaoDeDensidade[] {
  const niveis: Array<[number, number]> = duracao <= 180 ? [[3, 5], [5, 8], [8, 12]] : duracao <= 600 ? [[5, 8], [8, 15], [15, 25]] : [[12, 20], [20, 35], [35, 60]];
  const espacar = genero === "tela" || genero === "apresentacao-com-quadro" || genero === "demonstracao";
  const faixas = espacar ? [...niveis.slice(1), [niveis[2][1], Math.round(niveis[2][1] * 1.7)] as [number, number]] : niveis;
  const nomes = ["intensa", "media", "espacada"];
  return faixas.map((f, i) => ({ id: nomes[i], faixa: f, criterio: `um elemento a cada ${f[0]} a ${f[1]} s em média` }));
}

// ─────────────────────────────── os formatos possíveis ───────────────────────────────

const cabe = (areas: TrechoLido["areaLivre"], w: number, h: number) => areas.some((a) => a.w >= w && a.h >= h);

/**
 * Os formatos que o código sabe posicionar no trecho, pela área livre lida
 * (geometria, não escolha): janela e recorte só onde há espaço sem cobrir
 * pessoa, tela ou quadro; tela cheia para imagem; B-roll para vídeo.
 */
export function formatosPossiveis(midia: MidiaDaJornada, trecho: TrechoLido | null, formato: "9:16" | "16:9", livre?: EspacoLivre | null): FormatoDaJornada[] {
  const areas = trecho?.areaLivre ?? [];
  const vertical = formato === "9:16";
  // Com a medição do rosto no momento (amostras), o espaço real decide: o elemento só entra sobre a gravação se couber GRANDE.
  const janela = livre ? (vertical ? livre.lateral >= 0.5 || livre.topo >= 0.3 : livre.lateral >= 0.34) : cabe(areas, vertical ? 0.55 : 0.28, vertical ? 0.2 : 0.3);
  const recorte = livre ? (vertical ? livre.lateral >= 0.42 || livre.topo >= 0.13 : livre.lateral >= 0.26 || livre.topo >= 0.28) : cabe(areas, vertical ? 0.35 : 0.18, vertical ? 0.15 : 0.22);
  if (midia === "video") return ["broll"];
  if (midia === "recorte") return [...(recorte ? (["recorte-sobre"] as const) : []), ...(janela ? (["janela"] as const) : []), "tela-cheia"];
  return [...(janela ? (["janela"] as const) : []), ...(recorte ? (["recorte-sobre"] as const) : []), "tela-cheia"];
}

/** A mídia que o formato pede (o recorte entra sobre a gravação; a janela e a tela cheia levam a composição; o B-roll é vídeo). */
export function midiaDoFormato(f: FormatoDaJornada): MidiaDaJornada {
  return f === "recorte-sobre" ? "recorte" : f === "broll" ? "video" : "imagem";
}

export const CRITERIO_DO_FORMATO: Record<FormatoDaJornada, string> = {
  "tela-cheia": "a imagem ocupa a tela inteira por 2 a 4 s, com a voz por baixo: para a ideia central que pede atenção total",
  janela: "a imagem numa janela ao lado da pessoa, que segue em cena: para ilustrar sem tirar a pessoa",
  "recorte-sobre": "o objeto, ícone ou logo recortado entra sobre a gravação, na área livre: para o detalhe, a marca, o número",
  broll: "B-roll em vídeo, tela cheia, com a voz por baixo: para respirar e mostrar o assunto em movimento",
};

// ─────────────────────────────── o custo ───────────────────────────────

/** Segundos de B-roll gerado por elemento (o Kling cobra no mínimo 3 s). */
export const SEGUNDOS_DO_BROLL = 3;

/** A estimativa de UM elemento pela tabela única de preços. */
export function custoDoElementoDaJornada(midia: MidiaDaJornada, comTexto: boolean): number {
  const imagem = DOLAR_POR_IMAGEM["higgsfield-gpt-image-2.5-medium"];
  const leitura = comTexto ? 0.002 : 0;
  if (midia === "video") return +(SEGUNDOS_DO_BROLL * DOLAR_POR_SEGUNDO_DE_VIDEO["kling-pro"]).toFixed(4);
  if (midia === "recorte") return +(imagem + DOLAR_POR_RECORTE + leitura).toFixed(4);
  return +(imagem + leitura).toFixed(4);
}

/** O teto de custo das mídias por vídeo (mostrado ao cliente na tela do passo 5). */
export function tetoDoVideoUsd(duracao: number): number {
  const porMinuto = Number(process.env.JORNADA_TETO_USD_POR_MINUTO ?? 0.6);
  return +Math.max(1, (duracao / 60) * porMinuto).toFixed(2);
}

// ─────────────────────────────── as perguntas ───────────────────────────────

function trechoEm(leitura: LeituraDoVideo | null, t: number): TrechoLido | null {
  if (!leitura?.trechos?.length) return null;
  return leitura.trechos.find((x) => t >= x.de && t < x.ate) ?? leitura.trechos.at(-1) ?? null;
}

export type EspacoLivre = { topo: number; lateral: number };
export type MomentoComIdeias = { frase: Frase; ideias: IdeiaCrua[]; trecho: TrechoLido | null; livre?: EspacoLivre | null };

/**
 * O ESPAÇO LIVRE do momento pela medição (geometria): a faixa acima do rosto e a maior lateral fora dele, dentro da
 * área segura, na união dos rostos de todas as amostras do momento. Sem amostra, null (vale a área livre lida).
 */
export function espacoLivre(amostras: AmostraDaJornada[] | null | undefined, de: number, ate: number, formato: "9:16" | "16:9"): EspacoLivre | null {
  const dentro = (amostras ?? []).filter((a) => a.t >= de - 1.2 && a.t <= ate + 1.2 && a.rostos.length);
  if (!dentro.length) return null;
  const seg = formato === "9:16" ? { topo: 0.1, esquerda: 0.05, direita: 0.12 } : { topo: 0.06, esquerda: 0.04, direita: 0.04 };
  const rostos = dentro.flatMap((a) => a.rostos);
  const topo = Math.min(...rostos.map((r) => r.y - 0.018)) - seg.topo;
  const esquerda = Math.min(...rostos.map((r) => r.x - 0.03)) - seg.esquerda;
  const direita = 1 - seg.direita - Math.max(...rostos.map((r) => r.x + r.w + 0.03));
  return { topo: Math.max(0, +topo.toFixed(3)), lateral: Math.max(0, +Math.max(esquerda, direita).toFixed(3)) };
}

/** Os momentos que têm ideia, com o trecho lido e o espaço livre medido. */
export function momentosComIdeias(frases: Frase[], ideias: IdeiaCrua[], leitura: LeituraDoVideo | null, amostras?: AmostraDaJornada[] | null, formato: "9:16" | "16:9" = "16:9"): MomentoComIdeias[] {
  const porFrase = new Map<number, IdeiaCrua[]>();
  for (const i of ideias) porFrase.set(i.frase, [...(porFrase.get(i.frase) ?? []), i]);
  return frases.filter((f) => porFrase.has(f.indice)).map((f) => ({ frase: f, ideias: porFrase.get(f.indice)!, trecho: trechoEm(leitura, f.inicio), livre: espacoLivre(amostras, f.inicio, f.fim, formato) }));
}

const LETRAS = ["a", "b"];

/** As perguntas do lote (puro): força, ideia e formato por momento, e a densidade. */
export function perguntasDoPlano(momentos: MomentoComIdeias[], o: { formato: "9:16" | "16:9"; duracao: number; genero: GeneroDoVideo | null }): Record<string, PerguntaDoJev> {
  const q: Record<string, PerguntaDoJev> = {};
  q.densidade = {
    type: "choice",
    instructions: { pergunta: "Qual o ritmo de elementos visuais deste vídeo (segundos médios entre um elemento e o seguinte)?", duracaoSegundos: Math.round(o.duracao), formato: o.formato, generoLido: o.genero ?? "outro" },
    criteria: Object.fromEntries(opcoesDeDensidade(o.duracao, o.genero).map((x) => [x.id, x.criterio])),
  };
  for (const m of momentos) {
    const k = m.frase.indice;
    const cena = m.trecho ? { acontece: m.trecho.acontece, mostra: m.trecho.mostra, movimento: m.trecho.movimento } : null;
    q[`f${k}`] = {
      type: "score",
      instructions: { pergunta: "Quanto este momento da fala pede um elemento visual?", fala: m.frase.texto, emCena: cena },
      criteria: ["não pede: ligação, hesitação, repetição", "pede pouco: complemento", "pede: uma ideia clara que a imagem reforça", "pede muito: a ideia central, um número, um nome, uma imagem concreta dita"],
    };
    q[`i${k}`] = {
      type: "choice",
      instructions: { pergunta: "Qual destas ideias serve melhor a esta fala, a este público e a esta cena? Ou nenhuma.", fala: m.frase.texto, emCena: cena },
      criteria: { ...Object.fromEntries(m.ideias.map((x, j) => [LETRAS[j], `${x.descricao}${x.textoNaImagem ? ` (texto na arte: "${x.textoNaImagem}")` : ""}`])), nenhuma: "nenhuma serve: o momento fica com a gravação" },
    };
    const possiveis = [...new Set(m.ideias.flatMap((x) => formatosPossiveis(x.midia, m.trecho, o.formato, m.livre)))];
    if (possiveis.length > 1) {
      q[`m${k}`] = {
        type: "choice",
        instructions: { pergunta: "Como o elemento entra neste momento?", fala: m.frase.texto, emCena: cena, ideias: m.ideias.map((x) => x.descricao) },
        criteria: Object.fromEntries(possiveis.map((f) => [f, CRITERIO_DO_FORMATO[f]])),
      };
    }
  }
  return q;
}

// ─────────────────────────────── a escolha ───────────────────────────────

// A escolha do JEV vale mesmo com confiança baixa (é a opção mais provável dele); só a falta de resposta é falta.
const escolhaDe = (r: RespostaDoJev | undefined, opcoes: readonly string[], _minimo = 0.3): string | null => {
  void _minimo;
  return r && r.type === "choice" && opcoes.includes(r.choice) ? r.choice : null;
};

const notaDe = (r: RespostaDoJev | undefined): number | null => (r && r.type === "score" && typeof r.score === "number" ? r.score : null);

export type DecisaoDoPlano = {
  densidade: OpcaoDeDensidade;
  elementos: ElementoProposto[];
  descartados: Array<{ frase: number; motivo: string }>;
  custoTotalUsd: number;
};

/**
 * As respostas do JEV viram o plano (puro). O código só aplica os limites
 * físicos: ordem pela força, espaço mínimo da densidade, nunca dois juntos,
 * a quantidade que a densidade dá na duração e o teto de custo.
 */
export function planoDasRespostas(
  momentos: MomentoComIdeias[],
  r: Record<string, RespostaDoJev>,
  o: { formato: "9:16" | "16:9"; duracao: number; duracaoTotal?: number; genero: GeneroDoVideo | null; tetoUsd: number; novoId: (k: number) => string }
): DecisaoDoPlano {
  const opcoes = opcoesDeDensidade(o.duracaoTotal ?? o.duracao, o.genero);
  const idDens = escolhaDe(r.densidade, opcoes.map((x) => x.id), 0.2);
  // Sem a resposta do JEV, a do meio (só a geometria das opções; nada por estilo).
  const densidade = opcoes.find((x) => x.id === idDens) ?? opcoes[1];
  const descartados: DecisaoDoPlano["descartados"] = [];
  type Cand = { m: MomentoComIdeias; ideia: IdeiaCrua; formato: FormatoDaJornada; forca: number };
  const cands: Cand[] = [];
  for (const m of momentos) {
    const k = m.frase.indice;
    // Pergunta sem resposta do JEV (falha do lote) não descarta a ideia em silêncio: a força fica no meio e a ideia é a primeira, com o motivo anotado.
    const semForca = notaDe(r[`f${k}`]) === null;
    const semIdeia = escolhaDe(r[`i${k}`], [...LETRAS.slice(0, m.ideias.length), "nenhuma"]) === null;
    const forca = notaDe(r[`f${k}`]) ?? 1.5;
    const letra = escolhaDe(r[`i${k}`], [...LETRAS.slice(0, m.ideias.length), "nenhuma"]) ?? "a";
    if (semForca || semIdeia) descartados.push({ frase: k, motivo: `o JEV não respondeu (${semForca ? "força" : "ideia"}); a ideia seguiu para a escolha com força média` });
    if (letra === "nenhuma" || forca < 1.5) {
      descartados.push({ frase: k, motivo: letra === "nenhuma" ? "o JEV disse nenhuma" : `força ${forca.toFixed(2)}` });
      continue;
    }
    const ideia = m.ideias[LETRAS.indexOf(letra)];
    const possiveis = formatosPossiveis(ideia.midia, m.trecho, o.formato, m.livre);
    const escolhido = escolhaDe(r[`m${k}`], FORMATOS_DA_JORNADA as unknown as string[]) as FormatoDaJornada | null;
    const formato = escolhido && possiveis.includes(escolhido) ? escolhido : possiveis[0];
    cands.push({ m, ideia, formato, forca });
  }
  const meta = Math.max(1, Math.floor(o.duracao / ((densidade.faixa[0] + densidade.faixa[1]) / 2)));
  // A densidade é uma MÉDIA: dois momentos fortes podem ficar mais perto que ela (nunca a menos de metade do piso, nem de 2,5 s).
  const minimo = Math.max(2.5, densidade.faixa[0] / 2);
  const escolhidos: Cand[] = [];
  let custo = 0;
  for (const c of [...cands].sort((a, b) => b.forca - a.forca || a.ideia.gatilho.t - b.ideia.gatilho.t)) {
    if (escolhidos.length >= meta) {
      descartados.push({ frase: c.m.frase.indice, motivo: "a densidade escolhida já está cheia" });
      continue;
    }
    if (escolhidos.some((e) => Math.abs(e.ideia.gatilho.t - c.ideia.gatilho.t) < minimo)) {
      descartados.push({ frase: c.m.frase.indice, motivo: `a menos de ${minimo} s de outro elemento` });
      continue;
    }
    const preco = custoDoElementoDaJornada(midiaDoFormato(c.formato), Boolean(c.ideia.textoNaImagem));
    if (custo + preco > o.tetoUsd + 1e-9) {
      descartados.push({ frase: c.m.frase.indice, motivo: `teto de US$ ${o.tetoUsd}` });
      continue;
    }
    custo += preco;
    escolhidos.push(c);
  }
  escolhidos.sort((a, b) => a.ideia.gatilho.t - b.ideia.gatilho.t);
  const elementos: ElementoProposto[] = escolhidos.map((c, i) => {
    const midia = midiaDoFormato(c.formato);
    return {
      id: o.novoId(i),
      momento: { indice: c.m.frase.indice, de: c.m.frase.inicio, ate: c.m.frase.fim, frase: c.m.frase.texto },
      gatilho: c.ideia.gatilho,
      descricao: c.ideia.descricao,
      textoNaImagem: c.ideia.textoNaImagem,
      midia,
      formato: c.formato,
      porque: c.ideia.porque,
      custoUsd: custoDoElementoDaJornada(midia, Boolean(c.ideia.textoNaImagem)),
      origem: "ia",
      papel: c.ideia.papel,
    };
  });
  return { densidade, elementos, descartados, custoTotalUsd: +custo.toFixed(4) };
}

/** As decisões do plano pelo JEV (uma chamada em lote). Sem o JEV, lança: a decisão é dele, sem recuo silencioso. */
export async function decidirPlano(
  momentos: MomentoComIdeias[],
  o: { contexto: ContextoDaJornada; leitura: LeituraDoVideo | null; jev: Jev; projectId?: string | null; novoId: (k: number) => string }
): Promise<DecisaoDoPlano> {
  const genero = o.leitura?.genero ?? null;
  // As opções de densidade são as da duração do vídeo inteiro; a quantidade, a do trecho planejado.
  const total = o.contexto.duracaoTotal ?? o.contexto.duracao;
  const perguntas = perguntasDoPlano(momentos, { formato: o.contexto.formato, duracao: total, genero });
  const estado = {
    tarefa: "decidir os elementos visuais de um vídeo, momento a momento, para o público deste nicho",
    empresa: o.contexto.marca,
    nicho: o.contexto.nicho,
    estiloDoCliente: o.contexto.estiloDoCliente || "não escreveu",
    destino: o.contexto.destino,
    leitura: o.leitura ? { genero: o.leitura.genero, cenario: o.leitura.cenario, resumo: o.leitura.resumo } : null,
  };
  const r = await o.jev({ projectId: o.projectId, etapa: "jornada-plano", state: estado }, perguntas);
  return planoDasRespostas(momentos, r, { formato: o.contexto.formato, duracao: o.contexto.duracao, duracaoTotal: total, genero, tetoUsd: tetoDoVideoUsd(o.contexto.duracao), novoId: o.novoId });
}
