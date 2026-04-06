import { SignIn } from "@clerk/nextjs";
import { BrandMarkImg } from "@/components/brand-mark";

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <BrandMarkImg variant="dark" className="h-8 w-8 rounded-md" />
            <span className="font-bold text-[#f5f5f5] text-xl lowercase">demandou</span>
          </div>
          <h1 className="text-2xl font-bold text-[#f5f5f5]">Bem-vindo de volta</h1>
          <p className="text-[#9ca3af] mt-1">Entre na sua conta para continuar</p>
        </div>
        <SignIn
          forceRedirectUrl="/dashboard"
          appearance={{
            elements: {
              rootBox: "w-full",
              card: "bg-[#111] border border-[#2a2a2a] rounded-xl shadow-none",
              headerTitle: "text-[#f5f5f5]",
              headerSubtitle: "text-[#9ca3af]",
              socialButtonsBlockButton: "bg-[#1a1a1a] border-[#2a2a2a] text-[#f5f5f5] hover:bg-[#242424]",
              formFieldInput: "bg-[#1a1a1a] border-[#2a2a2a] text-[#f5f5f5]",
              formButtonPrimary: "bg-orange-500 hover:bg-orange-600",
              footerActionLink: "text-orange-400 hover:text-orange-300",
            },
          }}
        />
      </div>
    </div>
  );
}
