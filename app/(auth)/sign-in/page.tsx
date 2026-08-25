import { Suspense } from "react";
import { IdentificacaoCurta } from "@/components/identificacao-legal";
import { AuthForm } from "@/components/auth/auth-form";
import { BrandMarkAnimated } from "@/components/brand-mark-animated";

export default function SignInPage() {
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
          <h1 className="text-2xl font-bold text-[#dbdee1]">Bem-vindo de volta</h1>
          <p className="text-[#949ba4] mt-1">Entre na sua conta para continuar</p>
        </div>
        <Suspense>
          <AuthForm mode="sign-in" />
        </Suspense>
        <IdentificacaoCurta className="mt-8" />
      </div>
    </div>
  );
}
