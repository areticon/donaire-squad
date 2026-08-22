"use client";

import { cn } from "@/lib/utils";

/**
 * A marca animada: o "d" e o "p" entram de lados opostos e se encaixam na
 * mesma bola, virando o monograma. É o nome do produto contado em um segundo,
 * "demandou, postou".
 *
 * Feita em SVG com animação CSS, e não em vídeo ou GIF: pesa poucos bytes,
 * escala sem perda e não custa JavaScript nenhum.
 *
 * Desde 22/08 a marca traz disco de fundo e contorno branco, do desenho novo
 * do Bruno, então as cores são fixas: logo com cor herdada mudaria de cara
 * conforme o contexto, que é justamente o que uma marca não pode fazer.
 *
 * As duas metades carregam cada uma a sua cópia da bola central; quando a
 * animação termina, elas coincidem pixel a pixel e o resultado é a marca.
 * Quem prefere menos movimento (prefers-reduced-motion) já vê a marca pronta.
 */
export function BrandMarkAnimated({
  className,
  size = 32,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      viewBox="-28 -8 120 120"
      width={size}
      height={size}
      fill="none"
      role="img"
      aria-label="demandou"
      className={cn("shrink-0 overflow-visible", className)}
    >
      <style>{`
        @keyframes marca-d-entra {
          from { transform: translateX(26px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes marca-p-entra {
          from { transform: translateX(-26px); opacity: 0; }
          to   { transform: translateX(0);     opacity: 1; }
        }
        .marca-d, .marca-p {
          /* O cubic-bezier dá a chegada firme de quem se encaixa, sem quicar. */
          animation: 720ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .marca-d { animation-name: marca-d-entra; }
        .marca-p { animation-name: marca-p-entra; animation-delay: 90ms; }
        @media (prefers-reduced-motion: reduce) {
          .marca-d, .marca-p { animation: none; }
        }
      `}</style>

      {/* Disco de fundo, do desenho novo do Bruno (22/08). */}
      <circle cx="32" cy="52" r="60" fill="#373643" />

      {/* metade "d": bola + haste que sobe à direita, com contorno branco */}
      <g className="marca-d">
        <circle cx="32" cy="52" r="26" stroke="#ffffff" strokeWidth="17" />
        <rect x="49.5" y="1.5" width="17" height="61" rx="8.5" fill="#ffffff" />
        <circle cx="32" cy="52" r="26" stroke="#f36a22" strokeWidth="12" />
        <rect x="52" y="4" width="12" height="56" rx="6" fill="#f36a22" />
      </g>

      {/* metade "p": mesma bola + haste que desce à esquerda */}
      <g className="marca-p">
        <circle cx="32" cy="52" r="26" stroke="#ffffff" strokeWidth="17" />
        <rect x="-2.5" y="41.5" width="17" height="61" rx="8.5" fill="#ffffff" />
        <circle cx="32" cy="52" r="26" stroke="#f36a22" strokeWidth="12" />
        <rect x="0" y="44" width="12" height="56" rx="6" fill="#f36a22" />
      </g>
    </svg>
  );
}
