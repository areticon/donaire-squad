"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Check, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    id: "pro",
    name: "Pro",
    price: 149,
    credits: "1.800 créditos",
    cta: "Assinar Pro",
    href: "/sign-up?plan=pro",
    popular: true,
    features: [
      "7 dias grátis para testar",
      "1.800 créditos/mês",
      "Campanha semanal completa: LinkedIn, X e Instagram",
      "Imagens e carrosséis com IA",
      "Comentário de fontes automático",
      "Todos os agentes de IA",
      "Créditos extras por R$0,12/crédito",
      "Dashboard de métricas",
    ],
    notIncluded: ["Vídeo com IA", "Suporte prioritário"],
  },
  {
    id: "business",
    name: "Business",
    price: 249,
    credits: "3.500 créditos",
    cta: "Assinar Business",
    href: "/sign-up?plan=business",
    popular: false,
    features: [
      "3.500 créditos/mês",
      "Tudo do Pro + vídeo com IA",
      "Múltiplos projetos simultâneos",
      "Créditos extras por R$0,10/crédito",
      "Dashboard de métricas",
      "Suporte prioritário",
    ],
    notIncluded: [],
  },
  {
    id: "studio",
    name: "Studio",
    price: 449,
    credits: "7.000 créditos",
    cta: "Assinar Studio",
    href: "/sign-up?plan=studio",
    popular: false,
    features: [
      "7.000 créditos/mês",
      "Tudo do Business",
      "Projetos ilimitados",
      "Créditos extras por R$0,08/crédito",
      "Onboarding dedicado",
      "Suporte prioritário",
    ],
    notIncluded: [],
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="py-24 lg:py-32 relative">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 border-b border-[var(--fio)] pb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-primary)] mb-6">
            <Zap className="w-3.5 h-3.5" />
            Preços simples e transparentes
          </div>
          <h2 className="text-4xl lg:text-5xl font-black text-[var(--text-primary)] mb-4">
            Escolha o plano{" "}
            <span className="text-orange-500">certo para você</span>
          </h2>
          <p className="text-xl text-[var(--text-muted)] max-w-xl mx-auto">
            Cancele quando quiser. Sem fidelidade, sem surpresas.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
          {PLANS.map((plan, i) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className={cn(
                "relative rounded-none p-8 border",
                plan.popular
                  ? "bg-[var(--bg-card)] border-orange-500 shadow-[0_0_40px_rgba(249,115,22,0.15)]"
                  : "bg-[var(--bg-card)] border-[var(--border)]"
              )}
            >
              {plan.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="bg-orange-500 text-white text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap">
                    MAIS POPULAR
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-bold text-[var(--text-primary)] mb-1">
                  {plan.name}
                </h3>
                <p className="text-sm text-[var(--text-muted)]">{plan.credits}</p>
              </div>

              <div className="mb-8">
                <div className="flex items-baseline gap-1">
                  <span className="text-[var(--text-muted)] text-lg">R$</span>
                  <span className="text-5xl font-black text-[var(--text-primary)]">
                    {plan.price}
                  </span>
                  <span className="text-[var(--text-muted)] text-sm">/mês</span>
                </div>
                <Link
                  href={`/sign-up?plan=${plan.id}&ciclo=anual`}
                  className="inline-block mt-1.5 text-sm text-orange-400 hover:text-orange-300"
                >
                  ou R$ {Math.round((plan.price * 10) / 12)}/mês no anual
                </Link>
              </div>

              <Button
                className="w-full mb-8"
                variant={plan.popular ? "default" : "outline"}
                asChild
              >
                <Link href={plan.href}>{plan.cta}</Link>
              </Button>

              <ul className="space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm">
                    <Check className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                    <span className="text-[var(--text-primary)]">{feature}</span>
                  </li>
                ))}
                {plan.notIncluded.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2.5 text-sm opacity-40"
                  >
                    <div className="w-4 h-4 shrink-0 mt-0.5 flex items-center justify-center">
                      <div className="w-3 h-px bg-[var(--text-muted)]" />
                    </div>
                    <span className="text-[var(--text-muted)] line-through">
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        <p className="text-center text-sm text-[var(--text-muted)] mt-8 max-w-2xl mx-auto">
          * Imagens no X requerem plano API pago da plataforma X (Basic tier).
          Por ora, posts no X são publicados em texto.
        </p>
      </div>
    </section>
  );
}
