import { Suspense } from "react";
import { IdentificacaoCurta } from "@/components/identificacao-legal";
import { AuthForm } from "@/components/auth/auth-form";
import { BrandMarkAnimated } from "@/components/brand-mark-animated";
import { quemJaEntrou } from "@/lib/auth/quem-ja-entrou";
import { JaConectado } from "@/components/auth/ja-conectado";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Com plano na URL, quem já tem sessão vai direto ao checkout; sem plano,
  // vê em qual conta está e pode trocar. Ver lib/auth/quem-ja-entrou.
  const jaConectado = await quemJaEntrou(searchParams);
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
          {/* Rótulo mono e itálico de destaque, o desenho da referência (01/10). */}
          <p className="rotulo mb-2">Área do cliente</p>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
            Bem-vindo <span className="destaque-prata">de volta</span>.
          </h1>
          <p className="text-[var(--text-muted)] mt-2">A presença da sua empresa continua de onde parou.</p>
        </div>
        <Suspense>
          {jaConectado ? <JaConectado {...jaConectado} /> : <AuthForm mode="sign-in" />}
        </Suspense>
        <IdentificacaoCurta className="mt-8" />
      </div>
    </div>
  );
}
