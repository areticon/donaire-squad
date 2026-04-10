"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Check, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 49,
    credits: "500 créditos",
    cta: "Assinar Starter",
    href: "/sign-up?plan=starter",
    popular: false,
    features: [
      "500 créditos/mês",
      "LinkedIn (texto, imagem, carrossel)",
      "X — somente texto*",
      "6 agentes de IA (pesquisa, redação, design, revisão)",
      "Agendamento automático",
      "Aprovação antes de publicar",
    ],
    notIncluded: [
      "Créditos extras",
      "Dashboard de métricas",
      "Suporte prioritário",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 99,
    credits: "1.100 créditos",
    cta: "Assinar Pro",
    href: "/sign-up?plan=pro",
    popular: true,
    features: [
      "1.100 créditos/mês",
      "LinkedIn (texto, imagem, carrossel, vídeo)",
      "X — somente texto*",
      "Todos os agentes de IA",
      "Agendamento automático",
      "Créditos extras por R$0,12/crédito",
      "Dashboard de métricas",
    ],
    notIncluded: ["Suporte prioritário"],
  },
  {
    id: "business",
    name: "Business",
    price: 199,
    credits: "2.500 créditos",
    cta: "Assinar Business",
    href: "/sign-up?plan=business",
    popular: false,
    features: [
      "2.500 créditos/mês",
      "LinkedIn (texto, imagem, carrossel, vídeo)",
      "X — somente texto*",
      "Todos os agentes de IA",
      "Múltiplos projetos simultâneos",
      "Créditos extras por R$0,10/crédito",
      "Dashboard de métricas",
      "Suporte prioritário",
    ],
    notIncluded: [],
  },
  {
    id: "agency",
    name: "Agency",
    price: 399,
    credits: "5.500 créditos",
    cta: "Assinar Agency",
    href: "/sign-up?plan=agency",
    popular: false,
    features: [
      "5.500 créditos/mês",
      "LinkedIn (texto, imagem, carrossel, vídeo)",
      "X — somente texto*",
      "Todos os agentes de IA",
      "Projetos ilimitados",
      "Créditos extras por R$0,08/crédito",
      "Dashboard de métricas",
      "Onboarding dedicado",
      "Suporte prioritário",
    ],
    notIncluded: [],
  },
];

export function Pricing() {
  const [, setBillingPeriod] = useState<"monthly" | "annual">("monthly");

  return (
    <section id="pricing" className="py-32 relative">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#2a2a2a] to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-full px-4 py-1.5 text-sm text-orange-400 mb-6">
            <Zap className="w-3.5 h-3.5" />
            Preços simples e transparentes
          </div>
          <h2 className="text-4xl lg:text-5xl font-black text-[#f5f5f5] mb-4">
            Escolha o plano{" "}
            <span className="text-orange-500">certo para você</span>
          </h2>
          <p className="text-xl text-[#9ca3af] max-w-xl mx-auto mb-4">
            Cancele quando quiser. Sem fidelidade, sem surpresas.
          </p>
          <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-full px-5 py-2 text-sm text-orange-300 font-medium">
            <Zap className="w-3.5 h-3.5 shrink-0" />
            Lançamento — 50% off nos 3 primeiros meses com o código{" "}
            <span className="font-bold tracking-wide text-orange-400">
              50LANCAMENTO
            </span>
          </div>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 items-start">
          {PLANS.map((plan, i) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className={cn(
                "relative rounded-2xl p-8 border",
                plan.popular
                  ? "bg-[#111] border-orange-500 shadow-[0_0_40px_rgba(249,115,22,0.15)]"
                  : "bg-[#111] border-[#2a2a2a]"
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
                <h3 className="text-xl font-bold text-[#f5f5f5] mb-1">
                  {plan.name}
                </h3>
                <p className="text-sm text-[#9ca3af]">{plan.credits}</p>
              </div>

              <div className="mb-8">
                <div className="flex items-baseline gap-1">
                  <span className="text-[#9ca3af] text-lg">R$</span>
                  <span className="text-5xl font-black text-[#f5f5f5]">
                    {plan.price}
                  </span>
                  <span className="text-[#9ca3af] text-sm">/mês</span>
                </div>
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
                    <span className="text-[#f5f5f5]">{feature}</span>
                  </li>
                ))}
                {plan.notIncluded.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2.5 text-sm opacity-40"
                  >
                    <div className="w-4 h-4 shrink-0 mt-0.5 flex items-center justify-center">
                      <div className="w-3 h-px bg-[#9ca3af]" />
                    </div>
                    <span className="text-[#9ca3af] line-through">
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        <p className="text-center text-sm text-[#9ca3af] mt-8 max-w-2xl mx-auto">
          * Imagens no X requerem plano API pago da plataforma X (Basic tier).
          Por ora, posts no X são publicados em texto.
        </p>
      </div>
    </section>
  );
}
