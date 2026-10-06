import type { Retangulo } from "@/lib/media/plano-de-montagem";
import type { TrechoLido } from "@/lib/media/leitura-do-video";
import { caixaLivre, centroDe, cobreAlgo } from "@/lib/media/editor-por-comando/leitura-no-plano";

/**
 * A CAIXA DAS PEÇAS VETORIAIS (06/10/2026, tarefa D): onde cada peça desenhada
 * em código (worker/remotion/src/sob-medida/pecas/vetoriais.tsx) fica no
 * quadro, em fração. Regra: nunca sobre o rosto. As de conteúdo vão ABAIXO do
 * rosto (no 9:16, centradas, como nas referências do Bruno) ou do lado livre
 * (16:9); o título vai ACIMA da cabeça. Com a leitura do trecho, a caixa sai
 * da área livre medida; sem ela, da caixa do rosto. Devolve null quando não há
 * lugar que não cubra o rosto (a peça sai, com aviso, no resolvedor).
 *
 * Módulo puro.
 */

type Tamanho = { vertical: [number, number]; horizontal: [number, number]; minimo: [number, number] };

/** O tamanho máximo (largura, altura, em fração do quadro) de cada peça, em pé e deitado, e o mínimo aceitável. */
export const TAMANHO_DAS_VETORIAIS: Record<string, Tamanho> = {
  "icone-com-frase": { vertical: [0.6, 0.3], horizontal: [0.28, 0.5], minimo: [0.2, 0.16] },
  "comparacao-lado-a-lado": { vertical: [0.9, 0.3], horizontal: [0.42, 0.56], minimo: [0.4, 0.16] },
  "cartoes-em-linha": { vertical: [0.9, 0.19], horizontal: [0.46, 0.3], minimo: [0.4, 0.1] },
  "interface-de-edicao": { vertical: [0.9, 0.3], horizontal: [0.46, 0.62], minimo: [0.42, 0.18] },
  "titulo-em-caixa": { vertical: [0.82, 0.11], horizontal: [0.5, 0.14], minimo: [0.4, 0.06] },
};

export const ehVetorial = (nome: string) => Object.prototype.hasOwnProperty.call(TAMANHO_DAS_VETORIAIS, nome);

const r4 = (v: number) => +v.toFixed(4);
const limitar = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** A caixa da peça vetorial `nome` no trecho, abaixo (ou, o título, acima) do rosto de quem fala. */
export function caixaDaVetorial(nome: string, o: { vertical: boolean; rosto: Retangulo; tr?: TrechoLido | null; fator?: number; lado?: "esquerda" | "direita" }): Retangulo | null {
  const t = TAMANHO_DAS_VETORIAIS[nome];
  if (!t) return null;
  const fator = o.fator ?? 1;
  const [w0, h0] = o.vertical ? t.vertical : t.horizontal;
  const maxW = Math.min(0.94, w0 * fator);
  const maxH = Math.min(0.6, h0 * fator);
  const titulo = nome === "titulo-em-caixa";
  const rosto = o.rosto;
  const cobre = (c: Retangulo) => (o.tr ? cobreAlgo(c, o.tr) : sobrepoe(c, rosto));

  // 1. Pela leitura do trecho: a área livre mais perto do lugar certo (abaixo do rosto; o título, no alto).
  if (o.tr) {
    const perto = titulo ? { x: 0.5, y: 0 } : o.vertical ? { x: 0.5, y: Math.min(1, rosto.y + rosto.h + 0.12) } : centroDe(rosto);
    const livre = caixaLivre(o.tr, { minW: t.minimo[0], minH: t.minimo[1], maxW, maxH, ...(o.vertical ? {} : { lado: o.lado }), perto, ancora: titulo ? "topo" : o.vertical ? "topo" : undefined });
    if (livre) {
      // No 9:16 a peça fica centrada na largura quando o centro também está livre (como nas referências).
      if (o.vertical) {
        const centrada = { ...livre, x: r4((1 - livre.w) / 2) };
        if (!cobre(centrada)) return centrada;
      }
      return livre;
    }
  }

  // 2. Pela caixa do rosto (vídeo sem leitura): abaixo do queixo, senão acima da cabeça.
  const w = maxW;
  if (o.vertical) {
    const x = r4((1 - w) / 2);
    const abaixo = rosto.y + rosto.h + 0.02;
    const acima = rosto.y - 0.02;
    if (titulo) {
      const h = Math.min(maxH, Math.max(0, acima - 0.04));
      if (h >= t.minimo[1]) return { x, y: r4(Math.max(0.04, acima - h - 0.02)), w, h: r4(h) };
    } else {
      const h = Math.min(maxH, 0.97 - abaixo);
      if (h >= t.minimo[1]) return { x, y: r4(abaixo), w, h: r4(h) };
      const h2 = Math.min(maxH, acima - 0.04);
      if (h2 >= t.minimo[1]) return { x, y: r4(acima - h2), w, h: r4(h2) };
    }
    return null;
  }
  // 16:9: o lado livre do rosto (o título, no alto do lado livre).
  const lado = o.lado ?? (rosto.x + rosto.w / 2 > 0.5 ? "esquerda" : "direita");
  const x = lado === "esquerda" ? 0.04 : r4(0.96 - w);
  const caixa = { x, y: titulo ? 0.06 : r4(limitar(rosto.y + rosto.h * 0.3, 0.12, 0.96 - maxH)), w, h: maxH };
  return cobre(caixa) ? null : caixa;
}

function sobrepoe(a: Retangulo, b: Retangulo): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
