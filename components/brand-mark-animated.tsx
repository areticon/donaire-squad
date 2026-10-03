"use client";

import { cn } from "@/lib/utils";
import { useId } from "react";
import { coresDaMarca, type CorDaMarca } from "@/components/brand-mark";

/**
 * A marca animada: o "d" e o "p" entram de lados opostos e se encaixam na
 * mesma bola, virando o monograma. É o nome do produto contado em um segundo.
 *
 * Feita em SVG com animação CSS, e não em vídeo ou GIF: pesa poucos bytes,
 * escala sem perda e não custa JavaScript nenhum.
 *
 * Desde 01/10 é de novo o logo de 25/08 (o Bruno voltou a ele depois do logo
 * B): degradê laranja (#F1742E a #BE4720) com contorno branco de adesivo, e
 * branco inteiro quando o fundo é escuro ou laranja. A geometria é a do
 * arquivo oficial public/brand-mark.svg, sem redesenho; a cor vem de
 * coresDaMarca (tokens do tema ou versão fixa).
 *
 * As duas metades carregam cada uma a sua cópia da bola central; quando a
 * animação termina, elas coincidem pixel a pixel e o resultado é a marca.
 * Quem prefere menos movimento (prefers-reduced-motion) já vê a marca pronta.
 */
export function BrandMarkAnimated({
  className,
  size = 32,
  cor = "auto",
}: {
  className?: string;
  size?: number;
  cor?: CorDaMarca;
}) {
  // O id do gradiente precisa ser único por instância: a marca aparece mais
  // de uma vez na mesma página (navbar e rodapé) e ids repetidos fazem um
  // SVG apontar para o gradiente do outro.
  const gradId = `marca${useId()}`;
  const c = coresDaMarca(cor);

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

      <defs>
        <linearGradient id={gradId} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: c.de }} />
          <stop offset="1" style={{ stopColor: c.ate }} />
        </linearGradient>
      </defs>

      {/* Os dois contornos primeiro e as duas cores depois, como no arquivo
          oficial. Com cada metade inteira num grupo, o contorno branco do "p"
          era pintado por cima da haste laranja do "d" e deixava uma lasca
          branca nela quando as metades se encaixavam. A classe da metade vai
          em cada peça, então as peças da mesma metade andam juntas. */}
      <circle className="marca-d" cx="32" cy="52" r="26" strokeWidth="17" style={{ stroke: c.contorno }} />
      <rect className="marca-d" x="49.5" y="1.5" width="17" height="61" rx="8.5" style={{ fill: c.contorno }} />
      <circle className="marca-p" cx="32" cy="52" r="26" strokeWidth="17" style={{ stroke: c.contorno }} />
      <rect className="marca-p" x="-2.5" y="41.5" width="17" height="61" rx="8.5" style={{ fill: c.contorno }} />

      {/* metade "d": bola + haste que sobe à direita */}
      <circle className="marca-d" cx="32" cy="52" r="26" stroke={`url(#${gradId})`} strokeWidth="12" />
      <rect className="marca-d" x="52" y="4" width="12" height="56" rx="6" fill={`url(#${gradId})`} />

      {/* metade "p": mesma bola + haste que desce à esquerda */}
      <circle className="marca-p" cx="32" cy="52" r="26" stroke={`url(#${gradId})`} strokeWidth="12" />
      <rect className="marca-p" x="0" y="44" width="12" height="56" rx="6" fill={`url(#${gradId})`} />
    </svg>
  );
}
