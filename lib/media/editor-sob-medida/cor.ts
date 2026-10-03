/**
 * A COR VIVA (03/10/2026, terceira volta). O dono viu os cortes de
 * cmurtv2zg: o acento da marca (#6b94b3, azul acinzentado) apagava brilho,
 * destaque e linha, e tudo parecia cinza. Aqui sai a versão LUMINOSA do
 * acento: o mesmo matiz, com saturação e luz altas, que é o que vai para
 * brilho, destaque, traço e transição. A cor original fica guardada em
 * `acentoMarca` para o que é identidade (o botão do fecho, a marca).
 *
 * ESPELHO de `vivo()` em worker/remotion/src/sob-medida/base.tsx (o worker é
 * publicado sem lib/). Mudou aqui, muda lá. Aplicar duas vezes dá o mesmo.
 *
 * Módulo puro.
 */

function hsl(hex: string): { h: number; s: number; l: number } {
  let x = String(hex || "#000").replace("#", "");
  if (x.length === 3) x = x.split("").map((c) => c + c).join("");
  const n = parseInt(x.slice(0, 6).padEnd(6, "0"), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const l = (mx + mn) / 2;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  return { h, s, l };
}

function hex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("")}`;
}

/** O acento está apagado? (pouca saturação ou luz fora da faixa que brilha no escuro) */
export function acentoApagado(cor: string): boolean {
  const { s, l } = hsl(cor);
  return s >= 0.08 && (s < 0.7 || l < 0.5 || l > 0.7);
}

/**
 * A versão luminosa do acento: matiz igual, saturação de pelo menos 0,85 e
 * luz entre 0,58 e 0,64. Cinza continua cinza (não inventa cor). #6b94b3 vira
 * #39a1ef, o azul da marca que acende no vidro escuro.
 */
export function acentoVivo(cor: string): string {
  const { h, s, l } = hsl(cor);
  if (s < 0.08) return cor;
  return hex(h, Math.min(1, Math.max(s, 0.85)), Math.min(0.64, Math.max(l, 0.58)));
}
