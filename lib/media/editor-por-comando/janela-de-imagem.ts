import type { PalavraNoCorte, Retangulo } from "@/lib/media/plano-de-montagem";
import type { TrechoLido } from "@/lib/media/leitura-do-video";
import { caixaLivre, centroDe, cobreAlgo } from "@/lib/media/editor-por-comando/leitura-no-plano";

/**
 * A JANELA DE IMAGEM (06/10, diagnóstico de cmux0hoxk, vertical 478x850): a
 * peça "imagem-janela" com lado "topo" virou miniatura no canto de cima (a
 * área livre aceitava 22% da largura) e a legenda dela, "o eles estão
 * fazendo" (trecho da fala com palavra faltando), repetiu o título grande que
 * estava na tela ao mesmo tempo. As regras, em medida:
 *   - TAMANHO MÍNIMO relativo ao quadro: no vertical, pelo menos 70% da
 *     largura; no horizontal, 34%. Sem área livre larga o bastante, a faixa
 *     inteira acima ou abaixo do rosto (a maior das duas) quando ela tem
 *     altura; senão a janela não entra (miniatura nunca);
 *   - LEGENDA SÓ QUANDO SOMA: sai quando a legenda da fala está ligada (ela já
 *     diz a mesma frase), quando outra peça com texto está na tela no
 *     mesmo tempo (o título já fala), quando não é um trecho contínuo da fala
 *     do momento, e quando começa no meio de uma frase.
 */

/** A menor largura da janela, em fração do quadro. */
export const LARGURA_MINIMA_DA_JANELA = { vertical: 0.7, horizontal: 0.34 } as const;
/** A menor altura da faixa acima ou abaixo do rosto que ainda recebe a janela (vertical). */
const ALTURA_MINIMA_DA_FAIXA = 0.17;

/**
 * A caixa da janela no trecho: a área livre medida com o tamanho mínimo do
 * quadro; no vertical, sem área livre larga, a faixa acima ou abaixo do rosto.
 * Null quando nada serve (quem chama tira a peça).
 */
export function caixaDaJanela(tr: TrechoLido | null | undefined, rosto: Retangulo, vertical: boolean, fator = 1, lado: "esquerda" | "direita" | null = null): Retangulo | null {
  const minW = vertical ? LARGURA_MINIMA_DA_JANELA.vertical : LARGURA_MINIMA_DA_JANELA.horizontal;
  const maxW = Math.min(0.94, Math.max(minW, (vertical ? 0.92 : 0.46) * fator));
  const maxH = Math.min(0.62, (vertical ? 0.46 : 0.6) * fator);
  const livre = caixaLivre(tr, { minW, minH: vertical ? ALTURA_MINIMA_DA_FAIXA : 0.3, maxW, maxH, lado: vertical ? null : lado, perto: centroDe(rosto) });
  if (livre && livre.w >= minW * 0.85 - 1e-6) return arredondar(livre);
  if (!vertical) return null;
  // A faixa acima ou abaixo do rosto, na largura útil do quadro (margem de 5% de cada lado). Embaixo, até 80% da
  // altura (a legenda da fala mora no último quinto).
  const topoDoRosto = rosto.y - 0.03;
  const baseDoRosto = rosto.y + rosto.h + 0.03;
  const faixas: Retangulo[] = [
    { x: 0.05, y: 0.05, w: 0.9, h: Math.min(maxH, topoDoRosto - 0.05) },
    { x: 0.05, y: baseDoRosto, w: 0.9, h: Math.min(maxH, 0.8 - baseDoRosto) },
  ].filter((f) => f.h >= ALTURA_MINIMA_DA_FAIXA && !(tr && cobreAlgo(f, tr)));
  if (!faixas.length) return null;
  const maior = faixas.sort((a, b) => b.h - a.h)[0];
  // A faixa de cima encosta no rosto (a janela fica perto de quem fala, não grudada na borda).
  if (maior.y === 0.05 && topoDoRosto - 0.05 > maior.h) maior.y = topoDoRosto - maior.h;
  return arredondar(maior);
}

const arredondar = (r: Retangulo): Retangulo => ({ x: +r.x.toFixed(4), y: +r.y.toFixed(4), w: +r.w.toFixed(4), h: +r.h.toFixed(4) });

/** As palavras normalizadas (sem acento, sem pontuação, minúsculas). */
const normal = (s: string): string[] =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\*\*/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** Os textos que uma peça põe na tela (título, texto, palavra, frase, itens). */
export function textosDaPeca(props: Record<string, unknown>): string[] {
  const saida: string[] = [];
  for (const k of ["titulo", "texto", "palavra", "frase", "apoio", "rotulo", "citacao"]) if (typeof props[k] === "string" && (props[k] as string).trim()) saida.push(props[k] as string);
  for (const k of ["itens", "pontos", "passos"]) {
    const l = props[k];
    if (Array.isArray(l)) for (const x of l) if (x && typeof x === "object" && typeof (x as { rotulo?: unknown }).rotulo === "string") saida.push((x as { rotulo: string }).rotulo);
  }
  return saida;
}

export type MotivoDaLegenda = "legenda-da-fala" | "titulo-na-tela" | "fora-da-fala" | "meio-da-frase" | null;

/**
 * A legenda da janela, conferida: devolve a legenda (ou "" quando sai) e o
 * motivo. `outras` são os textos das outras peças na tela no mesmo tempo;
 * `palavras` é a fala com tempos (a legenda tem que ser um trecho contínuo da
 * fala entre `de` e `ate`, com folga de 1,5 s, começando no começo de uma
 * frase: a primeira palavra do trecho ou depois de pontuação ou pausa).
 */
export function legendaDaJanela(legenda: unknown, palavras: PalavraNoCorte[], de: number, ate: number, outras: string[], comLegendaDaFala = false): { legenda: string; motivo: MotivoDaLegenda } {
  const texto = typeof legenda === "string" ? legenda.replace(/\*\*/g, "").replace(/\s+/g, " ").trim() : "";
  if (!texto) return { legenda: "", motivo: null };
  const alvo = normal(texto);
  if (!alvo.length) return { legenda: "", motivo: null };
  // O vídeo com a legenda da fala ligada: a legenda da janela (palavras do falante) aparecia em letra de título em
  // cima da mesma frase na legenda da fala (prova de 06/10: "O QUE ELES ESTÃO FAZENDO" sobre "o eles estão fazendo").
  if (comLegendaDaFala) return { legenda: "", motivo: "legenda-da-fala" };
  // Um título na tela no mesmo tempo: a legenda de trecho não soma (e repetia o título, prova de 06/10).
  if (outras.some((o) => normal(o).length > 0)) return { legenda: "", motivo: "titulo-na-tela" };
  // A fala inteira, uma palavra por posição (palavra com hífen ou junta vira várias); o começo procurado fica no tempo.
  const ditas: Array<{ w: string; i: number }> = [];
  let achouNoMeio = false;
  palavras.forEach((p, i) => normal(p.texto).forEach((w) => ditas.push({ w, i })));
  for (let j = 0; j + alvo.length <= ditas.length; j++) {
    const p0 = palavras[ditas[j].i];
    if (p0.fim < de - 1.5 || p0.inicio > ate + 1.5) continue;
    let igual = true;
    for (let k = 0; k < alvo.length && igual; k++) igual = ditas[j + k].w === alvo[k];
    if (!igual) continue;
    const anterior = j > 0 ? palavras[ditas[j - 1].i] : undefined;
    const comeco = !anterior || (anterior !== p0 && (/[.!?;:…]["”']?\s*$/.test(anterior.texto.trim()) || p0.inicio - anterior.fim >= 0.45));
    if (comeco) return { legenda: texto, motivo: null };
    achouNoMeio = true;
  }
  return { legenda: "", motivo: achouNoMeio ? "meio-da-frase" : "fora-da-fala" };
}
