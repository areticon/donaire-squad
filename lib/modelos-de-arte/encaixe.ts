import { METRICAS_DOS_MODELOS } from "@/lib/modelos-de-arte/metricas";
import type { FonteId } from "@/lib/modelos-de-arte/fontes";

/**
 * O ENCAIXE DO TEXTO, a mesma conta na prévia e na arte (03/10/2026).
 *
 * Mede cada palavra pela tabela de avanços da fonte e quebra a frase no MAIOR
 * corpo que cabe na caixa, equilibrando as linhas para nenhuma palavra ficar
 * sozinha na última. Puro: roda no navegador e no servidor e dá as mesmas
 * linhas nos dois, que é o que faz a arte gerada parecer a prévia.
 */

export function larguraDoTexto(texto: string, fonte: FonteId, espacamento = 0): number {
  const m = METRICAS_DOS_MODELOS[fonte];
  if (!m) return texto.length * 0.55;
  let soma = 0;
  for (const c of texto) soma += (m.porCaractere[c] ?? m.media) + espacamento;
  return soma;
}

export interface Encaixe {
  linhas: string[];
  corpo: number;
}

export function encaixar(o: {
  texto: string;
  fonte: FonteId;
  largura: number;
  altura: number;
  entrelinha: number;
  corpoMaximo: number;
  corpoMinimo?: number;
  /** Folga horizontal por linha, em corpos (caixa atrás da linha, marca-texto). */
  folga?: number;
  /** Espaço entre letras, em fração do corpo. */
  espacamento?: number;
  /** Máximo de linhas (quando a peça só comporta poucas). */
  maxLinhas?: number;
}): Encaixe {
  const palavras = o.texto.split(/\s+/).filter(Boolean);
  if (!palavras.length) return { linhas: [], corpo: o.corpoMaximo };
  const folga = o.folga ?? 0;
  const esp = o.espacamento ?? 0;
  const espaco = larguraDoTexto(" ", o.fonte, esp);
  const larguraDe = (ws: string[]) => ws.reduce((s, w) => s + larguraDoTexto(w, o.fonte, esp), 0) + espaco * (ws.length - 1) + folga;
  const quebrar = (limite: number): string[][] => {
    const saida: string[][] = [];
    let atual: string[] = [];
    for (const w of palavras) {
      if (atual.length && larguraDe([...atual, w]) > limite) {
        saida.push(atual);
        atual = [w];
      } else atual.push(w);
    }
    if (atual.length) saida.push(atual);
    return saida;
  };
  const minimo = o.corpoMinimo ?? 14;
  for (let corpo = Math.round(o.corpoMaximo); corpo >= minimo; corpo -= 2) {
    const limite = o.largura / corpo;
    const ls = quebrar(limite);
    if (ls.some((l) => larguraDe(l) > limite)) continue;
    if (o.maxLinhas && ls.length > o.maxLinhas) continue;
    if (ls.length * corpo * o.entrelinha > o.altura) continue;
    let melhor = ls;
    for (let l = limite * 0.98; l > limite * 0.5; l *= 0.98) {
      const t = quebrar(l);
      if (t.length !== ls.length || t.some((x) => larguraDe(x) > l)) break;
      melhor = t;
    }
    return { linhas: melhor.map((l) => l.join(" ")), corpo };
  }
  return { linhas: quebrar(o.largura / minimo).map((l) => l.join(" ")), corpo: minimo };
}

/** A palavra que leva o destaque: a que tem número primeiro, senão a mais longa (sem pontuação). */
export function palavraDeDestaque(frase: string): string {
  const ws = frase.split(/\s+/).filter(Boolean);
  const comNumero = ws.find((w) => /\d/.test(w));
  if (comNumero) return comNumero;
  const limpa = (w: string) => w.replace(/[^\p{L}\p{N}]/gu, "");
  return ws.reduce((a, b) => (limpa(b).length > limpa(a).length ? b : a), ws[0] ?? "");
}
