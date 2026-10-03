import type { Retangulo } from "@/lib/media/plano-de-montagem";

/**
 * O QUADRO DO COMPLETO PARA GRAVAÇÃO FORA DO PADRÃO (01/10/2026, parte 240).
 *
 * A montagem de efeitos só conhece dois quadros: 16:9 e 9:16 (a geometria de
 * canto, foto, B-roll, cartela e legenda é desenhada para eles). Até aqui, o
 * que não fosse um dos dois parava em "sem-montagem": TODO vídeo do gêmeo
 * digital (o recorte do gêmeo é quadrado, 1080x1080) saía só com a edição de
 * fala, e o cliente lia "edição finalizada".
 *
 * A escolha: a base entra num quadro padrão, inteira (nada cortado), com o
 * próprio vídeo ampliado, desfocado e escurecido atrás. Quadrado e em pé
 * (1:1, 4:5, 3:4, 9:19,5) vão para o VERTICAL 1080x1920: o vídeo no meio e
 * duas faixas, em cima e embaixo, onde a legenda e os elementos respiram sem
 * cobrir o rosto. Deitado fora do padrão (4:3, 21:9) vai para o HORIZONTAL
 * 1920x1080, com faixas dos lados. Testado no gêmeo do Bruno: o vertical com
 * fundo desfocado lê como um Reels feito de propósito; a tarja preta lia como
 * erro, e cortar o quadrado para 9:16 cortaria os ombros e o gesto.
 *
 * Módulo puro: o app decide (montagem-do-completo.ts) e o worker executa
 * (`enquadrarBase` em worker/src/montagem-do-completo.mjs).
 */

export type EnquadramentoDoCompleto = {
  /** O quadro final, em pixels. */
  largura: number;
  altura: number;
  /** Onde a gravação original fica dentro do quadro, em pixels pares. */
  conteudo: { x: number; y: number; w: number; h: number };
  /** O tamanho da gravação original, para conferir depois. */
  original: { largura: number; altura: number };
  fundo: "desfocado";
};

/** Folga de proporção aceita como "já é 16:9 ou 9:16" (a mesma do worker). */
const FOLGA = 0.03;
const par = (v: number) => Math.max(2, Math.round(v / 2) * 2);
/** Deslocamento par, que pode ser zero (o quadrado ocupa a largura inteira do vertical). */
const parOuZero = (v: number) => Math.max(0, Math.round(v / 2) * 2);

/** A gravação já está num quadro padrão? */
export function quadroPadrao(dim: { largura: number; altura: number }): boolean {
  if (!dim.largura || !dim.altura) return true;
  const r = dim.largura / dim.altura;
  return Math.abs(r / (16 / 9) - 1) <= FOLGA || Math.abs(r / (9 / 16) - 1) <= FOLGA;
}

/**
 * O enquadramento da base, ou null quando ela já é 16:9 ou 9:16. Abaixo de
 * 1,2 de proporção (quadrado, 4:5, em pé fora do padrão) o quadro é vertical;
 * acima, horizontal.
 */
export function enquadramentoDaBase(dim: { largura: number; altura: number }): EnquadramentoDoCompleto | null {
  if (quadroPadrao(dim)) return null;
  const r = dim.largura / dim.altura;
  const vertical = r < 1.2;
  const W = vertical ? 1080 : 1920;
  const H = vertical ? 1920 : 1080;
  // Cabe inteiro: pela largura no vertical (o quadrado ocupa a largura toda),
  // pela altura no horizontal; se passar, pela outra medida.
  let w = vertical ? W : H * r;
  let h = vertical ? W / r : H;
  if (h > H) {
    h = H;
    w = H * r;
  }
  if (w > W) {
    w = W;
    h = W / r;
  }
  const cw = Math.min(W, par(w));
  const ch = Math.min(H, par(h));
  return {
    largura: W,
    altura: H,
    conteudo: { x: parOuZero((W - cw) / 2), y: parOuZero((H - ch) / 2), w: cw, h: ch },
    original: { largura: dim.largura, altura: dim.altura },
    fundo: "desfocado",
  };
}

/** Uma caixa em FRAÇÃO da gravação original, levada para fração do quadro enquadrado. */
export function noQuadroEnquadrado(ret: Retangulo, e: EnquadramentoDoCompleto): Retangulo {
  const c = e.conteudo;
  return {
    x: +((c.x + ret.x * c.w) / e.largura).toFixed(4),
    y: +((c.y + ret.y * c.h) / e.altura).toFixed(4),
    w: +((ret.w * c.w) / e.largura).toFixed(4),
    h: +((ret.h * c.h) / e.altura).toFixed(4),
  };
}
