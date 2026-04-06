import Link from "next/link";
import { BrandMarkImg } from "@/components/brand-mark";

export function Footer() {
  return (
    <footer className="border-t border-[#1a1a1a] py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-4 gap-8 mb-12">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <BrandMarkImg variant="dark" className="h-7 w-7 rounded-md" size={28} />
              <span className="font-bold text-[#f5f5f5] lowercase">demandou</span>
            </div>
            <p className="text-sm text-[#9ca3af] leading-relaxed">
              Seus agentes de IA trabalhando para construir sua autoridade nas redes sociais.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-[#f5f5f5] mb-4">Produto</h4>
            <ul className="space-y-2 text-sm text-[#9ca3af]">
              <li><a href="#features" className="hover:text-[#f5f5f5] transition-colors">Funcionalidades</a></li>
              <li><a href="#pricing" className="hover:text-[#f5f5f5] transition-colors">Preços</a></li>
              <li><a href="#how" className="hover:text-[#f5f5f5] transition-colors">Como funciona</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-[#f5f5f5] mb-4">Conta</h4>
            <ul className="space-y-2 text-sm text-[#9ca3af]">
              <li><Link href="/sign-in" className="hover:text-[#f5f5f5] transition-colors">Entrar</Link></li>
              <li><Link href="/sign-up" className="hover:text-[#f5f5f5] transition-colors">Criar conta</Link></li>
              <li><Link href="/dashboard" className="hover:text-[#f5f5f5] transition-colors">Dashboard</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-[#f5f5f5] mb-4">Legal</h4>
            <ul className="space-y-2 text-sm text-[#9ca3af]">
              <li><Link href="/privacy" className="hover:text-[#f5f5f5] transition-colors">Privacidade</Link></li>
              <li><Link href="/terms" className="hover:text-[#f5f5f5] transition-colors">Termos de uso</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-[#1a1a1a] pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-[#9ca3af]">
            © 2026 demandou. Feito com IA no Brasil.
          </p>
          <p className="text-xs text-[#9ca3af]">
            Powered by Claude · Gemini · Blotato
          </p>
        </div>
      </div>
    </footer>
  );
}
