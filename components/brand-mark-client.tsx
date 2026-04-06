"use client";

import { useTheme } from "@/components/ui/theme-provider";
import { BrandMarkImg } from "@/components/brand-mark";

/** Marca com ícone conforme tema claro/escuro (área autenticada). */
export function BrandMarkThemed({ className, size = 32 }: { className?: string; size?: number }) {
  const { theme } = useTheme();
  const variant = theme === "dark" ? "dark" : "light";
  return <BrandMarkImg variant={variant} className={className} size={size} />;
}
