"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Check, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    description: "Para experimentar",
    cta: "Começar grátis",
    href: "/sign-up",
    features: [
      "1 projeto",
      "2 agentes de IA",
      "5 posts por mês",
      "LinkedIn e X",
      "Aprovação manual",
    ],
    notIncluded: [
      "Agendamento automático",
      "Infográficos com IA",
      "Visualização em tempo real",
    ],
    popular: false,
  },
  {
    id: "starter",
    name: "Starter",
    price: 97,
    description: "Para profissionais e pequenas empresas",
    cta: "Assinar Starter",
    href: "/sign-up?plan=starter",
    features: [
      "3 projetos",
      "8 agentes de IA",
      "30 posts por mês",
      "LinkedIn, X e Instagram",
      "Agendamento automático",
      "Infográficos com IA",
      "Memória persistente",
      "Dashboard de métricas",
    ],
    notIncluded: [
      "Visualização em tempo real",
      "API access",
    ],
    popular: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: 297,
    description: "Para agências e equipes",
    cta: "Assinar Pro",
    href: "/sign-up?plan=pro",
    features: [
      "Projetos ilimitados",
      "Agentes ilimitados",
      "Posts ilimitados",
      "Todas as redes sociais",
      "Agendamento automático",
      "Infográficos com IA",
      "Visualização em tempo real",
      "Dashboard avançado",
      "API access",
      "Suporte prioritário",
    ],
    notIncluded: [],
    popular: false,
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
            Escolha o plano <span className="text-orange-500">certo para você</span>
          </h2>
          <p className="text-xl text-[#9ca3af] max-w-xl mx-auto">
            Cancele quando quiser. Sem fidelidade, sem surpresas.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 items-start">
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
                  <span className="bg-orange-500 text-white text-xs font-bold px-4 py-1 rounded-full">
                    MAIS POPULAR
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-bold text-[#f5f5f5] mb-1">{plan.name}</h3>
                <p className="text-sm text-[#9ca3af]">{plan.description}</p>
              </div>

              <div className="mb-8">
                <div className="flex items-baseline gap-1">
                  <span className="text-[#9ca3af] text-lg">R$</span>
                  <span className="text-5xl font-black text-[#f5f5f5]">{plan.price}</span>
                  {plan.price > 0 && (
                    <span className="text-[#9ca3af] text-sm">/mês</span>
                  )}
                </div>
                {plan.price === 0 && (
                  <span className="text-[#9ca3af] text-sm">Para sempre</span>
                )}
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
                  <li key={feature} className="flex items-start gap-2.5 text-sm opacity-40">
                    <div className="w-4 h-4 shrink-0 mt-0.5 flex items-center justify-center">
                      <div className="w-3 h-px bg-[#9ca3af]" />
                    </div>
                    <span className="text-[#9ca3af] line-through">{feature}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        <p className="text-center text-sm text-[#9ca3af] mt-8">
          Todos os planos incluem setup assistido por IA e suporte via email.
        </p>
      </div>
    </section>
  );
}
