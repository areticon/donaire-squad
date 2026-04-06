import { cn } from "@/lib/utils";

type Variant = "dark" | "light";

/** Logo da marca em PNG (`demandou marca/`). `dark` = fundo escuro da página; `light` = fundo claro. */
export function BrandMarkImg({
  variant = "dark",
  className,
  size = 32,
}: {
  variant?: Variant;
  className?: string;
  size?: number;
}) {
  const src = variant === "dark" ? "/brand-mark-on-dark.png" : "/brand-mark-on-light.png";
  return (
    // eslint-disable-next-line @next/next/no-img-element -- asset estático pequeno
    <img
      src={src}
      alt="demandou"
      width={size}
      height={size}
      className={cn("object-contain shrink-0", className)}
    />
  );
}
