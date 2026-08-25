import { Suspense } from "react";
import { IdentificacaoCurta } from "@/components/identificacao-legal";
import { AuthForm } from "@/components/auth/auth-form";
import { BrandMarkAnimated } from "@/components/brand-mark-animated";

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-[#1e1e25] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-4">
            <BrandMarkAnimated size={32} />
            <span className="flex flex-col justify-center text-left">
              <span className="font-mont font-bold text-[#dbdee1] text-xl lowercase leading-none">demandou.</span>
              <span className="text-[11px] text-[#9599a6] lowercase tracking-wide leading-none mt-1">postou.</span>
            </span>
          </div>
          <h1 className="text-2xl font-bold text-[#dbdee1]">Crie sua conta</h1>
          <p className="text-[#949ba4] mt-1">
            Seu squad de agentes está a um passo de começar
          </p>
        </div>
        <Suspense>
          <AuthForm mode="sign-up" />
        </Suspense>
        <IdentificacaoCurta className="mt-8" />
      </div>
    </div>
  );
}
