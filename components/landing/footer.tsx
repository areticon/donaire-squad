import Link from "next/link";
import { BrandMarkImg } from "@/components/brand-mark";

export function Footer() {
  return (
    <footer className="border-t border-[#313338] py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-4 gap-8 mb-12">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <BrandMarkImg variant="dark" className="h-7 w-7 rounded-md" size={28} />
              <span className="font-bold text-[#dbdee1] lowercase">demandou</span>
            </div>
            <p className="text-sm text-[#949ba4] leading-relaxed">
              Seus agentes de IA trabalhando para construir sua autoridade nas redes sociais.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-[#dbdee1] mb-4">Produto</h4>
            <ul className="space-y-2 text-sm text-[#949ba4]">
              <li><a href="#features" className="hover:text-[#dbdee1] transition-colors">Funcionalidades</a></li>
              <li><a href="#pricing" className="hover:text-[#dbdee1] transition-colors">Preços</a></li>
              <li><a href="#how" className="hover:text-[#dbdee1] transition-colors">Como funciona</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-[#dbdee1] mb-4">Conta</h4>
            <ul className="space-y-2 text-sm text-[#949ba4]">
              <li><Link href="/sign-in" className="hover:text-[#dbdee1] transition-colors">Entrar</Link></li>
              <li><Link href="/sign-up" className="hover:text-[#dbdee1] transition-colors">Criar conta</Link></li>
              <li><Link href="/dashboard" className="hover:text-[#dbdee1] transition-colors">Dashboard</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-[#dbdee1] mb-4">Legal</h4>
            <ul className="space-y-2 text-sm text-[#949ba4]">
              <li><Link href="/privacy" className="hover:text-[#dbdee1] transition-colors">Privacidade</Link></li>
              <li><Link href="/terms" className="hover:text-[#dbdee1] transition-colors">Termos de uso</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-[#313338] pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-[#949ba4]">
            © 2026 demandou. Feito com IA no Brasil.
          </p>
          <p className="text-xs text-[#949ba4]">
            Powered by Claude · Gemini · Blotato
          </p>
        </div>
      </div>
    </footer>
  );
}
