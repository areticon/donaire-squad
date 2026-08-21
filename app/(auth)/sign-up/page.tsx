import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { BrandMarkAnimated } from "@/components/brand-mark-animated";

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-[#1e1f22] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <BrandMarkAnimated size={30} className="text-orange-500" />
            <span className="font-bold text-[#dbdee1] text-xl lowercase">demandou</span>
          </div>
          <h1 className="text-2xl font-bold text-[#dbdee1]">Crie sua conta</h1>
          <p className="text-[#949ba4] mt-1">
            Seu squad de agentes está a um passo de começar
          </p>
        </div>
        <Suspense>
          <AuthForm mode="sign-up" />
        </Suspense>
      </div>
    </div>
  );
}
