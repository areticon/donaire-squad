import type { Word } from "@/lib/media/transcribe";
import { emendarNoSilencio, intervalosDoTrecho, type Remocao } from "@/lib/media/edicao";
import { bordasDoCorte } from "@/lib/media/bordas-do-corte";

/**
 * O CONTROLE DO CORTE (03/10/2026). Módulo PURO: sem banco, sem IA, sem rede.
 * A tela (componente de cliente) e o servidor fazem a MESMA conta com ele, e é
 * isso que garante que o que o cliente ouve no player antes de aplicar é o que
 * o worker vai emendar.
 *
 * O pedido do Bruno: "quando o agente corta errado (frase errada que ficou, ou
 * cortou um pouco antes ou depois), o usuário precisa ter controle do corte:
 * puxar o começo e o fim de cada corte, e tirar ou devolver trechos no meio
 * (frase repetida, gaguejo), exatamente como quiser". O ajuste do cliente é
 * SOBERANO: o que ele devolve de propósito fica marcado como "mantido pelo
 * usuário" e nem a guarda de saída (lib/media/guarda-da-fala.ts) tira.
 *
 * ## O modelo
 *
 * A escolha do cliente é o ESTADO FINAL, e não uma lista de cliques: a palavra
 * onde o corte começa, a palavra onde termina, quais palavras do meio ficam de
 * fora e o ajuste fino de cada borda (em décimos de segundo). A conta parte
 * sempre das remoções da limpeza (as da IA, guardadas no roteiro) e:
 *
 *   - palavra que a IA tirou e o cliente quer de volta: sai da remoção da IA
 *     (DEVOLVIDA, e marcada como mantida pelo usuário);
 *   - palavra que a IA deixou e o cliente quer fora: vira remoção do cliente,
 *     com a borda no silêncio (`emendarNoSilencio`), nunca no meio da palavra;
 *   - pausa que a IA tirou continua tirada (não é palavra, ninguém pediu).
 *
 * Refazer a mesma escolha dá o mesmo corte: é idempotente.
 */

/** Refações gratuitas por corte depois da entrega. Da quarta em diante, cobra (ver CREDITOS_POR_REFACAO_DO_CORTE). */
export const REFACOES_GRATIS_POR_CORTE = 3;
/**
 * Créditos de uma refação além das gratuitas. Medido em 03/10 no corte 1 de
 * cmurtv2zg (58 s no ar), no ai_usage: os efeitos do trecho (Claude Sonnet,
 * US$ 0,024), o enquadramento (visão, US$ 0,03 em média e 0,045 no máximo) e
 * a guarda da fala no corte pronto, duas rodadas (Deepgram US$ 0,005 e
 * retomadas no Claude Opus US$ 0,0055 cada). Editor, imagens, B-roll e os
 * vídeos da Higgsfield NÃO são pagos de novo: a edição é reaproveitada.
 * Total US$ 0,075 típico e 0,09 no teto, ou R$ 0,48 com o dólar a R$ 5,36:
 * 18 créditos na régua de R$ 0,027 de IA por crédito (lib/media/limits.ts);
 * 20 com folga. Sem o reaproveitamento seria o editor inteiro de novo (US$ 0,34
 * a 0,72 por corte, mais as imagens).
 */
export const CREDITOS_POR_REFACAO_DO_CORTE = 20;
/** O ajuste fino de cada borda vai até isto, para os dois lados. */
export const AJUSTE_FINO_MAXIMO_SEG = 1.5;
/** A palavra mostrada em volta do corte, para puxar o começo para trás e o fim para a frente. */
export const FOLGA_DA_JANELA_SEG = 25;
export const DURACAO_MINIMA_DO_CORTE_SEG = 10;
export const DURACAO_MAXIMA_DO_CORTE_SEG = 180;

export type Intervalo = { de: number; ate: number };

/** Uma palavra da janela do corte, no tempo da gravação. `i` é o índice na transcrição inteira. */
export type PalavraDoControle = {
  i: number;
  texto: string;
  inicio: number;
  fim: number;
  /** A limpeza (IA) tirou esta palavra, e por quê. */
  ia: string | null;
};

/** A escolha do cliente, inteira. Índices de palavra são os da transcrição (`PalavraDoControle.i`). */
export type EscolhaDoCorte = {
  comecar: number;
  terminar: number;
  /** As palavras entre `comecar` e `terminar` que ficam FORA do corte. */
  fora: number[];
  /** Décimos de segundo somados à borda calculada (negativo abre antes). */
  finoInicio: number;
  finoFim: number;
};

/** O que a tela recebe para desenhar o controle de um corte. */
export type ControleDoCorte = {
  videoId: string;
  indice: number;
  titulo: string;
  palavras: PalavraDoControle[];
  /** As remoções da limpeza (IA) dentro da janela, no tempo da gravação. */
  remocoesDaIA: Array<{ de: number; ate: number; motivo: string }>;
  /** O que está valendo hoje (no ar, ou no roteiro antes da aprovação). */
  atual: EscolhaDoCorte;
  /** Trechos que o cliente devolveu antes (tempo da gravação), para a tela marcar. */
  mantidosPeloUsuario: Array<{ de: number; ate: number; texto: string }>;
  duracaoDaGravacao: number;
  /** "roteiro": antes da aprovação, aplicar só grava no roteiro (sem custo). "no-ar": aplicar refaz o corte. */
  modo: "roteiro" | "no-ar";
  /** Por que não dá para aplicar agora (corte sendo refeito, vídeo em produção); null quando dá. */
  impedimento: string | null;
  refacoes: { feitas: number; gratis: number; creditosDaProxima: number; saldo: number | null; interno: boolean };
  /** O que acontece com a edição (artes, cenas) depois do re-corte, em português. */
  depois: string;
  /** O player: a gravação inteira, servida com Range pela rota de mídia. */
  fonteUrl: string;
  /** Um quadro do corte, para o player não abrir preto enquanto a gravação carrega. */
  posterUrl: string | null;
};

/** O resultado da conta para uma escolha. */
export type CorteCalculado = {
  inicio: number;
  fim: number;
  /** Bordas exatas (sempre verdadeiro aqui: o pedido usa o segundo exato). */
  emPausa: true;
  /** Todas as remoções, no tempo da gravação: as da IA (menos as devolvidas) e as do cliente. */
  remocoes: Remocao[];
  /** Só as do cliente (vão para `remocoesDoCliente` do trecho). */
  doCliente: Remocao[];
  /** O que o cliente devolveu da limpeza, no tempo da gravação, com o texto. */
  devolvidos: Array<{ de: number; ate: number; texto: string }>;
  /** O que o worker vai emendar, no tempo do corte (0 = `inicio`). */
  manter: Intervalo[];
  /** As palavras que vão ao ar (índices da transcrição). */
  noAr: number[];
  duracao: number;
  /** Palavras cujo estado final não é o pedido (borda de silêncio curta demais, por exemplo). */
  divergencias: number[];
};

const comoWord = (p: PalavraDoControle): Word => ({ word: p.texto, start: p.inicio, end: p.fim, confidence: 1 });

/** A fração de uma palavra que um conjunto de remoções cobre. */
function cobertura(p: { inicio: number; fim: number }, remocoes: Intervalo[]): number {
  const dur = Math.max(0.01, p.fim - p.inicio);
  let s = 0;
  for (const r of remocoes) {
    if (r.ate <= p.inicio || r.de >= p.fim) continue;
    s += Math.min(r.ate, p.fim) - Math.max(r.de, p.inicio);
  }
  return s / dur;
}

/** A IA tirou a palavra? (metade dela ou mais coberta por remoção da limpeza). Devolve o motivo. */
export function motivoDaIA(p: { inicio: number; fim: number }, remocoes: Array<{ de: number; ate: number; motivo?: string }>): string | null {
  if (cobertura(p, remocoes) < 0.5) return null;
  const r = remocoes.find((x) => x.ate > p.inicio && x.de < p.fim);
  return r?.motivo ?? "limpeza";
}

/** O mesmo critério de `noTempoDoCorte` (lib/media/legenda-falada.ts): a palavra está no ar se o começo dela cai num intervalo mantido. */
export function noTempoDoCorte(segundo: number, inicio: number, manter: Intervalo[]): number | null {
  const t = segundo - inicio;
  let acumulado = 0;
  for (const i of manter) {
    if (t < i.de) return null;
    if (t <= i.ate) return acumulado + (t - i.de);
    acumulado += i.ate - i.de;
  }
  return null;
}

/**
 * A palavra está NO AR se metade dela ou mais cai num intervalo mantido.
 * Pela metade, e não pelo começo (como a legenda faz): a remoção encaixada no
 * silêncio às vezes começa uns centésimos depois do ataque da palavra, e pelo
 * começo a palavra tirada pareceria estar no ar.
 */
export function estaNoAr(p: { inicio: number; fim: number }, inicio: number, manter: Intervalo[]): boolean {
  const dur = Math.max(0.01, p.fim - p.inicio);
  let s = 0;
  for (const m of manter) {
    const a = inicio + m.de;
    const b = inicio + m.ate;
    if (b <= p.inicio || a >= p.fim) continue;
    s += Math.min(b, p.fim) - Math.max(a, p.inicio);
  }
  return s / dur >= 0.5;
}

/** Tira de cada remoção os pedaços que cobrem os intervalos dados. Pedaço menor que 50 ms some. */
function subtrair(remocoes: Remocao[], tirar: Intervalo[]): Remocao[] {
  let atual = remocoes.map((r) => ({ ...r }));
  for (const t of tirar) {
    const prox: Remocao[] = [];
    for (const r of atual) {
      if (t.ate <= r.de || t.de >= r.ate) {
        prox.push(r);
        continue;
      }
      if (t.de - r.de >= 0.05) prox.push({ ...r, ate: t.de });
      if (r.ate - t.ate >= 0.05) prox.push({ ...r, de: t.ate });
    }
    atual = prox;
  }
  return atual;
}

function unir(remocoes: Remocao[]): Remocao[] {
  const todas = [...remocoes].sort((a, b) => a.de - b.de);
  const saida: Remocao[] = [];
  for (const r of todas) {
    const ant = saida[saida.length - 1];
    if (ant && r.de <= ant.ate) {
      ant.ate = Math.max(ant.ate, r.ate);
      if (!ant.motivo.includes(r.motivo)) ant.motivo = `${ant.motivo} e ${r.motivo}`;
    } else saida.push({ ...r });
  }
  return saida;
}

/** Junta índices consecutivos (na ordem da janela) em blocos [primeiro, último]. */
function blocos(posicoes: number[]): Array<[number, number]> {
  const s = [...new Set(posicoes)].sort((a, b) => a - b);
  const saida: Array<[number, number]> = [];
  for (const k of s) {
    const ult = saida[saida.length - 1];
    if (ult && k === ult[1] + 1) ult[1] = k;
    else saida.push([k, k]);
  }
  return saida;
}

const arred = (x: number) => Math.round(x * 100) / 100;
const limitarFino = (x: number) => Math.max(-AJUSTE_FINO_MAXIMO_SEG, Math.min(AJUSTE_FINO_MAXIMO_SEG, Math.round((Number.isFinite(x) ? x : 0) * 10) / 10));

/**
 * A conta inteira de uma escolha sobre a janela de palavras e as remoções da
 * IA. Mesmas funções da esteira: `bordasDoCorte` para a borda no silêncio,
 * `emendarNoSilencio` para o trecho tirado e `intervalosDoTrecho` para o que o
 * worker emenda.
 */
export function calcularCorte(
  palavras: PalavraDoControle[],
  remocoesDaIA: Array<{ de: number; ate: number; motivo?: string }>,
  escolha: EscolhaDoCorte,
  duracaoDaGravacao: number
): CorteCalculado {
  const W = palavras.map(comoWord);
  const pos = new Map(palavras.map((p, k) => [p.i, k]));
  let a = pos.get(escolha.comecar) ?? 0;
  let b = pos.get(escolha.terminar) ?? palavras.length - 1;
  if (b < a) [a, b] = [b, a];
  const base: Remocao[] = remocoesDaIA.map((r) => ({ de: r.de, ate: r.ate, motivo: r.motivo ?? "limpeza" }));

  // As bordas: no silêncio em volta das palavras escolhidas, mais o ajuste fino.
  const borda = bordasDoCorte({ inicio: palavras[a].inicio, fim: palavras[b].fim, emPausa: false }, W);
  const finoInicio = limitarFino(escolha.finoInicio);
  const finoFim = limitarFino(escolha.finoFim);
  const inicio = arred(Math.max(0, borda.inicio + finoInicio));
  const fim = arred(Math.min(duracaoDaGravacao || Infinity, Math.max(inicio + 1, borda.fim + finoFim)));

  const fora = new Set(escolha.fora);
  const devolverPos: number[] = [];
  const tirarPos: number[] = [];
  for (let k = a; k <= b; k++) {
    const p = palavras[k];
    const ia = motivoDaIA(p, base) !== null;
    const quer = !fora.has(p.i);
    if (ia && quer) devolverPos.push(k);
    if (!ia && !quer) tirarPos.push(k);
  }

  // Devolver: a palavra inteira e um respiro de cada lado (até metade do
  // silêncio, no máximo 0,12 s), para não sair com o ataque ou o rabo comidos.
  const devolvidos = blocos(devolverPos).map(([x, y]) => {
    const ant = palavras[x - 1];
    const seg = palavras[y + 1];
    const de = palavras[x].inicio - (ant ? Math.min(0.12, Math.max(0, (palavras[x].inicio - ant.fim) / 2)) : 0.12);
    const ate = palavras[y].fim + (seg ? Math.min(0.12, Math.max(0, (seg.inicio - palavras[y].fim) / 2)) : 0.12);
    return { de: arred(de), ate: arred(ate), texto: palavras.slice(x, y + 1).map((p) => p.texto).join(" ") };
  });
  const daIA = subtrair(base, devolvidos);

  const doCliente = emendarNoSilencio(
    blocos(tirarPos).map(([x, y]) => ({ de: palavras[x].inicio, ate: palavras[y].fim, motivo: "pedido do cliente" })),
    W
  );
  const remocoes = unir([...daIA, ...doCliente]);
  // Com ajuste fino, a borda é a que o cliente ouviu: sem o encaixe automático na palavra.
  const manter = intervalosDoTrecho(remocoes, inicio, fim, finoInicio || finoFim ? undefined : W).map((m) => ({ de: +m.de.toFixed(3), ate: +m.ate.toFixed(3) }));

  const noAr = palavras.filter((p) => estaNoAr(p, inicio, manter)).map((p) => p.i);
  const noArSet = new Set(noAr);
  const divergencias: number[] = [];
  for (let k = a; k <= b; k++) {
    const p = palavras[k];
    if (fora.has(p.i) === noArSet.has(p.i)) divergencias.push(p.i);
  }
  const duracao = +manter.reduce((s, m) => s + (m.ate - m.de), 0).toFixed(2);
  return { inicio, fim, emPausa: true, remocoes, doCliente, devolvidos, manter, noAr, duracao, divergencias };
}

/** Os intervalos da GRAVAÇÃO que o player toca, na ordem (pula o que sai). */
export function trechosParaTocar(c: Pick<CorteCalculado, "inicio" | "manter">): Intervalo[] {
  return c.manter.map((m) => ({ de: c.inicio + m.de, ate: c.inicio + m.ate }));
}

/**
 * A escolha que está valendo, lida de um corte: as palavras no ar entre as
 * bordas, o resto de fora, e o ajuste fino que reproduz as bordas exatas.
 */
export function escolhaDoCorte(palavras: PalavraDoControle[], bordas: { inicio: number; fim: number }, manter: Intervalo[]): EscolhaDoCorte {
  const dentro = palavras.filter((p) => (p.inicio + p.fim) / 2 >= bordas.inicio && (p.inicio + p.fim) / 2 <= bordas.fim);
  const lista = dentro.length ? dentro : palavras.slice(0, 1);
  const comecar = lista[0].i;
  const terminar = lista[lista.length - 1].i;
  const W = palavras.map(comoWord);
  const calc = bordasDoCorte({ inicio: lista[0].inicio, fim: lista[lista.length - 1].fim, emPausa: false }, W);
  const fora = dentro.filter((p) => !estaNoAr(p, bordas.inicio, manter)).map((p) => p.i);
  return {
    comecar,
    terminar,
    fora,
    finoInicio: limitarFino(bordas.inicio - calc.inicio),
    finoFim: limitarFino(bordas.fim - calc.fim),
  };
}

/** O que mudou entre duas escolhas, em português, para o resumo antes de aplicar. */
export function resumoDaMudanca(palavras: PalavraDoControle[], antes: EscolhaDoCorte, depois: EscolhaDoCorte): string[] {
  const pos = new Map(palavras.map((p, k) => [p.i, k]));
  const linhas: string[] = [];
  const passo = (x: number, y: number) => (pos.get(y) ?? 0) - (pos.get(x) ?? 0);
  const palavrasN = (n: number) => `${n} ${n === 1 ? "palavra" : "palavras"}`;
  const dc = passo(antes.comecar, depois.comecar);
  if (dc) linhas.push(dc > 0 ? `começa ${palavrasN(dc)} depois` : `começa ${palavrasN(-dc)} antes`);
  const dt = passo(antes.terminar, depois.terminar);
  if (dt) linhas.push(dt > 0 ? `termina ${palavrasN(dt)} depois` : `termina ${palavrasN(-dt)} antes`);
  const a = new Set(antes.fora);
  const d = new Set(depois.fora);
  const dentro = (i: number) => (pos.get(i) ?? -1) >= (pos.get(depois.comecar) ?? 0) && (pos.get(i) ?? -1) <= (pos.get(depois.terminar) ?? 0);
  const devolvidas = palavras.filter((p) => dentro(p.i) && a.has(p.i) && !d.has(p.i)).map((p) => pos.get(p.i)!);
  const tiradas = palavras.filter((p) => dentro(p.i) && !a.has(p.i) && d.has(p.i)).map((p) => pos.get(p.i)!);
  const trechos = (ks: number[]) => blocos(ks).map(([x, y]) => `“${palavras.slice(x, y + 1).map((p) => p.texto).join(" ")}”`);
  for (const t of trechos(devolvidas)) linhas.push(`devolve ${t}`);
  for (const t of trechos(tiradas)) linhas.push(`tira ${t}`);
  const fino = (x: number, rotulo: string) => {
    if (Math.abs(x) < 0.05) return;
    linhas.push(`${rotulo} ${x > 0 ? "+" : "−"}${Math.abs(x).toFixed(1).replace(".", ",")} s`);
  };
  if (depois.finoInicio !== antes.finoInicio) fino(depois.finoInicio, "ajuste fino do começo");
  if (depois.finoFim !== antes.finoFim) fino(depois.finoFim, "ajuste fino do fim");
  return linhas;
}

export function mesmaEscolha(a: EscolhaDoCorte, b: EscolhaDoCorte): boolean {
  const fa = [...a.fora].sort((x, y) => x - y).join(",");
  const fb = [...b.fora].sort((x, y) => x - y).join(",");
  return a.comecar === b.comecar && a.terminar === b.terminar && fa === fb && a.finoInicio === b.finoInicio && a.finoFim === b.finoFim;
}

/**
 * A frase que contém a palavra da posição `k` (na janela): é o que um toque
 * tira ou devolve na tela. "Frase" aqui é o trecho falado de uma vez: termina
 * na pontuação (inclusive vírgula, porque a transcrição pontua pouco e um
 * ponto pode estar a um minuto de distância) ou numa pausa de 0,4 s ou mais.
 * Assim "E, e, e" sai num toque por vez, e "mas é uma história," inteira.
 */
export function fraseDaPalavra(palavras: PalavraDoControle[], k: number): [number, number] {
  const fecha = (j: number) => /[.!?…,;:]["”']?$/.test(palavras[j].texto.trim()) || (j + 1 < palavras.length && palavras[j + 1].inicio - palavras[j].fim >= 0.4);
  let x = k;
  while (x > 0 && !fecha(x - 1)) x--;
  let y = k;
  while (y < palavras.length - 1 && !fecha(y)) y++;
  return [x, y];
}

/** O bloco contínuo de palavras que a IA tirou em volta da posição `k`. */
export function blocoDaIA(palavras: PalavraDoControle[], k: number): [number, number] {
  let x = k;
  while (x > 0 && palavras[x - 1].ia) x--;
  let y = k;
  while (y < palavras.length - 1 && palavras[y + 1].ia) y++;
  return [x, y];
}

/** "0:42" ou "0:42,3". */
export function tempoCurto(s: number, decimo = false): string {
  const v = Math.max(0, s);
  const m = Math.floor(v / 60);
  const seg = v - m * 60;
  if (!decimo) return `${m}:${String(Math.floor(seg)).padStart(2, "0")}`;
  const [i, d] = seg.toFixed(1).split(".");
  return `${m}:${i.padStart(2, "0")},${d}`;
}
