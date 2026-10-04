import sharp from "sharp";
import { caixaDaPessoa } from "@/lib/materiais/servidor";

/**
 * O ENQUADRAMENTO COM A PESSOA (03/10/2026): a pessoa recortada e o fundo
 * desfocado, no tamanho da peça, alinhados.
 *
 * A pessoa fica centrada, com o topo da cabeça perto de 26% da altura, que é
 * onde o título gigante termina: só a última linha passa atrás da cabeça e o
 * título continua legível. Quando a foto não tem espaço acima da cabeça (o
 * caso comum, foto de celular apertada), o fundo é a própria foto desfocada
 * cobrindo a peça inteira, e a pessoa é posta mais baixo sobre ele. Nada da
 * pessoa é redesenhado: escala, posição e, no fundo, desfoque.
 *
 * O recorte guarda só a MAIOR mancha (a pessoa): o segmentador às vezes leva
 * junto um objeto da frente (a jarra da prateleira, na prova de 03/10), que
 * ficaria flutuando na arte.
 */

/** Zera tudo fora da maior região conectada do alfa (medido numa grade reduzida). */
async function soAMaiorMancha(png: Buffer): Promise<Buffer> {
  const meta = await sharp(png).metadata();
  const W = meta.width!;
  const H = meta.height!;
  const f = Math.max(1, Math.round(Math.max(W, H) / 400));
  const w = Math.ceil(W / f);
  const h = Math.ceil(H / f);
  const { data } = await sharp(png).ensureAlpha().extractChannel(3).resize(w, h, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const rotulo = new Int32Array(w * h);
  let melhor = 0;
  let melhorTam = 0;
  let atual = 0;
  const fila = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (data[i] < 96 || rotulo[i]) continue;
    atual++;
    let ini = 0;
    let fim = 0;
    fila[fim++] = i;
    rotulo[i] = atual;
    while (ini < fim) {
      const k = fila[ini++];
      const x = k % w;
      const y = (k - x) / w;
      const viz = [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1];
      for (const v of viz) if (v >= 0 && !rotulo[v] && data[v] >= 96) {
        rotulo[v] = atual;
        fila[fim++] = v;
      }
    }
    if (fim > melhorTam) {
      melhorTam = fim;
      melhor = atual;
    }
  }
  if (!melhor) return png;
  // Máscara da maior mancha, um pouco dilatada (para não comer cabelo), no tamanho cheio.
  const mascara = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) mascara[i] = rotulo[i] === melhor ? 255 : 0;
  const cheia = await sharp(mascara, { raw: { width: w, height: h, channels: 1 } }).dilate(2).blur(1.2).resize(W, H, { fit: "fill" }).extractChannel(0).raw().toBuffer();
  const rgba = await sharp(png).ensureAlpha().raw().toBuffer();
  for (let i = 0; i < W * H; i++) rgba[i * 4 + 3] = Math.min(rgba[i * 4 + 3], cheia[i]);
  // Borda macia: onde a foto tem tremido (mão em movimento), o alfa do
  // segmentador vem em pente; um desfoque leve só no alfa some com isso.
  const alfa = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).extractChannel(3).blur(3).linear(1.6, -80).raw().toBuffer();
  for (let i = 0; i < W * H; i++) rgba[i * 4 + 3] = alfa[i];
  return sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}

async function centroDaCabeca(png: Buffer, caixa: { x: number; y: number; w: number; h: number }): Promise<number> {
  const { data, info } = await sharp(png).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  const ate = Math.min(info.height, caixa.y + Math.round(caixa.h * 0.2));
  let soma = 0;
  let n = 0;
  for (let y = caixa.y; y < ate; y += 2) for (let x = caixa.x; x < caixa.x + caixa.w; x += 2) if (data[y * info.width + x] > 128) {
    soma += x;
    n++;
  }
  return n ? soma / n : caixa.x + caixa.w / 2;
}

export async function enquadrarComPessoa(o: { foto: Buffer; recorte: Buffer; largura: number; altura: number }): Promise<{ foto: Buffer; recorte: Buffer; fundo: Buffer } | null> {
  const W = o.largura;
  const H = o.altura;
  const meta = await sharp(o.foto).metadata();
  const Wb = meta.width ?? 0;
  const Hb = meta.height ?? 0;
  if (!Wb || !Hb) return null;
  // O recorte do fornecedor pode voltar em outro tamanho: alinha ao da foto.
  const recorte = await soAMaiorMancha(await sharp(o.recorte).resize(Wb, Hb, { fit: "fill" }).png().toBuffer());
  const caixa = await caixaDaPessoa(recorte);
  if (!caixa) return null;
  const cobrir = Math.max(W / Wb, H / Hb);
  const topoAlvo = H * (H / W > 1.6 ? 0.3 : 0.26);
  const fundoDaPessoa = caixa.y + caixa.h;
  // Escala: a pessoa ocupa do topo-alvo até a base da peça.
  const s = Math.min(Math.max((H - topoAlvo) / Math.max(1, fundoDaPessoa - caixa.y), cobrir * 0.6), cobrir * 2.2);
  const Ws = Math.round(Wb * s);
  const Hs = Math.round(Hb * s);
  // O centro é o da CABEÇA (o quinto de cima da pessoa), e não o da caixa:
  // braço aberto puxava a caixa para o lado e a pessoa saía descentrada.
  const cx = (await centroDaCabeca(recorte, caixa)) * s;
  const dx = Math.round(W / 2 - cx);
  let dy = Math.round(topoAlvo - caixa.y * s);
  // A base da pessoa cortada pela borda da foto precisa encostar na base da peça.
  const basePessoa = dy + fundoDaPessoa * s;
  if (fundoDaPessoa >= Hb - 4 && basePessoa < H) dy += Math.round(H - basePessoa);
  const escalada = await sharp(recorte).resize(Ws, Hs).png().toBuffer();
  const fotoEscalada = await sharp(o.foto).resize(Ws, Hs).jpeg({ quality: 92 }).toBuffer();
  const posicionar = async (camada: Buffer, fundo: { r: number; g: number; b: number; alpha: number }) => {
    // Recorta a parte da camada que cai dentro da peça e compõe no lugar.
    const esq = Math.max(0, -dx);
    const topo = Math.max(0, -dy);
    const larg = Math.min(Ws - esq, W - Math.max(0, dx));
    const alt = Math.min(Hs - topo, H - Math.max(0, dy));
    const tela = sharp({ create: { width: W, height: H, channels: 4, background: fundo } });
    if (larg <= 0 || alt <= 0) return tela.png().toBuffer();
    const pedaco = await sharp(camada).extract({ left: esq, top: topo, width: larg, height: alt }).toBuffer();
    return tela.composite([{ input: pedaco, left: Math.max(0, dx), top: Math.max(0, dy) }]).png().toBuffer();
  };
  const rec = await posicionar(escalada, { r: 0, g: 0, b: 0, alpha: 0 });
  const fotoNoLugar = await posicionar(fotoEscalada, { r: 0, g: 0, b: 0, alpha: 0 });
  // O fundo: a foto no MESMO lugar da pessoa (o desfoque dela fica atrás dela,
  // sem fantasma), sobre a foto inteira cobrindo a peça onde sobrar espaço,
  // tudo desfocado como lente aberta e um pouco mais escuro.
  // Onde a foto não chega (acima da cabeça), entra a faixa de cima da foto,
  // sem a pessoa, esticada: depois do desfoque vira a parede do lugar.
  const faixa = Math.max(Math.round(Hb * 0.12), Math.min(caixa.y, Math.round(Hb * 0.4)));
  const cobertura = await sharp(o.foto).extract({ left: 0, top: 0, width: Wb, height: Math.max(8, faixa) }).resize(W, H, { fit: "fill" }).blur(20).png().toBuffer();
  const montado = await sharp(cobertura).composite([{ input: fotoNoLugar }]).png().toBuffer();
  const fundo = await sharp(montado)
    .blur(Math.max(10, Math.round(W / 60)))
    .modulate({ brightness: 0.82, saturation: 0.9 })
    .jpeg({ quality: 88 })
    .toBuffer();
  const foto = await sharp(montado).jpeg({ quality: 92 }).toBuffer();
  return { foto, recorte: rec, fundo };
}
