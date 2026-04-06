"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BrandMarkImg } from "@/components/brand-mark";

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
          ? "bg-[#0d0d0d]/95 backdrop-blur-md border-b border-[#1a1a1a]"
          : "bg-transparent"
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <BrandMarkImg variant="dark" className="h-8 w-8 rounded-md" />
          <span className="font-bold text-[#f5f5f5] text-lg">Demandou</span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-sm text-[#9ca3af] hover:text-[#f5f5f5] transition-colors">
            Funcionalidades
          </a>
          <a href="#pricing" className="text-sm text-[#9ca3af] hover:text-[#f5f5f5] transition-colors">
            Preços
          </a>
          <a href="#how" className="text-sm text-[#9ca3af] hover:text-[#f5f5f5] transition-colors">
            Como funciona
          </a>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/sign-in">Entrar</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/sign-up">Começar grátis</Link>
          </Button>
        </div>
      </div>
    </nav>
  );
}
