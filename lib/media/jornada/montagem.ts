import type { PerguntaDoJev, RespostaDoJev } from "@/lib/jev/cliente";
import type { Jev } from "@/lib/media/jornada/decisoes";
import type { CoresDaJornada } from "@/lib/media/jornada/contexto";
import type { ElementoGerado } from "@/lib/media/jornada/geracao";
import type { AmostraDaJornada, Caixa, ElementoAprovado } from "@/lib/media/jornada/estado";
import type { Palavra } from "@/lib/media/jornada/linha-do-tempo";
import { ALTURA_DA_LEGENDA, legendaDesenhada, legendaDoEstiloFixo, paginasNoEstilo } from "@/lib/media/editor-por-comando/estilo-manda";
import type { EstiloDeLegenda } from "@/lib/media/legenda-escolhida";
import { mmss } from "@/lib/media/jornada/estado";
import type { TextoDoElemento } from "@/lib/media/jornada/textos";
import { numeroNaLegenda, partesDoNumero } from "@/lib/media/jornada/numeros";

/**
 * O PASSO 7 DA JORNADA (E5): "o JEV monta", explícito.
 *
 *   1. O CÓDIGO CALCULA AS OPÇÕES: o instante de cada palavra (entrada no
 *      gatilho menos 0,1 s, como o q() do vídeo da landing, ou no começo da
 *      frase); as caixas candidatas que não cruzam o rosto em NENHUMA amostra
 *      do intervalo (união das caixas de rosto com folga), dentro da área
 *      segura da rede (nada nos 10% de cima no vertical), fora da faixa da
 *      legenda e com tamanho legível; e um conjunto pequeno de animações.
 *   2. O JEV ESCOLHE entre essas opções (caixa, animação, entrada, som), com a
 *      fala, a leitura do trecho e o elemento.
 *   3. O REMOTION EXECUTA: só posiciona a mídia gerada na caixa escolhida,
 *      anima e desenha a legenda que o cliente escolheu. NENHUM elemento
 *      visual criado por código: a única peça é "jornada-midia" (a imagem ou o
 *      recorte gerado), e a tela cheia e o B-roll entram como inserção.
 *
 * A gravação do cliente passa intacta: sem grão, sem vinheta, sem correção de
 * cor, sem zoom de ritmo, sem transição chamativa (o worker lê `jornada`).
 * Módulo puro.
 */

// ─────────────────────────────── a área segura ───────────────────────────────

/** As margens de interface das redes, em fração do quadro (uma tabela só). Nada nos 10% de cima do vertical. */
export const AREA_SEGURA: Record<"9:16" | "16:9", { topo: number; base: number; esquerda: number; direita: number }> = {
  "9:16": { topo: 0.1, base: 0.18, esquerda: 0.05, direita: 0.12 },
  "16:9": { topo: 0.08, base: 0.08, esquerda: 0.05, direita: 0.05 },
};

const arred = (n: number) => Math.round(n * 1000) / 1000;
const cruza = (a: Caixa, b: Caixa) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const area = (c: Caixa) => c.w * c.h;
const intersecao = (a: Caixa, b: Caixa) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** As caixas de rosto (com folga) de todas as amostras do intervalo, mais tela e quadro (nunca cobrir). */
export function protegidasNoIntervalo(amostras: AmostraDaJornada[], de: number, ate: number, folga = 0.03): Caixa[] {
  const dentro = amostras.filter((a) => a.t >= de - 1.2 && a.t <= ate + 1.2);
  const saida: Caixa[] = [];
  for (const a of dentro) {
    // A caixa do rosto medida já vai da testa ao queixo; a folga é pequena em cima (o cabelo pode ficar sob o elemento, o rosto nunca).
    for (const r of a.rostos) saida.push({ x: r.x - folga, y: r.y - folga * 0.6, w: r.w + 2 * folga, h: r.h + folga * 1.6 });
    // TELA OU QUADRO ATRÁS DO ROSTO É FUNDO (08/10): no vídeo do Igor, o mapa-múndi da parede saiu medido como
    // "quadro" de 0 a 57% da altura, e nada mais coube na tela. A lousa ou a tela que a pessoa apresenta fica ao
    // lado dela; a que contém o rosto é cenário e pode ser coberta.
    const atrasDoRosto = (c: Caixa) => a.rostos.some((r) => r.x + r.w / 2 > c.x && r.x + r.w / 2 < c.x + c.w && r.y + r.h / 2 > c.y && r.y + r.h / 2 < c.y + c.h);
    if (a.tela && !atrasDoRosto(a.tela)) saida.push(a.tela);
    if (a.quadro && !atrasDoRosto(a.quadro)) saida.push(a.quadro);
  }
  return saida;
}

/** Os corpos no intervalo (cobrir o corpo é permitido, mas a caixa que não cobre é preferida). */
function corposNoIntervalo(amostras: AmostraDaJornada[], de: number, ate: number): Caixa[] {
  return amostras.filter((a) => a.t >= de - 1.2 && a.t <= ate + 1.2).flatMap((a) => a.corpos);
}

export type CaixaCandidata = { id: string; caixa: Caixa; onde: string };

/** A faixa (fração da altura) que a legenda ocupa; null sem legenda. */
export type FaixaDaLegenda = [number, number] | null;

/**
 * AS CAIXAS CANDIDATAS (código, geometria): na proporção da mídia, em
 * tamanhos legíveis, dentro da área segura, fora do rosto em todo o
 * intervalo e fora da faixa da legenda. Até 5, de regiões diferentes.
 */
export function caixasCandidatas(o: {
  formato: "9:16" | "16:9";
  W: number;
  H: number;
  /** largura / altura da mídia, em pixels. */
  proporcao: number;
  protegidas: Caixa[];
  corpos: Caixa[];
  legenda: FaixaDaLegenda;
  janela: boolean;
  /** 08/10: segunda tentativa, quando a régua normal não achou lugar; cobre mais corpo e aceita caixa menor, nunca o rosto. */
  relaxado?: boolean;
}): CaixaCandidata[] {
  const seg = AREA_SEGURA[o.formato];
  const vertical = o.formato === "9:16";
  // O elemento deitado (faixa, logos em linha) pode ocupar a largura útil; o alto e estreito, menos.
  const larguras = vertical ? (o.janela ? [0.82, 0.72, 0.62, 0.54, 0.46, ...(o.relaxado ? [0.4, 0.34] : [])] : [0.83, 0.74, 0.66, 0.56, 0.48, 0.4, 0.33, 0.28, 0.24]) : o.janela ? [0.44, 0.38, 0.32, 0.27] : [0.5, 0.42, 0.34, 0.28, 0.23, 0.19, 0.16];
  const p = Math.max(0.2, Math.min(5, o.proporcao || 1));
  const validas: Array<{ c: Caixa; nota: number }> = [];
  for (const w of larguras) {
    const h = (w * o.W) / p / o.H;
    // Legível: a menor dimensão do elemento com pelo menos ~110 px no 1080 (um logo, uma faixa de texto grande).
    if (h > 1 - seg.topo - seg.base || h * o.H < 110 * (o.H / (vertical ? 1920 : 1080)) * (vertical ? 1 : 1.3)) continue;
    for (let y = seg.topo; y + h <= 1 - seg.base + 1e-9; y += 0.02) {
      for (let x = seg.esquerda; x + w <= 1 - seg.direita + 1e-9; x += 0.02) {
        const c = { x: arred(x), y: arred(y), w: arred(w), h: arred(h) };
        if (o.protegidas.some((r) => cruza(c, r))) continue;
        if (o.legenda && c.y < o.legenda[1] && c.y + c.h > o.legenda[0]) continue;
        const corpo = o.corpos.length ? o.corpos.reduce((s, b) => s + intersecao(c, b), 0) / (o.corpos.length * area(c)) : 0;
        // 07/10 (Bruno): o elemento entra COM a pessoa na tela e pode cobrir o corpo (até 55% da caixa); o rosto nunca.
        if (corpo > (o.relaxado ? 0.9 : 0.55)) continue;
        validas.push({ c, nota: area(c) * (1 - corpo) });
      }
    }
  }
  // Uma por região (esquerda, direita, cima, baixo, centro), a melhor de cada.
  const regiao = (c: Caixa) => {
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    const h = cx < 0.4 ? "à esquerda" : cx > 0.6 ? "à direita" : "no centro";
    const v = cy < 0.4 ? "no alto" : cy > 0.6 ? "embaixo" : "na altura do meio";
    return `${h}, ${v}`;
  };
  const porRegiao = new Map<string, { c: Caixa; nota: number }>();
  for (const v of validas) {
    const r = regiao(v.c);
    const atual = porRegiao.get(r);
    if (!atual || v.nota > atual.nota) porRegiao.set(r, v);
  }
  // Nunca miniatura: só as caixas perto da maior (o elemento entra grande e legível, como no vídeo da landing).
  const maior = Math.max(0, ...[...porRegiao.values()].map((v) => v.nota));
  const piso = vertical ? (o.relaxado ? 0.3 : 0.45) : 0.2;
  return [...porRegiao.entries()]
    .filter(([, v]) => v.nota >= 0.6 * maior && v.c.w >= piso)
    .sort((a, b) => b[1].nota - a[1].nota)
    .slice(0, 5)
    .map(([onde, v], i) => ({ id: `c${i}`, caixa: v.c, onde: `${onde}, ${Math.round(v.c.w * 100)}% da largura` }));
}

// ─────────────────────────────── o tempo ───────────────────────────────

/** O teto e o piso de tela de cada formato (s): recorte e janela ficam a frase; tela cheia e B-roll são curtos. */
const DURACAO: Record<ElementoAprovado["formato"], [number, number]> = { "recorte-sobre": [2, 4.5], janela: [2.2, 5], "tela-cheia": [2, 3.5], broll: [2.5, 3], grafico: [2.2, 4.5] };

export type OpcaoDeTempo = { gatilho: { de: number; ate: number }; frase: { de: number; ate: number } };

/** As duas opções de entrada (na palavra ou na frase) e a saída: fim da frase, o próximo elemento ou o teto. */
export function temposDoElemento(el: { formato: ElementoAprovado["formato"]; t: number; fraseDe: number; fraseAte: number }, proximo: number | null, duracao: number): OpcaoDeTempo {
  const [piso, teto] = DURACAO[el.formato];
  const limite = Math.min(duracao - 0.05, proximo !== null ? proximo - 0.25 : Infinity);
  const op = (de0: number) => {
    const de = Math.max(0, de0);
    const ate = Math.min(limite, Math.max(de + piso, Math.min(de + teto, el.fraseAte + 0.6)));
    return { de: arred(de), ate: arred(Math.max(de + 0.6, ate)) };
  };
  return { gatilho: op(el.t - 0.1), frase: op(Math.min(el.t - 0.1, el.fraseDe - 0.05)) };
}

// ─────────────────────────────── a legenda ───────────────────────────────

export type LegendaDaJornada = { mostrar: false } | { mostrar: true; estilo: EstiloDeLegenda; automatica: boolean };

/** As páginas curtas da legenda do vídeo da landing (até ~30 letras, quebra na pontuação). Puro. */
export function paginasDoPitch(palavras: Palavra[]): Array<{ inicio: number; fim: number; texto: string }> {
  const saida: Array<{ inicio: number; fim: number; texto: string }> = [];
  let g: Palavra[] = [];
  palavras.forEach((p, j) => {
    g.push(p);
    const txt = g.map((x) => x.texto).join(" ");
    const prox = palavras[j + 1];
    const pausa = prox ? prox.inicio - p.fim : 1;
    if (txt.length >= 28 || (/[.,:;?!]$/.test(p.texto) && g.length >= 2) || pausa > 0.6 || !prox) {
      saida.push({ inicio: g[0].inicio, fim: Math.min(prox ? prox.inicio : p.fim + 0.4, p.fim + 0.35), texto: txt.replace(/[,.:;]+$/, "") });
      g = [];
    }
  });
  return saida;
}

/**
 * A LEGENDA QUE O CLIENTE ESCOLHEU, sempre: "sem" não queima nada; o estilo
 * fixado (palavra, caixa, marca-texto, papel, limpa) vai com o desenho dele; a
 * Automática é a do vídeo da landing, igual para todo nicho. Devolve o que vai
 * ao worker e a faixa que ela ocupa (a caixa do elemento é que cede).
 */
/**
 * ONDE A LEGENDA FICA, PELA MEDIÇÃO (08/10). Até aqui a posição vinha do estilo: o "palavra" e todo comando com
 * "no meio" cravavam "centro", e a legenda ia para o peito (vídeo do Igor, 07/10). Agora a medição do rosto ao
 * longo do vídeo inteiro decide: a faixa de baixo (acima da interface das redes) quando o rosto termina antes
 * dela; senão a de cima, dentro da área segura; senão a de baixo mesmo (cobrindo o peito, nunca o rosto).
 * O estilo só muda o DESENHO da legenda. Puro.
 */
export function posicaoDaLegenda(amostras: AmostraDaJornada[], formato: "9:16" | "16:9", altura: number): { posicao: "baixo" | "topo"; faixa: [number, number] } {
  const seg = AREA_SEGURA[formato];
  const fimDeBaixo = formato === "9:16" ? 0.83 : 0.95;
  const baixo: [number, number] = [arred(fimDeBaixo - altura), fimDeBaixo];
  const topo: [number, number] = [seg.topo + 0.01, arred(seg.topo + 0.01 + altura)];
  const rostos = amostras.flatMap((a) => a.rostos);
  if (!rostos.length) return { posicao: "baixo", faixa: baixo };
  const quantil = (v: number[], q: number) => [...v].sort((a, b) => a - b)[Math.min(v.length - 1, Math.max(0, Math.floor(q * (v.length - 1))))];
  const fimDoRosto = quantil(rostos.map((r) => r.y + r.h), 0.85);
  const comecoDoRosto = quantil(rostos.map((r) => r.y), 0.15);
  if (fimDoRosto + 0.02 <= baixo[0]) return { posicao: "baixo", faixa: baixo };
  if (comecoDoRosto - 0.02 >= topo[1]) return { posicao: "topo", faixa: topo };
  return { posicao: "baixo", faixa: baixo };
}

/**
 * A LEGENDA QUE O CLIENTE ESCOLHEU, sempre: "sem" não queima nada; o estilo
 * fixado (palavra, caixa, marca-texto, papel, limpa) vai com o desenho dele; a
 * Automática é a do vídeo da landing, igual para todo nicho. A POSIÇÃO vem da
 * medição (posicaoDaLegenda), nunca do estilo. Devolve o que vai ao worker e
 * a faixa que ela ocupa (a caixa do elemento é que cede).
 */
export function legendaDaJornada(l: LegendaDaJornada, palavras: Palavra[], formato: "9:16" | "16:9", amostras: AmostraDaJornada[]): { legenda: { paginas: Array<Record<string, unknown>>; estilo?: Record<string, unknown> } | null; faixa: FaixaDaLegenda } {
  const vertical = formato === "9:16";
  if (!l.mostrar) return { legenda: null, faixa: null };
  const rosto = amostras.find((a) => a.rostos.length)?.rostos[0] ?? null;
  if (!l.automatica) {
    const est = legendaDoEstiloFixo(l.estilo);
    const desenho = legendaDesenhada(est, rosto ?? { x: 0.35, y: 0.15, w: 0.3, h: 0.3 }, vertical);
    const lugar = posicaoDaLegenda(amostras, formato, ALTURA_DA_LEGENDA[desenho.tamanho] ?? 0.11);
    const { y: _y, ...semY } = desenho as typeof desenho & { y?: number };
    void _y;
    return {
      legenda: { paginas: paginasNoEstilo(palavras, est, vertical), estilo: { ...semY, posicao: lugar.posicao } as unknown as Record<string, unknown> },
      faixa: [Math.max(0, lugar.faixa[0] - 0.03), Math.min(1, lugar.faixa[1] + 0.03)],
    };
  }
  const lugar = posicaoDaLegenda(amostras, formato, vertical ? 0.1 : 0.09);
  return {
    legenda: { paginas: paginasDoPitch(palavras).map((p) => (lugar.posicao === "topo" ? { ...p, faixa: "topo" } : p)) },
    faixa: [Math.max(0, lugar.faixa[0] - 0.03), Math.min(1, lugar.faixa[1] + 0.03)],
  };
}

// ─────────────────────────────── o texto em camada (07/10) ───────────────────────────────

const normalPalavra = (s: string) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

/**
 * O INSTANTE DE CADA ITEM, pela palavra falada (o q() da landing): a primeira
 * vez que a palavra é dita entre `de` e `limite`, menos 0,1 s. Itens sem a
 * palavra na janela saem; dois itens nunca a menos de 0,6 s um do outro.
 */
export function temposDosItens(itens: TextoDoElemento["itens"], palavras: Palavra[], de: number, limite: number): Array<{ texto: string; t: number }> {
  const saida: Array<{ texto: string; t: number }> = [];
  let depois = de + 0.35;
  for (const it of itens) {
    const alvo = normalPalavra(it.palavra.split(/\s+/)[0]);
    // A palavra pode ser a do próprio gatilho (dita na entrada): o item entra logo depois do título.
    const p = palavras.find((w) => w.inicio >= (saida.length ? depois - 0.15 : de - 0.2) && w.inicio < limite - 0.8 && normalPalavra(w.texto) === alvo);
    if (!p) continue;
    const t = Math.max(depois, p.inicio - 0.1);
    saida.push({ texto: it.texto, t: arred(t) });
    depois = t + 0.6;
  }
  return saida;
}

/** A altura aproximada do texto (fração do quadro): o título em duas linhas e cada item. */
function alturaDoTexto(nItens: number, vertical: boolean, H: number, W: number): number {
  const u = (Math.min(W, H) / 1080) * (vertical ? 1.3 : 1);
  return ((vertical ? 50 : 58) * u * 1.06 * 2 + 44 * u + nItens * ((vertical ? 34 : 36) * u * 1.15 + 44 * u)) / H;
}

/**
 * ONDE O TEXTO FICA (geometria): na tela cheia, no alto à esquerda (como a
 * landing); sobre a gravação, encostado na caixa da mídia (acima ou abaixo,
 * nunca por cima dela), sempre com a ALTURA INTEIRA do texto fora
 * do rosto, da tela, do quadro e da faixa da legenda. Não coube com todos os
 * itens, tenta com menos; nem o título cabe, null (o texto fica fora).
 */
export function ancoraDoTexto(o: { formato: "9:16" | "16:9"; W: number; H: number; caixa: Caixa | null; protegidas: Caixa[]; legenda: FaixaDaLegenda; nItens: number }): { x: number; y: number; w: number; itens: number } | null {
  const seg = AREA_SEGURA[o.formato];
  const vertical = o.formato === "9:16";
  if (!o.caixa) return { x: vertical ? 0.06 : 0.05, y: vertical ? 0.11 : 0.08, w: vertical ? 0.86 : 0.5, itens: o.nItens };
  const c = o.caixa;
  const w = Math.max(c.w, vertical ? 0.7 : 0.36);
  const x = Math.min(Math.max(seg.esquerda, c.x), 1 - seg.direita - w);
  const livre = (r: Caixa) =>
    r.y >= seg.topo - 1e-9 && r.y + r.h <= 1 - seg.base + 1e-9 && !o.protegidas.some((p) => cruza(r, p)) && !(o.legenda && r.y < o.legenda[1] && r.y + r.h > o.legenda[0]);
  for (let n = o.nItens; n >= 0; n--) {
    const h = alturaDoTexto(n, vertical, o.H, o.W);
    // Nunca por cima da própria mídia (prova de 07/10: o vidro tampou o recorte); sem lugar ao lado dela, o texto fica fora.
    for (const r of [
      { x, y: c.y - h - 0.012, w, h },
      { x, y: c.y + c.h + 0.012, w, h },
    ]) {
      if (livre(r)) return { x: arred(r.x), y: arred(r.y), w: arred(r.w), itens: n };
    }
  }
  return null;
}

/**
 * ONDE O GRÁFICO FICA (07/10, geometria): a pessoa segue na tela, e o gráfico
 * ocupa a primeira faixa livre de rosto, tela, quadro e legenda (pode cobrir o
 * corpo): no vertical, de cima para baixo na largura útil; no deitado, a coluna
 * do lado livre. Sem lugar com todos os itens, tenta com menos; nem o título
 * cabe, null.
 */
export function lugarDoGrafico(o: { formato: "9:16" | "16:9"; W: number; H: number; protegidas: Caixa[]; legenda: FaixaDaLegenda; nItens: number; grande?: boolean }): { x: number; y: number; w: number; itens: number; escala: number } | null {
  const seg = AREA_SEGURA[o.formato];
  const vertical = o.formato === "9:16";
  const u = (Math.min(o.W, o.H) / 1080) * (vertical ? 1.3 : 1);
  const colunas = vertical ? [{ x: 0.06, w: 0.86 }] : [{ x: seg.esquerda, w: 0.4 }, { x: 1 - seg.direita - 0.4, w: 0.4 }];
  // Rosto grande no vertical deixa só uma faixa no alto (prova de 07/10: 15% da altura): o gráfico encolhe até 62%
  // (o título ainda passa de 38 px num quadro de 1080) e solta itens antes de ficar fora.
  for (const escala of [1, 0.85, 0.72, 0.62]) {
    for (let n = o.nItens; n >= 0; n--) {
      const h = (alturaDoTexto(n, vertical, o.H, o.W) + (o.grande ? (150 * u) / o.H : 0)) * escala;
      for (const c of colunas) {
        for (let y = seg.topo; y + h <= 1 - seg.base + 1e-9; y += 0.01) {
          const r = { x: c.x, y, w: c.w, h };
          if (o.protegidas.some((p) => cruza(r, p))) continue;
          if (o.legenda && r.y < o.legenda[1] && r.y + r.h > o.legenda[0]) continue;
          return { x: arred(c.x), y: arred(y), w: arred(c.w), itens: n, escala };
        }
      }
      if (escala < 1 && n === o.nItens && n > 1) continue;
    }
  }
  return null;
}

// ─────────────────────────────── a escolha do JEV e a edição ───────────────────────────────

export const ANIMACOES = { deslizar: "entra deslizando do lado livre e sai suave", crescer: "cresce do centro da caixa com mola curta", desfoque: "surge do desfoque para o nítido" } as const;
export type Animacao = keyof typeof ANIMACOES;
export const SONS = { nenhum: "sem som", whoosh: "um sopro curto de entrada", pop: "um estalo leve", impacto: "uma batida grave curta, para o momento forte" } as const;
export type Som = keyof typeof SONS;

export type ElementoParaMontar = {
  aprovado: ElementoAprovado;
  gerado: ElementoGerado;
  /** O gatilho e a frase já no tempo da fala do completo. */
  t: number;
  fraseDe: number;
  fraseAte: number;
};

export type EdicaoDaJornada = {
  versao: 1;
  jornada: true;
  largura: number;
  altura: number;
  fps: number;
  duracao: number;
  tema: Record<string, unknown>;
  camadas: Array<Record<string, unknown>>;
  planos: Array<Record<string, unknown>>;
  camera: never[];
  insercoes: Record<string, { tipo: "imagem" | "video"; url: string; origem: "jornada" }>;
  legenda: { paginas: Array<Record<string, unknown>>; estilo?: Record<string, unknown> } | null;
  sons: Array<{ t: number; som: string; volume: number }>;
  logoUrl: null;
};

export type MontagemFeita = { edicao: EdicaoDaJornada; avisos: string[]; avisosDoCliente: string[]; escolhas: Array<Record<string, unknown>>; trilha: boolean };

const VOLUME: Record<Exclude<Som, "nenhum">, number> = { whoosh: 0.22, pop: 0.14, impacto: 0.24 };

const escolha = <T extends string>(r: RespostaDoJev | undefined, opcoes: readonly T[]): T | null =>
  r && r.type === "choice" && (r.confidence ?? 0) >= 0.25 && (opcoes as readonly string[]).includes(r.choice) ? (r.choice as T) : null;

/**
 * O PASSO 7 INTEIRO: as opções pelo código, a escolha pelo JEV, a edição para
 * o worker. Elemento sem mídia gerada não entra (o aviso do cliente já saiu na
 * geração); o resto é exatamente a lista aprovada.
 */
export async function montarEdicao(o: {
  elementos: ElementoParaMontar[];
  amostras: AmostraDaJornada[];
  formato: "9:16" | "16:9";
  W: number;
  H: number;
  fps: number;
  duracao: number;
  palavras: Palavra[];
  legenda: LegendaDaJornada;
  cores: CoresDaJornada;
  jev: Jev | null;
  projectId?: string | null;
  temTrilha: boolean;
  leituraDoTrecho?: (t: number) => string | null;
  /** O texto em camada que o Claude escreveu, por elemento (07/10); o JEV decide se entra. */
  textos?: Record<string, TextoDoElemento>;
}): Promise<MontagemFeita> {
  const avisos: string[] = [];
  const avisosDoCliente: string[] = [];
  // A legenda com os números legíveis (08/10: "DE 424757" no vídeo do Igor).
  const leg = legendaDaJornada(o.legenda, o.palavras.map((p) => ({ ...p, texto: numeroNaLegenda(p.texto) })), o.formato, o.amostras);
  // O gráfico (07/10) não tem mídia: entra pelo texto que o Claude escreveu.
  const comMidia = o.elementos.filter((e) => e.gerado.url || (e.gerado.formato === "grafico" && o.textos?.[e.aprovado.id])).sort((a, b) => a.t - b.t);
  for (const e of o.elementos) if (e.gerado.formato === "grafico" && !o.textos?.[e.aprovado.id]) avisos.push(`${e.aprovado.id}: gráfico sem texto escrito, ficou fora`);
  // 1. AS OPÇÕES (código).
  const opcoes = comMidia.map((e, i) => {
    const proximo = comMidia[i + 1]?.t ?? null;
    const formato = e.gerado.formato;
    const tempos = temposDoElemento({ formato, t: e.t, fraseDe: e.fraseDe, fraseAte: e.fraseAte }, proximo !== null ? proximo - 0.1 : null, o.duracao);
    const naCaixa = formato === "recorte-sobre" || formato === "janela";
    const de = Math.min(tempos.gatilho.de, tempos.frase.de);
    const ate = Math.max(tempos.gatilho.ate, tempos.frase.ate);
    const medidaDaCaixa = { formato: o.formato, W: o.W, H: o.H, proporcao: e.gerado.proporcao ?? 1, protegidas: protegidasNoIntervalo(o.amostras, de, ate), corpos: corposNoIntervalo(o.amostras, de, ate), legenda: leg.faixa, janela: formato === "janela" };
    let caixas = naCaixa ? caixasCandidatas(medidaDaCaixa) : [];
    // Sem lugar folgado, a segunda régua (08/10): o objeto entra sobre o corpo em vez de sair do vídeo.
    if (naCaixa && !caixas.length) caixas = caixasCandidatas({ ...medidaDaCaixa, relaxado: true });
    return { e, formato, tempos, naCaixa, caixas };
  });
  // 2. A ESCOLHA (JEV), num lote só.
  const perguntas: Record<string, PerguntaDoJev> = {};
  for (const x of opcoes) {
    const id = x.e.aprovado.id;
    const sobre = { fala: x.e.aprovado.momento.frase, elemento: x.e.aprovado.descricao, formato: x.formato, emCena: o.leituraDoTrecho?.(x.e.t) ?? null };
    if (x.caixas.length > 1) perguntas[`c_${id}`] = { type: "choice", instructions: { pergunta: "Em qual lugar da tela o elemento fica melhor, sem disputar com a pessoa?", ...sobre }, criteria: Object.fromEntries(x.caixas.map((c) => [c.id, c.onde])) };
    if (x.naCaixa) perguntas[`a_${id}`] = { type: "choice", instructions: { pergunta: "Como o elemento entra?", ...sobre }, criteria: { ...ANIMACOES } };
    perguntas[`e_${id}`] = { type: "choice", instructions: { pergunta: "O elemento entra na palavra que o chama ou no começo da frase?", palavra: x.e.aprovado.gatilho.palavra, ...sobre }, criteria: { gatilho: `na palavra "${x.e.aprovado.gatilho.palavra}"`, frase: "no começo da frase" } };
    perguntas[`s_${id}`] = { type: "choice", instructions: { pergunta: "Que som acompanha a entrada deste elemento?", ...sobre }, criteria: { ...SONS } };
    const tx = o.textos?.[id];
    if (tx && x.formato !== "grafico")
      perguntas[`t_${id}`] = {
        type: "choice",
        instructions: { pergunta: "O texto escrito para este momento entra por cima do elemento, num painel de vidro, com os itens aparecendo na palavra falada (como num vídeo de apresentação)?", titulo: tx.titulo, itens: tx.itens.map((i) => i.texto), ...sobre },
        criteria: { com: "com o texto: reforça a ideia e dá ritmo ao momento", sem: "sem o texto: a mídia fala sozinha ou o texto repete a imagem" },
      };
  }
  if (o.temTrilha) perguntas.trilha = { type: "choice", instructions: { pergunta: "O vídeo leva a trilha musical do projeto por baixo da voz?", duracao: Math.round(o.duracao), formato: o.formato }, criteria: { com: "com a trilha baixinha por baixo da voz", sem: "sem trilha: só a voz" } };
  let r: Record<string, RespostaDoJev> = {};
  if (o.jev && Object.keys(perguntas).length) {
    try {
      r = await o.jev({ projectId: o.projectId, etapa: "jornada-montagem", state: { tarefa: "montar os elementos gerados sobre a gravação, sem cobrir o rosto, no ritmo da fala", formato: o.formato } }, perguntas);
    } catch (err) {
      avisos.push(`JEV da montagem não respondeu (${err instanceof Error ? err.message.slice(0, 100) : err}); valeram as primeiras opções calculadas`);
    }
  }
  // 3. A EDIÇÃO (o que o Remotion e o ffmpeg executam).
  const camadas: EdicaoDaJornada["camadas"] = [];
  const planos: EdicaoDaJornada["planos"] = [];
  const insercoes: EdicaoDaJornada["insercoes"] = {};
  const sons: EdicaoDaJornada["sons"] = [];
  const escolhas: Array<Record<string, unknown>> = [];
  let fimAnterior = -1;
  for (const x of opcoes) {
    const id = x.e.aprovado.id;
    const entrada = escolha(r[`e_${id}`], ["gatilho", "frase"] as const) ?? "gatilho";
    let { de, ate } = x.tempos[entrada];
    if (de < fimAnterior + 0.15) de = arred(fimAnterior + 0.15);
    if (ate - de < 0.8) {
      avisos.push(`${id}: sem tempo livre entre os vizinhos, ficou fora`);
      continue;
    }
    const som = escolha(r[`s_${id}`], Object.keys(SONS) as Som[]) ?? "nenhum";
    if (x.formato === "grafico") {
      // O GRÁFICO EM CÓDIGO (07/10): ao lado da pessoa, que segue na tela; o lugar é o primeiro livre de rosto e legenda (pode cobrir o corpo).
      const tx = o.textos![id];
      const prox = opcoes[opcoes.indexOf(x) + 1]?.e.t;
      const limite = Math.min(o.duracao - 0.05, prox !== undefined ? prox - 0.35 : Infinity, de + 8);
      const itens = temposDosItens(tx.itens, o.palavras, de, limite).map((i) => ({ texto: i.texto, t: arred(i.t - de) }));
      // O rosto medido só no tempo em que o gráfico fica na tela (com os itens, ou só o título): mais adiante ele pode subir no quadro.
      const fimComItens = itens.length ? Math.min(limite, Math.max(ate, de + itens.at(-1)!.t + 1.6)) : ate;
      // Só o número e o cronômetro pedem uma linha a mais; o ícone vai na linha do título.
      const base = { formato: o.formato, W: o.W, H: o.H, legenda: leg.faixa, grande: Boolean(tx.numero || /cronometro|relogio|prazo|tempo/.test(tx.tipo ?? "")) };
      const lugar =
        lugarDoGrafico({ ...base, protegidas: protegidasNoIntervalo(o.amostras, de, fimComItens), nItens: itens.length }) ??
        lugarDoGrafico({ ...base, protegidas: protegidasNoIntervalo(o.amostras, de, ate), nItens: 0 }) ??
        lugarDoGrafico({ ...base, grande: false, protegidas: protegidasNoIntervalo(o.amostras, de, ate), nItens: 0 });
      if (!lugar) {
        avisos.push(`${id}: o gráfico não coube fora do rosto e da legenda; ficou fora`);
        continue;
      }
      const cabem = itens.slice(0, lugar.itens);
      const semCabeca = base.grande && !lugarDoGrafico({ ...base, protegidas: protegidasNoIntervalo(o.amostras, de, ate), nItens: lugar.itens });
      ate = cabem.length ? Math.min(limite, Math.max(ate, de + cabem.at(-1)!.t + 1.6)) : ate;
      camadas.push({
        id,
        peca: "jornada-texto",
        de,
        ate: arred(ate),
        entrada: 0.4,
        saida: 0.25,
        evento: 0.4,
        eventos: cabem.map((i) => arred(de + i.t)),
        // O número que conta e o ícone que pulsa se mexem o tempo todo.
        ...(tx.numero || tx.icone || /cronometro|relogio|contador/.test(tx.tipo ?? "") ? { continua: true } : {}),
        passes: ["frente", "vidro"],
        props: { grafico: true, tipo: tx.tipo ?? "titulo", titulo: tx.titulo, destaque: tx.destaque, numero: semCabeca ? null : tx.numero ?? null, numeroPartes: !semCabeca && tx.numero ? partesDoNumero(tx.numero) : null, icone: tx.icone ?? null, ...(semCabeca ? { tipo: "titulo" } : {}), itens: cabem, ancora: { x: lugar.x, y: lugar.y, w: lugar.w }, escala: lugar.escala, escurecer: false },
      });
      escolhas.push({ id, formato: "grafico", tipo: tx.tipo ?? "titulo", entrada, som, de, ate: arred(ate), texto: { titulo: tx.titulo, numero: tx.numero ?? null, icone: tx.icone ?? null, itens: cabem.map((i) => i.texto) } });
      if (som !== "nenhum") sons.push({ t: arred(Math.max(0, de - 0.05)), som, volume: VOLUME[som] });
      fimAnterior = ate;
      continue;
    }
    if (x.naCaixa) {
      const proporcaoDoQuadro = o.W / o.H;
      const cabeInteira = Math.abs((x.e.gerado.proporcao ?? 0) / proporcaoDoQuadro - 1) <= 0.2;
      if (!x.caixas.length && x.formato === "janela" && cabeInteira) {
        // A janela sem lugar fora do rosto entra em tela cheia (a imagem é opaca e cobre a gravação inteira, nunca o rosto por cima).
        avisos.push(`${id}: nenhuma caixa legível fora do rosto; a janela entrou em tela cheia`);
        insercoes[id] = { tipo: "imagem", url: x.e.gerado.url!, origem: "jornada" };
        ate = Math.min(ate, de + 3);
        planos.push({ tipo: "insercao", midia: id, de, ate });
        escolhas.push({ id, formato: "tela-cheia", entrada, som, de, ate });
      } else if (!x.caixas.length) {
        // O recorte (transparente) não tem lugar legível fora do rosto: não entra por cima do rosto; o aviso vai ao cliente.
        avisos.push(`${id}: nenhuma caixa legível fora do rosto no momento; o elemento ficou fora`);
        avisosDoCliente.push(`No momento ${mmss(de)}, o elemento "${x.e.aprovado.descricao.slice(0, 80)}" ficou fora porque não havia lugar na tela sem cobrir você. Peça de novo em outro momento.`);
        continue;
      } else {
        const cid = escolha(r[`c_${id}`], x.caixas.map((c) => c.id)) ?? x.caixas[0].id;
        const caixa = x.caixas.find((c) => c.id === cid)!.caixa;
        const animacao = escolha(r[`a_${id}`], Object.keys(ANIMACOES) as Animacao[]) ?? "crescer";
        const lado = caixa.x + caixa.w / 2 < 0.5 ? "esquerda" : "direita";
        // "continua" (07/10): a mídia deriva o tempo todo; sem isto o render condensado desenha um quadro só e a congela.
        camadas.push({ id, peca: "jornada-midia", de, ate, entrada: 0.45, saida: 0.35, evento: 0.5, eventos: [], continua: true, passes: ["frente"], props: { imagem: x.e.gerado.url, caixa, animacao, lado, proporcaoDaImagem: x.e.gerado.proporcao ?? null, janela: x.formato === "janela" } });
        escolhas.push({ id, caixa: cid, onde: x.caixas.find((c) => c.id === cid)!.onde, animacao, entrada, som, de, ate });
      }
    } else {
      insercoes[id] = { tipo: x.e.gerado.tipo === "video" ? "video" : "imagem", url: x.e.gerado.url!, origem: "jornada" };
      planos.push({ tipo: "insercao", midia: id, de, ate });
      escolhas.push({ id, formato: x.formato, entrada, som, de, ate });
    }
    if (som !== "nenhum") sons.push({ t: arred(Math.max(0, de - 0.05)), som, volume: VOLUME[som] });
    // O TEXTO EM CAMADA (07/10): o que o Claude escreveu, se o JEV quis; os itens na palavra falada.
    const tx = o.textos?.[id];
    if (tx && (escolha(r[`t_${id}`], ["com", "sem"] as const) ?? "com") === "com") {
      const prox = opcoes[opcoes.indexOf(x) + 1]?.e.t;
      // Na tela cheia a pessoa some: o texto a segura no máximo 6 s; sobre a gravação, até 9 s.
      const naTela = !(camadas.find((cc) => cc.id === id)?.props as { caixa?: Caixa } | undefined)?.caixa;
      const limite = Math.min(o.duracao - 0.05, prox !== undefined ? prox - 0.35 : Infinity, de + (naTela ? 6 : 9));
      const itens = temposDosItens(tx.itens, o.palavras, de, limite).map((i) => ({ texto: i.texto, t: arred(i.t - de) }));
      const caixaDaMidia = (camadas.find((cc) => cc.id === id)?.props as { caixa?: Caixa } | undefined)?.caixa ?? null;
      const telaCheia = !caixaDaMidia;
      const ancora = ancoraDoTexto({ formato: o.formato, W: o.W, H: o.H, caixa: caixaDaMidia, protegidas: telaCheia ? [] : protegidasNoIntervalo(o.amostras, de, limite), legenda: leg.faixa, nItens: itens.length });
      const esc = escolhas.at(-1);
      if (ancora) {
        const cabem = itens.slice(0, ancora.itens);
        // A mídia acompanha o texto até o último item que entrou (só quando o texto entra).
        const fimDoTexto = cabem.length ? Math.min(limite, Math.max(ate, de + cabem.at(-1)!.t + 1.6)) : ate;
        if (fimDoTexto > ate + 0.05) {
          // A mídia acompanha o texto até o último item.
          const ult = planos.at(-1);
          if (ult && ult.midia === id) ult.ate = arred(fimDoTexto);
          const cam = camadas.find((cc) => cc.id === id);
          if (cam) cam.ate = arred(fimDoTexto);
          ate = arred(fimDoTexto);
          if (esc && esc.id === id) esc.ate = ate;
        }
        // Cada item é um EVENTO da camada (07/10): o render condensado só redesenha a camada na entrada, nos eventos e na saída.
        camadas.push({ id: `${id}-texto`, peca: "jornada-texto", de, ate, entrada: 0.35, saida: 0.22, evento: 0.4, eventos: cabem.map((i) => arred(de + i.t)), passes: ["frente", "vidro"], props: { titulo: tx.titulo, destaque: tx.destaque, itens: cabem, ancora: { x: ancora.x, y: ancora.y, w: ancora.w }, escurecer: telaCheia } });
        if (esc && esc.id === id) Object.assign(esc, { texto: { titulo: tx.titulo, itens: cabem.map((i) => i.texto) } });
      } else {
        avisos.push(`${id}: o texto não coube fora do rosto e ficou fora`);
        if (esc && esc.id === id) Object.assign(esc, { texto: null });
      }
    }
    fimAnterior = ate;
  }
  const trilha = o.temTrilha && escolha(r.trilha, ["com", "sem"] as const) === "com";
  return {
    edicao: {
      versao: 1,
      jornada: true,
      largura: o.W,
      altura: o.H,
      fps: o.fps,
      duracao: o.duracao,
      tema: { acento: o.cores.acento, escuro: o.cores.escuro, claro: o.cores.claro, escuroLegenda: o.cores.escuro, fonteTitulo: "Geist", pesoTitulo: 600, fonteTexto: "Geist", fonteMono: "Geist Mono", visual: "vidro", caixaAlta: false },
      camadas,
      planos,
      camera: [],
      insercoes,
      legenda: leg.legenda,
      sons,
      logoUrl: null,
    },
    avisos,
    avisosDoCliente,
    escolhas,
    trilha,
  };
}
