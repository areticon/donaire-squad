import { cn } from "@/lib/utils";

type Variant = "dark" | "light";

/** Ícone da marca (favicons SVG em /public). Use variant conforme o fundo. */
export function BrandMarkImg({
  variant = "dark",
  className,
  size = 32,
}: {
  variant?: Variant;
  className?: string;
  size?: number;
}) {
  const src = variant === "dark" ? "/favicon-dark.svg" : "/favicon-light.svg";
  return (
    // eslint-disable-next-line @next/next/no-img-element -- SVG local pequeno
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={cn("object-contain shrink-0", className)}
    />
  );
}
