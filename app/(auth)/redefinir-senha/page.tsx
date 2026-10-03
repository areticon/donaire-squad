import { Suspense } from "react";
import { IdentificacaoCurta } from "@/components/identificacao-legal";
import { EscolherSenha } from "@/components/auth/senha-form";
import { BrandMarkAnimated } from "@/components/brand-mark-animated";

export default function Pagina() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-4">
            <BrandMarkAnimated size={32} />
            <span className="flex flex-col justify-center text-left">
              <span className="font-mont font-bold text-[var(--text-primary)] text-xl lowercase leading-none">demandou.</span>
              {/* O "postou." saiu do lockup no rebranding de 01/10: o slogan falava
                  com quem quer postar, e o comprador agora é o dono da empresa. */}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Escolha sua senha</h1>
          <p className="text-[var(--text-muted)] mt-1">Ela vale para entrar com o seu e-mail</p>
        </div>
        <Suspense>
          <EscolherSenha />
        </Suspense>
        <IdentificacaoCurta className="mt-8" />
      </div>
    </div>
  );
}
