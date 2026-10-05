import type { FormatoDoModelo, ModeloDeArte } from "@/lib/modelos-de-arte/catalogo";
import type { CoresDoDesenho } from "@/lib/modelos-de-arte/desenho";
import { palavraDeDestaque } from "@/lib/modelos-de-arte/encaixe";
import { FIGURANTE_ANONIMO, OBJETO_ANONIMO } from "@/lib/modelos-de-arte/prompts-vox";

/**
 * O MODELO POR PROMPT (05/10/2026): preenche o `prompt` do catálogo com as
 * variáveis da peça. O que sai daqui vai ao modelo de imagem configurado para
 * o tipo "colagem" (lib/media/imagem-higgsfield.ts) e gera o FUNDO da peça, sem
 * texto; a tipografia entra depois em código (desenho-vox.tsx, modo "fundo
 * gerado"). Puro: sem banco, sem sharp, sem fs.
 */

/** O modelo é por prompt quando o catálogo traz o prompt dele. */
export function modeloPorPrompt(modelo: ModeloDeArte | null | undefined): modelo is ModeloDeArte & { prompt: string } {
  return Boolean(modelo?.prompt);
}

/** Um hex vira um nome de cor em inglês (cópia pura de lib/media/direcao-de-arte.ts, que importa o banco). */
export function nomeDaCorPuro(hex: string): string {
  const h = (hex || "#888888").replace("#", "");
  const c = h.length === 3 ? h.split("").map((x) => x + x).join("") : h.slice(0, 6);
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const sat = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  if (sat < 0.12) return l < 0.18 ? "near-black charcoal" : l < 0.45 ? "dark gray" : l < 0.8 ? "light gray" : "off-white";
  let hue = 0;
  if (max === r) hue = ((g - b) / (max - min)) % 6;
  else if (max === g) hue = (b - r) / (max - min) + 2;
  else hue = (r - g) / (max - min) + 4;
  hue = (hue * 60 + 360) % 360;
  const nomes: [number, string][] = [[15, "red"], [40, "orange"], [65, "yellow"], [150, "green"], [190, "teal"], [250, "blue"], [290, "purple"], [335, "magenta"], [360, "red"]];
  const base = nomes.find(([lim]) => hue < lim)?.[1] ?? "red";
  const tom = l < 0.3 ? "deep " : l > 0.75 ? "pale " : sat > 0.7 ? "vivid " : "";
  return `${tom}${base} (${"#" + c})`;
}

const ROTULO_EM_INGLES: Record<FormatoDoModelo, string> = {
  post: "vertical 4:5 social media post",
  carrossel: "vertical 4:5 carousel slide",
  story: "vertical 9:16 story",
  reels: "vertical 9:16 reels cover",
};

export interface VariaveisDoPrompt {
  cores: CoresDoDesenho;
  /** O título da peça (o modelo compõe em volta dele; o texto nunca é desenhado). */
  titulo: string;
  /** A palavra em destaque; sem ela, a regra de `palavraDeDestaque`. */
  palavra?: string;
  /** A descrição da foto do cliente, em inglês (da biblioteca de materiais). Sem ela, o figurante anônimo. */
  foto?: string | null;
  formato: FormatoDoModelo;
}

/** Os modelos cujo lugar da foto é um objeto, documento ou tela, e não uma pessoa. */
const FOTO_DE_OBJETO = new Set(["papel-com-foto-rasgada", "frase-com-carimbo-e-foto"]);

/** O prompt do modelo com as variáveis da peça preenchidas. */
export function preencherPromptDoModelo(modelo: ModeloDeArte & { prompt: string }, v: VariaveisDoPrompt): string {
  const papeis = v.cores.papeis;
  const destaque = papeis?.destaque || v.cores.acento;
  const fundo = papeis?.fundo || v.cores.escuro;
  const corDoTitulo = papeis?.titulo || v.cores.claro;
  const paleta = `${nomeDaCorPuro(destaque)} as the accent, ${nomeDaCorPuro(fundo)} and ${nomeDaCorPuro(corDoTitulo)} as the brand's other colours`;
  const fotoPadrao = FOTO_DE_OBJETO.has(modelo.id) ? OBJETO_ANONIMO : FIGURANTE_ANONIMO;
  const foto = v.foto?.trim() ? `the person or subject from the reference photo (${v.foto.trim().slice(0, 240)})` : fotoPadrao;
  const valores: Record<string, string> = {
    destaque: nomeDaCorPuro(destaque),
    fundo: nomeDaCorPuro(fundo),
    titulo: nomeDaCorPuro(corDoTitulo),
    paleta,
    manchete: v.titulo.replace(/["\n]/g, " ").trim().slice(0, 160),
    palavra: (v.palavra || palavraDeDestaque(v.titulo)).trim(),
    foto,
    formato: ROTULO_EM_INGLES[v.formato] ?? ROTULO_EM_INGLES.post,
  };
  return modelo.prompt.replace(/\{(\w+)\}/g, (tudo, chave: string) => valores[chave] ?? tudo);
}

/**
 * A instrução que acompanha a foto do cliente quando ela entra como imagem de
 * referência (edição): o gerador recebe a foto e o prompt, e precisa saber que
 * a foto é o recorte, não a peça.
 */
export const COM_FOTO_DE_REFERENCIA =
  "\nThe attached image is the reference photograph: use the person or subject in it as the halftone cutout described above, keeping their likeness, pose and clothing; convert it to black and white halftone, cut it out with the white paper border and place it where the composition says. Do not keep the original background of the photo.";
