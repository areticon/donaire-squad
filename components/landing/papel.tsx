import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * As peças da linguagem de colagem da vitrine.
 *
 * Direção dada pelo Bruno em 01/09 com uma referência visual: folha de papel
 * sobre mesa escura, imagem em preto e branco, um acento fluorescente de
 * marca-texto, recortes com borda rasgada e fios finos costurando a página.
 *
 * Elas moram aqui, e não soltas em cada seção, porque a linguagem precisa ser
 * a mesma em oito seções. Quando o Bruno pedir um ajuste (mais fio, menos
 * rasgo, marcador mais forte), o ajuste é neste arquivo e vale para a página
 * inteira.
 */

/** A folha: o retângulo de papel onde a vitrine acontece. */
export function Folha({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "textura-papel relative bg-[var(--bg-primary)] shadow-[0_18px_60px_var(--papel-sombra)]",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * O fio que atravessa a composição.
 *
 * `alcance` diz até onde ele vai além do conteúdo: na referência a linha
 * começa fora do recorte e termina no meio dele, e é isso que faz a página
 * parecer montada à mão em vez de diagramada em grade.
 */
export function Fio({
  className,
  alcance = "-left-[8%] w-[116%]",
}: {
  className?: string;
  alcance?: string;
}) {
  return <div aria-hidden className={cn("fio absolute", alcance, className)} />;
}

/**
 * O marca-texto sobre a palavra que importa.
 *
 * `cheio` é o traço grosso que cobre a linha toda (o bloco amarelo da
 * referência); o padrão é o traço baixo, que deixa a letra respirar por cima.
 */
export function Marcador({
  children,
  cheio = false,
  className,
}: {
  children: ReactNode;
  cheio?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("marcador", cheio && "marcador-cheio", className)}>{children}</span>
  );
}

/**
 * O recorte: um pedaço de papel colado por cima, com sombra curta e borda
 * viva. `rasgado` corta a base com a máscara irregular.
 */
export function Recorte({
  children,
  className,
  rasgado = false,
  inclinacao = 0,
}: {
  children: ReactNode;
  className?: string;
  rasgado?: boolean;
  inclinacao?: number;
}) {
  return (
    <div
      style={inclinacao ? { transform: `rotate(${inclinacao}deg)` } : undefined}
      className={cn(
        "textura-papel relative bg-[var(--bg-surface)] border border-[var(--border)]",
        "shadow-[0_6px_18px_rgba(23,23,26,0.10)]",
        rasgado && "rasgo-baixo border-b-0",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * O bloco chapado de marcador, solto atrás de um recorte.
 *
 * Na referência ele é um retângulo de marca-texto que vaza para fora da foto,
 * e é justamente o vazamento que dá o efeito de montagem.
 */
export function BlocoMarcador({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      // z-0 explicito: sem ele o bloco disputava a pilha com o recorte e
      // apareceu POR CIMA do conteudo no primeiro screenshot. O marcador
      // sempre fica atras do papel colado.
      className={cn("absolute z-0 bg-[var(--marcador)]", className)}
    />
  );
}

/** Rótulo editorial: caixa alta pequena, espaçada, com o fio embaixo. */
export function Rotulo({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-block text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-primary)]",
        "border-b border-[var(--fio)] pb-1",
        className
      )}
    >
      {children}
    </span>
  );
}
