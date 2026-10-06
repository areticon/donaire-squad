import type { CorDoEfeito, EfeitoDoModelo } from "@/lib/modelos-de-arte/pecas-do-desenho";

/**
 * OS AJUSTES DE LAYOUT DE UMA PEÇA, pedidos em linguagem natural (05/10/2026).
 *
 * O caso do Bruno, no chat do card do Paulo (carrossel de segunda, modelo
 * "Preto e branco com uma palavra"): "o texto ficou muito atrás de mim,
 * precisa subir um pouquinho, além disso é legal colocar uma luz de fundo para
 * dar efeito de profundidade". Até aqui o pedido inteiro virava uma linha de
 * prompt em inglês para o modelo de imagem, que não desenha o título nem a luz
 * (os dois são compostos em código), então nada mudava.
 *
 * Agora o pedido vira PARÂMETROS da composição:
 *
 *   - `titulo`: o deslocamento vertical do título que passa atrás da pessoa,
 *     em fração da altura da peça (negativo sobe). "subir um pouquinho" é um
 *     passo; "bem mais para cima" são dois; "para baixo" desce;
 *   - `luz`: a luz atrás do recorte da pessoa ("aro" é o rim light, "brilho" é
 *     o glow largo na cor de destaque), por cima do efeito padrão do modelo
 *     (EFEITOS_DO_MODELO em lib/modelos-de-arte/pecas-do-desenho.tsx);
 *   - `sombra`: a sombra da pessoa, quando o cliente pede.
 *
 * Ficam gravados no metadata do post e do card da Diana (`ajustes`), e cada
 * regeração seguinte parte deles: um pedido muda só o que ele diz.
 *
 * Arquivo PURO: sem banco, sem fs, sem sharp. A prévia no navegador e o Satori
 * no servidor leem os mesmos ajustes.
 */

export interface AjustesDaPeca {
  /** Deslocamento vertical do título atrás da pessoa, em fração da altura (negativo sobe). */
  titulo?: number;
  /** A luz atrás do recorte; "nenhuma" apaga a do modelo. */
  luz?: "aro" | "brilho" | "nenhuma";
  corDaLuz?: CorDoEfeito;
  /** A sombra da pessoa; "nenhuma" apaga a do modelo. */
  sombra?: "dura" | "suave" | "nenhuma";
}

/** Um passo de "um pouquinho": 6% da altura da peça. */
export const PASSO_DO_TITULO = 0.06;
/** O título nunca sai do quadro: até 30% para cima ou para baixo. */
export const TETO_DO_TITULO = 0.3;

const LUZES = new Set(["aro", "brilho", "nenhuma"]);
const SOMBRAS = new Set(["dura", "suave", "nenhuma"]);
const CORES = new Set(["acento", "tinta", "branca", "preta"]);

/** Os ajustes gravados num metadata (post ou card), validados; null quando não há. */
export function ajustesValidos(v: unknown): AjustesDaPeca | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const m = v as Record<string, unknown>;
  const a: AjustesDaPeca = {};
  if (typeof m.titulo === "number" && Number.isFinite(m.titulo) && m.titulo !== 0) a.titulo = Math.max(-TETO_DO_TITULO, Math.min(TETO_DO_TITULO, m.titulo));
  if (typeof m.luz === "string" && LUZES.has(m.luz)) a.luz = m.luz as AjustesDaPeca["luz"];
  if (typeof m.corDaLuz === "string" && CORES.has(m.corDaLuz)) a.corDaLuz = m.corDaLuz as CorDoEfeito;
  if (typeof m.sombra === "string" && SOMBRAS.has(m.sombra)) a.sombra = m.sombra as AjustesDaPeca["sombra"];
  return Object.keys(a).length ? a : null;
}

/**
 * O que o pedido novo diz vale por cima do gravado; o título SOMA (o cliente
 * pede "mais um pouco" sobre o que já subiu). Null quando não sobra nada.
 */
export function fundirAjustes(gravado: AjustesDaPeca | null | undefined, novo: AjustesDaPeca | null | undefined): AjustesDaPeca | null {
  const titulo = (gravado?.titulo ?? 0) + (novo?.titulo ?? 0);
  const a: AjustesDaPeca = { ...(gravado ?? {}), ...(novo ?? {}) };
  if (titulo) a.titulo = Math.max(-TETO_DO_TITULO, Math.min(TETO_DO_TITULO, Math.round(titulo * 1000) / 1000));
  else delete a.titulo;
  return Object.keys(a).length ? a : null;
}

// ── A leitura do pedido, por palavra ─────────────────────────────────────────

const TEXTO = "(?:texto|t[ií]tulo|frase|palavra|manchete|letra|letreiro)";
const CIMA = "(?:para\\s+cima|pra\\s+cima|mais\\s+alto|subir|suba|sobe|acima|mais\\s+em\\s+cima)";
const BAIXO = "(?:para\\s+baixo|pra\\s+baixo|mais\\s+baixo|descer|des[çc]a|desce|abaixo|mais\\s+embaixo)";
const POUCO = /\b(um\s+pouc\w*|pouquinho|levemente|ligeiramente|um\s+tiquinho|um\s+tico)\b/i;
const MUITO = /\b(bem\s+mais|muito\s+mais|bastante|bem\s+para|bem\s+pra)\b/i;

/**
 * O deslocamento do título pedido no texto: a direção pela palavra ("subir",
 * "para baixo"), o tamanho pelo advérbio ("um pouquinho" é um passo, "bem
 * mais" são dois, sem nada é um passo e meio). 0 quando não falou do título.
 */
export function deslocamentoDoTituloNoPedido(texto: string): number {
  const t = texto.toLowerCase();
  const falaDoTexto = new RegExp(`\\b${TEXTO}\\b`, "i").test(t);
  const sobe = new RegExp(`\\b${CIMA}\\b`, "i").test(t);
  const desce = new RegExp(`\\b${BAIXO}\\b`, "i").test(t);
  if (!falaDoTexto || sobe === desce) return 0;
  const passos = POUCO.test(t) ? 1 : MUITO.test(t) ? 2 : 1.5;
  const valor = Math.round(PASSO_DO_TITULO * passos * 1000) / 1000;
  return sobe ? -valor : valor;
}

/** A luz pedida no texto: "luz de fundo", "profundidade", "rim light" dão o aro; "brilho", "glow" dão o brilho. */
export function luzNoPedido(texto: string): AjustesDaPeca["luz"] | undefined {
  const t = texto.toLowerCase();
  if (/\b(sem|tira|tire|remov\w*)\s+(a\s+)?(luz|brilho|glow)\b/i.test(t)) return "nenhuma";
  if (/\b(brilho|glow|luz\s+colorida)\b/i.test(t)) return "brilho";
  if (/\b(luz\s+de\s+fundo|luz\s+atr[aá]s|luz\s+no\s+fundo|contraluz|rim\s*light|profundidade|efeito\s+de\s+luz|ilumina\w*\s+atr[aá]s)\b/i.test(t)) return "aro";
  return undefined;
}

/** A sombra pedida no texto, quando o cliente falou nela. */
export function sombraNoPedido(texto: string): AjustesDaPeca["sombra"] | undefined {
  const t = texto.toLowerCase();
  if (!/\bsombra\b/i.test(t)) return undefined;
  if (/\b(sem|tira|tire|remov\w*)\s+(a\s+)?sombra\b/i.test(t)) return "nenhuma";
  if (/\bsombra\s+(dura|s[oó]lida|chapada|recortada)\b/i.test(t)) return "dura";
  return "suave";
}

/** Os ajustes que um pedido do chat traz. Null quando não falou de layout. */
export function lerAjustesDoPedido(texto: string): AjustesDaPeca | null {
  const a: AjustesDaPeca = {};
  const titulo = deslocamentoDoTituloNoPedido(texto);
  if (titulo) a.titulo = titulo;
  const luz = luzNoPedido(texto);
  if (luz) a.luz = luz;
  const sombra = sombraNoPedido(texto);
  if (sombra) a.sombra = sombra;
  return Object.keys(a).length ? a : null;
}

// ── A aplicação no desenho ───────────────────────────────────────────────────

/** O efeito do modelo com os ajustes da peça por cima. Sem ajustes, o efeito como está. */
export function efeitoComAjustes(efeito: EfeitoDoModelo, ajustes: AjustesDaPeca | null | undefined): EfeitoDoModelo {
  if (!ajustes) return efeito;
  const pessoa = { ...(efeito.pessoa ?? {}) };
  if (ajustes.luz === "nenhuma") {
    delete pessoa.luz;
    delete pessoa.corDaLuz;
  } else if (ajustes.luz) {
    pessoa.luz = ajustes.luz;
    // O aro é branco por padrão (separa a pessoa do fundo); o brilho vai na cor de destaque.
    pessoa.corDaLuz = ajustes.corDaLuz ?? (ajustes.luz === "brilho" ? "acento" : "branca");
  }
  if (ajustes.sombra === "nenhuma") {
    delete pessoa.sombra;
    delete pessoa.corDaSombra;
  } else if (ajustes.sombra) pessoa.sombra = ajustes.sombra;
  return { ...efeito, pessoa: Object.keys(pessoa).length ? pessoa : undefined };
}

/** Quantos pixels o título desloca numa peça desta altura (negativo sobe). */
export function deslocamentoDoTitulo(ajustes: AjustesDaPeca | null | undefined, altura: number): number {
  return ajustes?.titulo ? Math.round(altura * ajustes.titulo) : 0;
}

// ── Como se conta ao cliente ─────────────────────────────────────────────────

/** Os ajustes em português de gente, para a resposta do chat ("o título mais para cima e uma luz de fundo atrás de você"). */
export function descreverAjustes(ajustes: AjustesDaPeca | null | undefined): string[] {
  if (!ajustes) return [];
  const partes: string[] = [];
  if (ajustes.titulo) {
    const grau = Math.abs(ajustes.titulo) >= PASSO_DO_TITULO * 2 ? "bem mais" : "um pouco mais";
    partes.push(`o título ${grau} para ${ajustes.titulo < 0 ? "cima" : "baixo"}`);
  }
  if (ajustes.luz === "aro") partes.push("uma luz de fundo atrás de você, para dar profundidade");
  else if (ajustes.luz === "brilho") partes.push("um brilho na cor da marca atrás de você");
  else if (ajustes.luz === "nenhuma") partes.push("sem a luz de fundo");
  if (ajustes.sombra === "dura") partes.push("a sombra sólida atrás de você");
  else if (ajustes.sombra === "suave") partes.push("uma sombra suave atrás de você");
  else if (ajustes.sombra === "nenhuma") partes.push("sem sombra");
  return partes;
}
