"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Rebranding de 01/10: botão em pílula (rounded-full) e marinho cheio, o
// desenho da referência. A classe orange-500 desenha azul (ver globals.css).
// O anel de foco recorta sobre o fundo do tema, não mais sobre o cinza fixo.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)] disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-orange-500 text-white hover:bg-orange-600 active:scale-[0.98]",
        outline:
          "border border-[var(--border)] text-[var(--text-primary)] hover:border-orange-500 hover:text-orange-500 bg-transparent",
        ghost:
          "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] bg-transparent",
        secondary:
          "bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:bg-[var(--bg-input)] border border-[var(--border)]",
        destructive:
          "bg-red-900/20 text-red-400 border border-red-900/50 hover:bg-red-900/40",
        link: "text-orange-400 underline-offset-4 hover:underline bg-transparent p-0 h-auto",
        // O laranja de verdade, só no botão principal de conversão (assinar,
        // fazer upgrade). 600 porque branco sobre ele dá 4,9:1.
        conversao:
          "bg-marca-600 text-white hover:bg-marca-700 active:scale-[0.98] shadow-[0_8px_20px_-8px_rgba(196,71,15,.55)]",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        default: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
        xl: "h-14 px-8 text-lg",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    if (asChild) {
      return (
        <Slot
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          {...props}
        >
          {children}
        </Slot>
      );
    }

    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
