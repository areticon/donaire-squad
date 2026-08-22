import type { Metadata } from "next";
import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { Demo } from "@/components/landing/demo";
import { Why } from "@/components/landing/why";
import { Features } from "@/components/landing/features";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Pricing } from "@/components/landing/pricing";
import { Footer } from "@/components/landing/footer";

export const metadata: Metadata = {
  title: "demandou. postou. Você grava um vídeo, seu squad de IA publica.",
  description:
    "Apenas 1% publica toda semana, e esse 1% leva os clientes. Um time de agentes de IA pesquisa, escreve, desenha e publica nas suas redes. E soa como você.",
};

export default function HomePage() {
  return (
    // data-theme="dark" trava a landing no escuro, seja qual for o tema salvo
    // na plataforma. As variáveis CSS herdam do ancestral mais próximo, então
    // este atributo vence o do <html> para tudo aqui dentro. Sem isso, quem
    // escolhia o claro no app via a landing misturar texto claro de variável
    // com fundo escuro fixo, ilegível. Tema é preferência de quem usa a
    // plataforma; a landing é a vitrine, e vitrine tem uma cara só.
    <main data-theme="dark" className="bg-[var(--bg-primary)] min-h-screen">
      <Navbar />
      <Hero />
      <Demo />
      <Why />
      <Features />
      <HowItWorks />
      <Pricing />
      <Footer />
    </main>
  );
}
