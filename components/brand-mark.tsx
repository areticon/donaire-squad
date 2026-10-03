"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

type Variant = "dark" | "light";

/**
 * Cor da marca conforme o fundo (01/10, volta ao logo antigo).
 * - "auto": laranja no tema claro, branco no escuro. A cor vem dos tokens
 *   --logo-de, --logo-ate e --logo-contorno de globals.css, então segue o
 *   ancestral com data-theme mais próximo (inclusive as seções travadas no
 *   escuro, como a landing).
 * - "laranja": sempre o laranja oficial, com o contorno branco de adesivo.
 * - "branco": sempre branco, para fundo laranja (ou escuro fixo).
 */
export type CorDaMarca = "auto" | "laranja" | "branco";

/** As cores de cada versão, para quando o lugar fixa a cor em vez do tema. */
const CORES: Record<Exclude<CorDaMarca, "auto">, { de: string; ate: string; contorno: string }> = {
  laranja: { de: "#F1742E", ate: "#BE4720", contorno: "#ffffff" },
  // Sem contorno no branco: contorno branco em volta de marca branca só
  // engordaria o traço.
  branco: { de: "#ffffff", ate: "#ffffff", contorno: "transparent" },
};

/** As cores que o SVG usa: os tokens do tema ou a versão fixa pedida. */
export function coresDaMarca(cor: CorDaMarca) {
  if (cor === "auto") {
    return { de: "var(--logo-de)", ate: "var(--logo-ate)", contorno: "var(--logo-contorno)" };
  }
  return CORES[cor];
}

/**
 * O LOGO DA DEMANDOU: o monograma "dp" de 25/08, em degradê laranja com
 * contorno branco de adesivo (arquivo oficial: public/brand-mark.svg, cópia em
 * "demandou marca/antigo").
 *
 * Em 01/10 o Bruno voltou a ele depois de testar o logo B (marinho com ponto
 * laranja). A geometria abaixo é a do arquivo oficial, copiada sem redesenho:
 * mesmo viewBox, mesmas formas, mesmas medidas. Nunca recriar a marca; se ela
 * mudar, muda o arquivo oficial e este componente copia de novo.
 *
 * É SVG embutido, e não <img>, por um motivo só: a cor muda com o fundo
 * (laranja no claro, branco no escuro ou sobre laranja), e a variável CSS do
 * tema só alcança SVG que está no próprio HTML. O `variant` ficou pela
 * compatibilidade das chamadas existentes.
 */
export function BrandMarkImg({
  variant: _variant = "dark",
  cor = "auto",
  className,
  size = 32,
}: {
  variant?: Variant;
  cor?: CorDaMarca;
  className?: string;
  size?: number;
}) {
  // Id único por instância: a marca aparece mais de uma vez na mesma página
  // (navbar e rodapé), e ids repetidos fazem um SVG usar o degradê do outro.
  const id = `marca${useId()}`;
  const c = coresDaMarca(cor);
  return (
    <svg
      viewBox="-28 -8 120 120"
      width={size}
      height={size}
      fill="none"
      role="img"
      aria-label="demandou"
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient id={id} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: c.de }} />
          <stop offset="1" style={{ stopColor: c.ate }} />
        </linearGradient>
      </defs>
      {/* Contorno branco: as mesmas formas, mais largas, por baixo do laranja */}
      <circle cx="32" cy="52" r="26" strokeWidth="17" style={{ stroke: c.contorno }} />
      <rect x="49.5" y="1.5" width="17" height="61" rx="8.5" style={{ fill: c.contorno }} />
      <rect x="-2.5" y="41.5" width="17" height="61" rx="8.5" style={{ fill: c.contorno }} />
      {/* A marca */}
      <circle cx="32" cy="52" r="26" stroke={`url(#${id})`} strokeWidth="12" />
      <rect x="52" y="4" width="12" height="56" rx="6" fill={`url(#${id})`} />
      <rect x="0" y="44" width="12" height="56" rx="6" fill={`url(#${id})`} />
    </svg>
  );
}
