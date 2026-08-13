import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { BrandMarkImg } from "@/components/brand-mark";

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <BrandMarkImg variant="dark" className="h-8 w-8 rounded-md" />
            <span className="font-bold text-[#f5f5f5] text-xl lowercase">demandou</span>
          </div>
          <h1 className="text-2xl font-bold text-[#f5f5f5]">Bem-vindo de volta</h1>
          <p className="text-[#9ca3af] mt-1">Entre na sua conta para continuar</p>
        </div>
        <Suspense>
          <AuthForm mode="sign-in" />
        </Suspense>
      </div>
    </div>
  );
}
