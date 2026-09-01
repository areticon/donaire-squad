"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BrandMarkAnimated } from "@/components/brand-mark-animated";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <nav
      className={cn(
        "sticky top-0 z-50 transition-all duration-300",
        // Na vitrine de papel a barra some quando esta no topo e vira uma
        // faixa da propria folha ao rolar, com o fio fino embaixo em vez de
        // borda de caixa.
        scrolled
          ? "bg-[var(--bg-primary)]/94 backdrop-blur-sm border-b border-[var(--fio)]/40"
          : "bg-transparent"
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandMarkAnimated size={30} />
          <span className="flex flex-col justify-center">
            <span className="font-mont font-bold text-[var(--text-primary)] text-lg lowercase leading-none">demandou.</span>
            <span className="text-[11px] text-[var(--text-muted)] lowercase tracking-wide leading-none mt-1">postou.</span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            Funcionalidades
          </a>
          <a href="#pricing" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            Preços
          </a>
          <a href="#how" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            Como funciona
          </a>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/sign-in">Entrar</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/planos">Começar grátis</Link>
          </Button>
        </div>
      </div>
    </nav>
  );
}
