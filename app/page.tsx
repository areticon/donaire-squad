import type { Metadata } from "next";
import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { Demo } from "@/components/landing/demo";
import { Why } from "@/components/landing/why";
import { Features } from "@/components/landing/features";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Entrega } from "@/components/landing/entrega";
import { Pricing } from "@/components/landing/pricing";
import { Footer } from "@/components/landing/footer";

export const metadata: Metadata = {
  title: "demandou. postou. Você grava um vídeo, seu squad de IA publica.",
  description:
    "Apenas 1% publica toda semana, e esse 1% leva os clientes. Um time de agentes de IA pesquisa, escreve, desenha e publica nas suas redes. E soa como você.",
};

export default function HomePage() {
  return (
    // data-theme="papel" trava a vitrine na linguagem editorial, seja qual
    // for o tema salvo na plataforma. As variáveis CSS herdam do ancestral
    // mais próximo, então este atributo vence o do <html> para tudo aqui
    // dentro. Tema é preferência de quem usa a plataforma; a landing é a
    // vitrine, e vitrine tem uma cara só.
    //
    // A folha fica DENTRO da mesa escura, que é a moldura da referência de
    // colagem que o Bruno passou em 01/09. No celular a margem encolhe, senão
    // a mesa come a largura útil.
    <div data-theme="papel" className="min-h-screen bg-[var(--mesa)] px-0 py-0 sm:px-6 sm:py-8">
    <main className="textura-papel mx-auto max-w-[1400px] bg-[var(--bg-primary)] shadow-[0_20px_70px_rgba(0,0,0,0.45)]">
      <Navbar />
      <Hero />
      <Demo />
      <Why />
      <Features />
      <HowItWorks />
      {/* A prova vem DEPOIS de explicar o fluxo e ANTES do preço: quem chegou
          até aqui já entendeu o que a plataforma faz, e o que decide a compra é
          ver o resultado. Preço antes da prova é pedir decisão sem argumento. */}
      <Entrega />
      <Pricing />
      <Footer />
    </main>
    </div>
  );
}
