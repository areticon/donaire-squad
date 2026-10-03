import { loadFont } from "@remotion/fonts";
import { continueRender, delayRender, staticFile } from "remotion";

/**
 * As fontes vêm de worker/fontes (as mesmas que o libass usa nas legendas do
 * corte), servidas como pasta pública do bundle. Mesmo arquivo no teste local
 * e no contêiner: o quadro conferido aqui vale para lá.
 */
export const FONTES = {
  titulo: "Anton",
  serifa: "PT Serif",
  texto: "Liberation Sans",
  desenhada: "Bangers",
  // As quatro de 29/09 (reprovação "legenda pobre"): serifa de revista,
  // condensada, máquina de escrever e a grotesca pesada da legenda. A
  // variedade é o que faz as letras de revista parecerem recortadas de
  // lugares diferentes, e não a mesma fonte em cinco cores.
  revista: "Playfair Display",
  condensada: "Oswald",
  maquina: "Special Elite",
  pesada: "Archivo Black",
  // A letra limpa do keynote (01/10): Geist, OFL, peso normal, a tipografia
  // "estilo Apple" do vídeo de referência do Bruno.
  limpa: "Geist",
  mono: "'Special Elite', 'DejaVu Sans Mono', Consolas, monospace",
};

let carregadas = false;
export function carregarFontes(): void {
  if (carregadas || typeof document === "undefined") return;
  carregadas = true;
  const espera = delayRender("fontes");
  Promise.all([
    loadFont({ family: FONTES.titulo, url: staticFile("Anton-Regular.ttf") }),
    loadFont({ family: FONTES.serifa, url: staticFile("PT_Serif-Bold.ttf"), weight: "700" }),
    loadFont({ family: FONTES.texto, url: staticFile("LiberationSans-Bold.ttf"), weight: "700" }),
    loadFont({ family: FONTES.texto, url: staticFile("LiberationSans-Regular.ttf"), weight: "400" }),
    loadFont({ family: FONTES.desenhada, url: staticFile("Bangers-Regular.ttf") }),
    // Variáveis: um arquivo cobre todos os pesos.
    loadFont({ family: FONTES.revista, url: staticFile("PlayfairDisplay-Variable.ttf"), weight: "400 900" }),
    loadFont({ family: FONTES.condensada, url: staticFile("Oswald-Variable.ttf"), weight: "200 700" }),
    loadFont({ family: FONTES.maquina, url: staticFile("SpecialElite-Regular.ttf") }),
    loadFont({ family: FONTES.pesada, url: staticFile("ArchivoBlack-Regular.ttf") }),
    loadFont({ family: FONTES.limpa, url: staticFile("Geist-Regular.ttf") }),
  ])
    .catch((e) => console.error("fonte não carregou", e))
    .finally(() => continueRender(espera));
}

/** Aleatório determinístico: o mesmo plano sai igual em toda renderização. */
export function aleatorio(semente: number): () => number {
  let s = semente >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Desenha um pedaço (`recorte`, em pixels da fonte) cobrindo uma caixa de
 * `w` x `h`, como object-fit: cover centrado no recorte. Devolve o estilo do
 * vídeo por dentro da caixa.
 */
export function cobrir(fonte: { largura: number; altura: number }, recorte: { x: number; y: number; w: number; h: number }, w: number, h: number) {
  const escala = Math.max(w / recorte.w, h / recorte.h);
  const cx = recorte.x + recorte.w / 2;
  const cy = recorte.y + recorte.h / 2;
  return {
    position: "absolute" as const,
    width: fonte.largura * escala,
    height: fonte.altura * escala,
    left: w / 2 - cx * escala,
    top: h / 2 - cy * escala,
    maxWidth: "none",
  };
}

/** Borda rasgada de papel como clip-path (polígono serrilhado). */
export function bordaRasgada(semente: number, dentes = 28, fundo = 1.4): string {
  const r = aleatorio(semente);
  const pts: string[] = [];
  const lado = (de: [number, number], ate: [number, number], normal: [number, number]) => {
    for (let i = 0; i < dentes; i++) {
      const t = i / dentes;
      const d = r() * fundo;
      pts.push(`${(de[0] + (ate[0] - de[0]) * t + normal[0] * d).toFixed(2)}% ${(de[1] + (ate[1] - de[1]) * t + normal[1] * d).toFixed(2)}%`);
    }
  };
  lado([0, 0], [100, 0], [0, 1]);
  lado([100, 0], [100, 100], [-1, 0]);
  lado([100, 100], [0, 100], [0, -1]);
  lado([0, 100], [0, 0], [1, 0]);
  return `polygon(${pts.join(",")})`;
}

/** Hex para rgba, para sombras e transparências na cor da marca. */
export function rgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const c = h.length === 3 ? h.split("").map((x) => x + x).join("") : h.slice(0, 6);
  return `rgba(${parseInt(c.slice(0, 2), 16)},${parseInt(c.slice(2, 4), 16)},${parseInt(c.slice(4, 6), 16)},${a})`;
}

/** Texto claro ou escuro sobre uma cor, pelo brilho dela. */
export function contraste(hex: string): string {
  const h = hex.replace("#", "");
  const c = h.length === 3 ? h.split("").map((x) => x + x).join("") : h.slice(0, 6);
  const l = (0.299 * parseInt(c.slice(0, 2), 16) + 0.587 * parseInt(c.slice(2, 4), 16) + 0.114 * parseInt(c.slice(4, 6), 16)) / 255;
  return l > 0.6 ? "#16171a" : "#ffffff";
}

/**
 * O RESPIRO de um elemento parado (29/09): colagem imóvel parece print. Um
 * balanço lento de seno, com fase própria por semente, em graus e pixels.
 * É só aritmética por quadro, sem filtro nem sombra nova.
 */
export function respiro(quadro: number, fps: number, semente: number, amplitude = 0.8): { giro: number; dy: number } {
  const fase = (semente % 997) / 997 * Math.PI * 2;
  const t = quadro / fps;
  return { giro: Math.sin(t * 1.7 + fase) * amplitude, dy: Math.cos(t * 1.3 + fase) * amplitude * 2.5 };
}

/**
 * Sombra dura de papel colado (deslocada, sem desfoque). Desfoque grande em
 * elemento que se move é o que mais custa por quadro no Chrome; a sombra
 * dura é a da referência e sai quase de graça.
 */
export const SOMBRA_DURA = "4px 7px 0 rgba(0,0,0,0.32)";
