import { larguraEmCorpos } from "@/lib/media/metricas-de-fonte";

/**
 * TEXTO NUNCA SOBREPÕE NEM CORTA (06/10/2026).
 *
 * O caso: o infográfico do Demandou de 06/10 saiu com o número grande do
 * cartão ("9,3 horas por dia") por cima do parágrafo, "Até 70% de economia"
 * em cima de "Tecnologias como Launchpad...", parágrafos cortados no pé dos
 * cartões e "R$ 1.500 a R$ 30.000" quebrado em duas linhas desalinhadas no
 * rodapé. A causa era a mesma em todos: o compositor dava a cada texto um
 * corpo fixo e deixava o Satori quebrar as linhas sozinho dentro de caixas de
 * altura fixa com `overflow: hidden`. No flex do Satori (Yoga) um filho
 * encolhe abaixo da altura do próprio texto, e o texto vaza por cima do
 * vizinho; o que passa do pé da caixa é cortado no meio da linha.
 *
 * A regra, para todo compositor (não é de um estilo): MEDIR antes de
 * desenhar, pela métrica real da fonte (lib/media/metricas-de-fonte.ts), e
 * desenhar as linhas que foram medidas, uma por uma. Quando não cabe:
 *   1. reduz o corpo de todos os blocos juntos, até o piso de cada um;
 *   2. só no piso, e só nos blocos marcados como cortáveis (o parágrafo, nunca
 *      o número nem o título), corta a última linha com reticência;
 *   3. avisa no log, para o corte nunca ser silencioso.
 *
 * Puro: sem sharp, sem Satori, sem banco. Os testes rodam sem nada pago.
 */

export type FonteDeMedida = "Anton" | "PT Serif" | "Liberation Sans";

export const RETICENCIA = "…";

function larguraDe(texto: string, fonte: FonteDeMedida, corpo: number): number {
  return larguraEmCorpos(texto, fonte) * corpo;
}

/** Quebra uma palavra larga demais em pedaços que cabem (último recurso: endereço, número enorme). */
function partirPalavra(palavra: string, fonte: FonteDeMedida, corpo: number, largura: number): string[] {
  const pedacos: string[] = [];
  let atual = "";
  for (const ch of palavra) {
    if (atual && larguraDe(atual + ch, fonte, corpo) > largura) {
      pedacos.push(atual);
      atual = ch;
    } else atual += ch;
  }
  if (atual) pedacos.push(atual);
  return pedacos;
}

/** Quebra gulosa por palavra, medindo cada linha. Palavra maior que a linha é partida. */
export function quebrarLinhas(texto: string, fonte: FonteDeMedida, corpo: number, largura: number): string[] {
  const palavras = texto.split(/\s+/).filter(Boolean);
  const linhas: string[] = [];
  let atual = "";
  for (const w of palavras) {
    const tentativa = atual ? `${atual} ${w}` : w;
    if (larguraDe(tentativa, fonte, corpo) <= largura) {
      atual = tentativa;
      continue;
    }
    if (atual) linhas.push(atual);
    if (larguraDe(w, fonte, corpo) <= largura) atual = w;
    else {
      const pedacos = partirPalavra(w, fonte, corpo, largura);
      linhas.push(...pedacos.slice(0, -1));
      atual = pedacos[pedacos.length - 1] ?? "";
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/** A linha cortada com reticência, sem passar da largura. */
export function comReticencia(linha: string, fonte: FonteDeMedida, corpo: number, largura: number): string {
  let palavras = linha.split(" ").filter(Boolean);
  // Tira a pontuação solta do fim antes da reticência ("negócio,…" fica feio).
  const montar = (ws: string[]) => `${ws.join(" ").replace(/[\s,;:.\-]+$/, "")}${RETICENCIA}`;
  while (palavras.length > 1 && larguraDe(montar(palavras), fonte, corpo) > largura) palavras = palavras.slice(0, -1);
  let saida = montar(palavras);
  while (saida.length > 1 && larguraDe(saida, fonte, corpo) > largura) saida = `${saida.slice(0, -2)}${RETICENCIA}`;
  return saida;
}

export interface BlocoDeTexto {
  /** Nome para o log ("parágrafo do cartão 2"). */
  nome: string;
  texto: string;
  fonte: FonteDeMedida;
  /** Corpo máximo, em pixels. */
  corpo: number;
  /** Corpo mínimo, em pixels: abaixo disto não se lê no celular. */
  piso: number;
  /** Altura da linha, em corpos (o lineHeight do desenho). */
  entrelinha: number;
  /** Linhas no máximo; acima disso o bloco não cabe nesse corpo. */
  maxLinhas?: number;
  /** Espaço depois do bloco, em pixels (escala junto com o corpo). */
  depois?: number;
  /** Largura própria (o título ao lado do círculo é mais estreito que o cartão). */
  largura?: number;
  /** Altura mínima da linha do bloco (o círculo do número ao lado do título). */
  alturaMinima?: number;
  /** Só o que pode perder o fim (o parágrafo). Número e título nunca são cortados. */
  cortavel?: boolean;
}

export interface BlocoMedido {
  nome: string;
  linhas: string[];
  corpo: number;
  /** Altura ocupada pelo bloco, sem o espaço depois. */
  altura: number;
  depois: number;
  cortado: boolean;
}

export interface Encaixe {
  blocos: BlocoMedido[];
  /** A escala aplicada aos corpos (1 = o máximo). */
  escala: number;
  altura: number;
  cabe: boolean;
  cortado: boolean;
}

function medirBloco(b: BlocoDeTexto, escala: number, largura: number): BlocoMedido {
  const corpo = Math.max(b.piso, b.corpo * escala);
  const linhas = b.texto.trim() ? quebrarLinhas(b.texto, b.fonte, corpo, b.largura ?? largura) : [];
  const alturaDasLinhas = linhas.length * corpo * b.entrelinha;
  const altura = linhas.length ? Math.max(alturaDasLinhas, b.alturaMinima ? b.alturaMinima * Math.max(escala, b.piso / b.corpo) : 0) : 0;
  return { nome: b.nome, linhas, corpo, altura, depois: linhas.length ? (b.depois ?? 0) * Math.max(escala, 0.6) : 0, cortado: false };
}

function somar(blocos: BlocoMedido[]): number {
  const visiveis = blocos.filter((b) => b.linhas.length);
  return visiveis.reduce((s, b, i) => s + b.altura + (i < visiveis.length - 1 ? b.depois : 0), 0);
}

/** A menor escala que leva todos os blocos ao piso. */
function escalaMinima(blocos: BlocoDeTexto[]): number {
  return Math.min(1, ...blocos.map((b) => b.piso / b.corpo));
}

/** Mede numa escala fixa (para vários cartões saírem no mesmo corpo). */
export function medirNaEscala(blocos: BlocoDeTexto[], largura: number, altura: number, escala: number): Encaixe {
  const medidos = blocos.map((b) => medirBloco(b, escala, largura));
  const estoura = medidos.some((m, i) => blocos[i].maxLinhas !== undefined && m.linhas.length > blocos[i].maxLinhas!);
  const total = somar(medidos);
  return { blocos: medidos, escala, altura: total, cabe: !estoura && total <= altura + 0.5, cortado: false };
}

/**
 * O maior corpo em que os blocos cabem na caixa, todos reduzindo juntos.
 * Sem caber no piso, corta com reticência os blocos cortáveis (do último para
 * o primeiro) e avisa no log com `contexto`.
 */
export function caberBlocos(blocos: BlocoDeTexto[], largura: number, altura: number, contexto = "texto"): Encaixe {
  const minima = escalaMinima(blocos);
  for (let escala = 1; escala >= minima - 1e-9; escala -= 0.025) {
    const r = medirNaEscala(blocos, largura, altura, Math.max(escala, minima));
    if (r.cabe) return r;
  }
  const noPiso = medirNaEscala(blocos, largura, altura, minima);
  if (noPiso.cabe) return noPiso;
  return cortarNoPiso(blocos, largura, altura, minima, contexto);
}

/** No piso e sem caber: corta os cortáveis, e o que não é cortável respeita só o máximo de linhas. */
export function cortarNoPiso(blocos: BlocoDeTexto[], largura: number, altura: number, escala: number, contexto: string): Encaixe {
  const medidos = blocos.map((b) => medirBloco(b, escala, largura));
  let cortado = false;
  // O máximo de linhas vale sempre, cortável ou não (o número nunca passa de duas linhas).
  medidos.forEach((m, i) => {
    const max = blocos[i].maxLinhas;
    if (max !== undefined && m.linhas.length > max) {
      const ultima = m.linhas.slice(0, max);
      ultima[max - 1] = comReticencia(ultima[max - 1] + " " + m.linhas[max], blocos[i].fonte, m.corpo, blocos[i].largura ?? largura);
      m.linhas = ultima;
      const b = blocos[i];
      m.altura = Math.max(m.linhas.length * m.corpo * b.entrelinha, b.alturaMinima ? b.alturaMinima * Math.max(escala, b.piso / b.corpo) : 0);
      m.cortado = true;
      cortado = true;
    }
  });
  for (let i = medidos.length - 1; i >= 0 && somar(medidos) > altura + 0.5; i--) {
    const b = blocos[i];
    const m = medidos[i];
    if (!b.cortavel || !m.linhas.length) continue;
    const linhaH = m.corpo * b.entrelinha;
    const sobra = altura - (somar(medidos) - m.altura);
    const cabem = Math.max(0, Math.floor((sobra + 0.5) / linhaH));
    if (cabem >= m.linhas.length) continue;
    if (cabem === 0) {
      m.linhas = [];
      m.altura = 0;
    } else {
      const resto = m.linhas.slice(cabem - 1).join(" ");
      m.linhas = [...m.linhas.slice(0, cabem - 1), comReticencia(resto, b.fonte, m.corpo, b.largura ?? largura)];
      m.altura = m.linhas.length * linhaH;
    }
    m.cortado = true;
    cortado = true;
  }
  const total = somar(medidos);
  if (cortado) {
    const quais = medidos.filter((m) => m.cortado).map((m) => m.nome).join(", ");
    console.warn(`[caber-texto] ${contexto}: não coube nem no corpo mínimo; cortei com reticência: ${quais}.`);
  }
  if (total > altura + 0.5) {
    console.warn(`[caber-texto] ${contexto}: mesmo cortando, sobram ${Math.round(total - altura)}px (o que não é cortável ficou inteiro).`);
  }
  return { blocos: medidos, escala, altura: total, cabe: total <= altura + 0.5, cortado };
}

/** Onde uma faixa de valores se parte em duas linhas: "R$ 1.500 a R$ 30.000" vira "R$ 1.500 a" e "R$ 30.000". */
const CONECTORES_DE_FAIXA = [" a ", " até ", " – ", " - ", " e ", " ou "];

export function partirFaixa(valor: string): [string, string] | null {
  for (const c of CONECTORES_DE_FAIXA) {
    const i = valor.indexOf(c);
    if (i > 0 && i < valor.length - c.length) return [valor.slice(0, i + c.length).trimEnd(), valor.slice(i + c.length).trim()];
  }
  return null;
}

/**
 * Um NÚMERO (destaque, dado do cartão, valor do rodapé) cabe numa linha, no
 * maior corpo até o piso. Só no piso uma faixa ("R$ 1.500 a R$ 30.000") quebra
 * em duas linhas, partida no conector e alinhadas pela esquerda. Número nunca
 * ganha reticência: no pior caso, quebra por palavra.
 */
export function caberNumero(valor: string, fonte: FonteDeMedida, largura: number, corpo: number, piso: number): { linhas: string[]; corpo: number } {
  const texto = valor.trim();
  for (let c = corpo; c >= piso - 1e-9; c -= Math.max(1, corpo * 0.02)) {
    const cc = Math.max(c, piso);
    if (larguraDe(texto, fonte, cc) <= largura) return { linhas: [texto], corpo: cc };
  }
  const faixa = partirFaixa(texto);
  if (faixa) {
    for (let c = corpo; c >= piso - 1e-9; c -= Math.max(1, corpo * 0.02)) {
      const cc = Math.max(c, piso);
      if (faixa.every((l) => larguraDe(l, fonte, cc) <= largura)) return { linhas: [...faixa], corpo: cc };
    }
  }
  return { linhas: quebrarLinhas(texto, fonte, piso, largura), corpo: piso };
}

/** Confere se cada linha medida cabe na largura (os testes e o log usam). */
export function linhasCabem(linhas: string[], fonte: FonteDeMedida, corpo: number, largura: number): boolean {
  return linhas.every((l) => larguraDe(l, fonte, corpo) <= largura + 0.5);
}
