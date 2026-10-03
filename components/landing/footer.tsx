import Link from "next/link";
import { BrandMarkImg } from "@/components/brand-mark";
import { IdentificacaoLegal } from "@/components/identificacao-legal";

export function Footer() {
  return (
    <footer className="border-t border-[var(--border)] py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <BrandMarkImg variant="dark" className="h-7 w-7" size={28} />
              <span className="flex flex-col justify-center">
                {/* Montserrat negrito, a letra do logotipo de antes (01/10). */}
                <span className="font-mont font-bold text-[var(--text-primary)] lowercase leading-none">demandou.</span>
                {/* O "postou." saiu do lockup no rebranding de 01/10: o slogan falava
                    com quem quer postar, e o comprador agora é o dono da empresa. */}
              </span>
            </div>
            <p className="text-sm text-[var(--text-muted)] leading-relaxed mb-4">
              O marketing da sua empresa trabalhando todo dia, com a constância de uma agência e sem tomar a agenda do dono.
            </p>
            <IdentificacaoLegal />
          </div>

          <div>
            <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Produto</h4>
            <ul className="space-y-2 text-sm text-[var(--text-muted)]">
              <li><a href="#features" className="hover:text-[var(--text-primary)] transition-colors">Funcionalidades</a></li>
              <li><a href="#pricing" className="hover:text-[var(--text-primary)] transition-colors">Preços</a></li>
              <li><a href="#how" className="hover:text-[var(--text-primary)] transition-colors">Como funciona</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Conta</h4>
            <ul className="space-y-2 text-sm text-[var(--text-muted)]">
              <li><Link href="/sign-in" className="hover:text-[var(--text-primary)] transition-colors">Entrar</Link></li>
              <li><Link href="/demonstracao" className="hover:text-[var(--text-primary)] transition-colors">Agendar reunião</Link></li>
              <li><Link href="/dashboard" className="hover:text-[var(--text-primary)] transition-colors">Dashboard</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Legal</h4>
            <ul className="space-y-2 text-sm text-[var(--text-muted)]">
              <li><Link href="/privacy" className="hover:text-[var(--text-primary)] transition-colors">Privacidade</Link></li>
              <li><Link href="/terms" className="hover:text-[var(--text-primary)] transition-colors">Termos de uso</Link></li>
              <li><a href="mailto:contato@demandou.com" className="hover:text-[var(--text-primary)] transition-colors">Falar com a gente</a></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-[var(--border)] pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-[var(--text-muted)]">
            © 2026 demandou. Feito com IA no Brasil.
          </p>
        </div>
      </div>
    </footer>
  );
}
