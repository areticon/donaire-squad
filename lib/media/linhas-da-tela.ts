import sharp from "sharp";
import { janelaDoZoomNaTela, type Caixa } from "@/lib/media/faixas-de-tela";

/**
 * A EXTENSÃO REAL DAS LINHAS DE TEXTO num print de tela compartilhada
 * (01/10/2026), sem IA: perfil de contraste por coluna e por linha.
 *
 * Por que existe: a região que a visão devolve pega só parte das linhas (na
 * prova, uma caixa de 25% da largura sobre linhas de 95%), e o zoom nela
 * cortava o texto no meio da palavra. Aqui a caixa é medida nos pixels:
 *
 *   1. numa faixa vertical (no começo, a da região), cada coluna conta os
 *      pixels com degrau forte de brilho para o vizinho (letra tem borda;
 *      fundo liso de aplicativo e o ruído do JPEG não passam do limiar);
 *   2. partindo das colunas da região, a caixa cresce para os lados enquanto o
 *      texto continua (vão de até 3% da largura é espaço entre palavras; vão
 *      maior é outro painel). Toda linha que passa pela faixa entra INTEIRA;
 *   3. na vertical, dentro dessas colunas, a borda de cima e a de baixo caem
 *      num vão entre linhas, nunca no meio de uma;
 *   4. folga de 4% do quadro em cada lado;
 *   5. e de novo, com a faixa vertical da PRÓPRIA caixa: a borda de baixo
 *      pode ter trazido uma linha mais longa (prova de 01/10, "A prova é
 *      real..." passava da caixa). Repete até a caixa parar de crescer.
 *
 * Medir com a faixa que o zoom MOSTRA (maior que a caixa) levava a caixa à
 * largura toda em todos os 56 prints da prova, e nenhum zoom sobrava. As
 * linhas de fora da caixa que aparecem na borda do zoom ficam escurecidas
 * pelo worker (o destaque), e as linhas da caixa saem sempre inteiras.
 *
 * A webcam (caixa do narrador, já com folga) é ignorada na conta: o rosto tem
 * borda, mas não é texto.
 */

const DEGRAU = 28;
const LIMIAR = 2;

export async function medirLinhasDeTexto(jpeg: Buffer, regiao: Caixa, narrador?: Caixa | null): Promise<Caixa | null> {
  const { data, info } = await sharp(jpeg).greyscale().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  if (!W || !H) return null;
  const px = (x: number, y: number) => data[y * W + x];
  const naWebcam = (x: number, y: number) =>
    Boolean(narrador && x >= narrador.x * W && x <= (narrador.x + narrador.w) * W && y >= narrador.y * H && y <= (narrador.y + narrador.h) * H);
  const forte = (x: number, y: number) => x > 0 && !naWebcam(x, y) && !naWebcam(x - 1, y) && Math.abs(px(x, y) - px(x - 1, y)) > DEGRAU;
  const vaoX = Math.round(W * 0.03);

  let y0 = Math.max(0, Math.floor(regiao.y * H));
  let y1 = Math.min(H - 1, Math.ceil((regiao.y + regiao.h) * H));
  let s0 = Math.max(1, Math.floor(regiao.x * W));
  let s1 = Math.min(W - 1, Math.ceil((regiao.x + regiao.w) * W));
  let caixa: Caixa | null = null;
  for (let volta = 0; volta < 5; volta++) {
    // 1 e 2. Colunas na faixa vertical, crescendo a partir da semente.
    const coluna = new Array<number>(W).fill(0);
    for (let x = 1; x < W; x++) for (let y = y0; y <= y1; y++) if (forte(x, y)) coluna[x]++;
    const temTexto = (x: number) => coluna[x] >= LIMIAR;
    const dentro: number[] = [];
    for (let x = s0; x <= s1; x++) if (temTexto(x)) dentro.push(x);
    if (!dentro.length) return caixa;
    let esq = dentro[0];
    let dir = dentro[dentro.length - 1];
    for (let x = esq - 1, vao = 0; x >= 1 && vao <= vaoX; x--) {
      if (temTexto(x)) {
        esq = x;
        vao = 0;
      } else vao++;
    }
    for (let x = dir + 1, vao = 0; x < W && vao <= vaoX; x++) {
      if (temTexto(x)) {
        dir = x;
        vao = 0;
      } else vao++;
    }
    // 3. Bordas verticais num vão entre linhas.
    const linha = (y: number) => {
      let n = 0;
      for (let x = Math.max(1, esq); x <= dir; x++) if (forte(x, y)) n++;
      return n;
    };
    let topo = y0;
    while (topo > 0 && linha(topo) >= LIMIAR) topo--;
    let base = y1;
    while (base < H - 1 && linha(base) >= LIMIAR) base++;
    // 4. Folga de 4% do quadro.
    const f = 0.04;
    const x = Math.max(0, esq / W - f);
    const y = Math.max(0, topo / H - f);
    const nova: Caixa = { x: +x.toFixed(3), y: +y.toFixed(3), w: +(Math.min(1, dir / W + f) - x).toFixed(3), h: +(Math.min(1, base / H + f) - y).toFixed(3) };
    const igual = caixa && Math.abs(caixa.x - nova.x) < 0.005 && Math.abs(caixa.w - nova.w) < 0.005 && Math.abs(caixa.y - nova.y) < 0.005 && Math.abs(caixa.h - nova.h) < 0.005;
    caixa = nova;
    if (igual) break;
    // 5. A faixa vertical da própria caixa (sem a folga), semente nas colunas achadas.
    if (!janelaDoZoomNaTela(nova)) break;
    y0 = topo;
    y1 = base;
    s0 = Math.max(1, esq);
    s1 = Math.min(W - 1, dir);
  }
  return caixa;
}
