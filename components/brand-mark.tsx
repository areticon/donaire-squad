import { cn } from "@/lib/utils";

type Variant = "dark" | "light";

/**
 * Logo da marca. Desde o painel de identidade de 25/08 a marca é uma só para
 * qualquer fundo: monograma em degradê laranja com contorno branco estilo
 * adesivo, sem disco. O parâmetro `variant` ficou pela compatibilidade das
 * chamadas existentes, mas os dois casos servem o mesmo SVG.
 */
export function BrandMarkImg({
  variant: _variant = "dark",
  className,
  size = 32,
}: {
  variant?: Variant;
  className?: string;
  size?: number;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- asset estático pequeno
    <img
      src="/brand-mark.svg"
      alt="demandou"
      width={size}
      height={size}
      className={cn("object-contain shrink-0", className)}
    />
  );
}
