import Link from "next/link";
import { BrandMarkAnimated } from "@/components/brand-mark-animated";
import { IdentificacaoCurta } from "@/components/identificacao-legal";

/**
 * A casca das páginas pequenas da reunião (01/10, régua de alertas): entrar
 * na sala, marcar que começou. Mesmo cabeçalho e cartão de
 * /demonstracao/reuniao/[token], no tema escuro da landing.
 */
export function CascaDaReuniao({ children }: { children: React.ReactNode }) {
  return (
    <main data-theme="dark" className="min-h-screen bg-[var(--bg-primary)]">
      <header className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center">
        <Link href="/" className="flex items-center gap-2">
          <BrandMarkAnimated size={30} />
          <span className="font-mont font-bold text-[var(--text-primary)] text-lg lowercase leading-none">demandou.</span>
        </Link>
      </header>
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-8">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 sm:p-7">{children}</div>
      </div>
      <IdentificacaoCurta className="pb-10" />
    </main>
  );
}
