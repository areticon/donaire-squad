import sharp from "sharp";
import type { TratamentoDaFoto } from "@/lib/modelos-de-arte/tratamento";

/**
 * O TRATAMENTO DA FOTO DA CENA, no pixel (05/10/2026). Ver a regra em
 * lib/modelos-de-arte/tratamento.ts.
 *
 * Sem IA e sem chamada paga: a foto que o modelo de imagem gerou (ou a foto
 * real do cliente) passa por aqui ANTES de o texto ser composto, e sai com
 * cada pixel numa cor da paleta.
 *
 *   - duotone: luminância da foto mapeada numa reta do escuro ao destaque da
 *     marca (sombra no escuro, luz no destaque), com uma curva em S leve para
 *     a cena não virar um borrão de meio-tom;
 *   - pb: cinza com um pouco mais de contraste.
 */

function rgbDe(hex: string): [number, number, number] {
  const c = hex.replace("#", "");
  const f = c.length === 3 ? c.split("").map((x) => x + x).join("") : c.slice(0, 6);
  return [parseInt(f.slice(0, 2), 16) || 0, parseInt(f.slice(2, 4), 16) || 0, parseInt(f.slice(4, 6), 16) || 0];
}

/** A curva em S: aperta as sombras e as luzes, mantém o meio. */
function curvaS(t: number): number {
  const k = 1.25;
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 0.5 * Math.pow(2 * x, k) : 1 - 0.5 * Math.pow(2 * (1 - x), k);
}

export async function aplicarTratamento(foto: Buffer, tratamento: TratamentoDaFoto, cores: { escuro: string; destaque: string }): Promise<Buffer> {
  // Tudo em cinza, com o histograma esticado: a cena chapada da IA ganha
  // sombra e luz de verdade antes de virar dois tons.
  const cinza = sharp(foto).rotate().toColourspace("b-w").normalise();
  if (tratamento === "pb") {
    return cinza.linear(1.1, -8).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  }
  const { data, info } = await cinza.raw().toBuffer({ resolveWithObject: true });
  const passo = info.channels;
  const a = rgbDe(cores.escuro);
  const b = rgbDe(cores.destaque);
  // A tabela de 256 entradas uma vez; depois é só olhar.
  const tabela = new Uint8Array(256 * 3);
  for (let v = 0; v < 256; v++) {
    const t = curvaS(v / 255);
    tabela[v * 3] = Math.round(a[0] + (b[0] - a[0]) * t);
    tabela[v * 3 + 1] = Math.round(a[1] + (b[1] - a[1]) * t);
    tabela[v * 3 + 2] = Math.round(a[2] + (b[2] - a[2]) * t);
  }
  const saida = Buffer.alloc(info.width * info.height * 3);
  for (let i = 0, o = 0; i < data.length; i += passo, o += 3) {
    const v = data[i] * 3;
    saida[o] = tabela[v];
    saida[o + 1] = tabela[v + 1];
    saida[o + 2] = tabela[v + 2];
  }
  return sharp(saida, { raw: { width: info.width, height: info.height, channels: 3 } }).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
}
