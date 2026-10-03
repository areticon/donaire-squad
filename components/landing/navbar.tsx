"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { BotaoDeCaptura } from "@/components/landing/botao-de-captura";
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
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        scrolled
          ? "bg-[var(--bg-primary)]/95 backdrop-blur-md border-b border-[var(--bg-elevated)]"
          : "bg-transparent"
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandMarkAnimated size={30} />
          <span className="flex flex-col justify-center">
            {/* O nome em Montserrat negrito, a letra do logotipo de antes (volta
                em 01/10 junto com a marca laranja). */}
            <span className="font-mont font-bold text-[var(--text-primary)] text-lg lowercase leading-none">demandou.</span>
            {/* O "postou." saiu do lockup no rebranding de 01/10: o slogan falava
                com quem quer postar, e o comprador agora é o dono da empresa. */}
          </span>
        </Link>

        {/* Os links só aparecem a partir de 1024 px (01/10): em 768 eles,
            o nome e os dois botões passavam da largura da tela, "Como funciona"
            quebrava em duas linhas e o botão de demonstração saía cortado. */}
        <div className="hidden lg:flex items-center gap-8">
          <a href="#features" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            Funcionalidades
          </a>
          {/* A calculadora (01/10) é o CTA que mais qualifica: quem simula já
              disse o volume que quer e entregou faturamento e cargo. */}
          <a href="#calculadora" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            Calculadora
          </a>
          <a href="#pricing" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            Preços
          </a>
          <a href="#how" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            Como funciona
          </a>
        </div>

        {/* No celular o rótulo encurta (01/10): "Agendar demonstração" inteiro
            empurrava a barra para fora da tela de 390. */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/sign-in">Entrar</Link>
          </Button>
          {/* "Contratar" (02/10) só a partir de 640 px: no celular a barra não
              comporta três botões; lá ele aparece na hero, logo abaixo. */}
          <Button variant="outline" size="sm" asChild className="hidden sm:inline-flex">
            <Link href="/planos">Contratar</Link>
          </Button>
          <BotaoDeCaptura origem="navbar" size="sm">
            <span className="sm:hidden">Reunião</span>
            <span className="hidden sm:inline">Agendar reunião</span>
          </BotaoDeCaptura>
        </div>
      </div>
    </nav>
  );
}
