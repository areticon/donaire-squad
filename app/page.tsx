import type { Metadata } from "next";
import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { Why } from "@/components/landing/why";
import { Features } from "@/components/landing/features";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Pricing } from "@/components/landing/pricing";
import { Footer } from "@/components/landing/footer";

export const metadata: Metadata = {
  title: "demandou: quem não publica não existe para o mercado",
  description:
    "Apenas 1% publica toda semana, e esse 1% leva os clientes. Um time de agentes de IA pesquisa, escreve, desenha e publica nas suas redes. E soa como você.",
};

export default function HomePage() {
  return (
    <main className="bg-[#1e1f22] min-h-screen">
      <Navbar />
      <Hero />
      <Why />
      <Features />
      <HowItWorks />
      <Pricing />
      <Footer />
    </main>
  );
}
