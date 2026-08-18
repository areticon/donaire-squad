"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Zap, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

const PLANS = [
  {
    id: "pro",
    name: "Pro",
    price: 149,
    features: [
      "7 dias grátis para testar",
      "1.800 créditos/mês",
      "Campanha semanal completa: LinkedIn, X e Instagram",
      "Imagens e carrosséis com IA",
      "Comentário de fontes automático",
      "Créditos extras por R$0,12",
      "Dashboard de métricas",
    ],
    cta: "Assinar Pro",
    popular: true,
  },
  {
    id: "business",
    name: "Business",
    price: 249,
    features: [
      "3.500 créditos/mês",
      "Tudo do Pro + vídeo com IA",
      "Múltiplos projetos simultâneos",
      "Créditos extras por R$0,10",
      "Suporte prioritário",
    ],
    cta: "Assinar Business",
  },
  {
    id: "studio",
    name: "Studio",
    price: 449,
    features: [
      "7.000 créditos/mês",
      "Tudo do Business",
      "Projetos ilimitados",
      "Créditos extras por R$0,08",
      "Onboarding dedicado",
    ],
    cta: "Assinar Studio",
  },
];

export default function BillingPage() {
  const [loading, setLoading] = useState<string | null>(null);

  async function subscribe(planId: string) {
    setLoading(planId);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.location.href = data.url;
    } catch {
      toast.error("Erro ao processar pagamento. Tente novamente.");
    } finally {
      setLoading(null);
    }
  }

  async function openPortal() {
    setLoading("portal");
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.location.href = data.url;
    } catch {
      toast.error("Erro ao abrir portal de billing");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-10">
        <h1 className="text-3xl font-black" style={{ color: "var(--text-primary)" }}>Plano & Billing</h1>
        <p className="mt-1" style={{ color: "var(--text-muted)" }}>
          Gerencie sua assinatura e faturamento
        </p>
      </div>

      <div className="mb-8 p-4 rounded-xl border flex items-center justify-between" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-orange-500/10 rounded-lg flex items-center justify-center">
            <Zap className="w-4 h-4 text-orange-400" />
          </div>
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Plano atual</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Gerencie sua assinatura pelo portal Stripe
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={openPortal} loading={loading === "portal"}>
          <ExternalLink className="w-3.5 h-3.5" />
          Gerenciar assinatura
        </Button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
        {PLANS.map((plan, i) => (
          <motion.div
            key={plan.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className={cn("relative p-6 rounded-2xl border", plan.popular ? "border-orange-500" : "")}
            style={plan.popular ? { background: "var(--bg-card)" } : { background: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-orange-500 text-white text-xs font-bold px-3 py-0.5 rounded-full">
                  RECOMENDADO
                </span>
              </div>
            )}

            <div className="mb-4">
              <h3 className="font-bold mb-1" style={{ color: "var(--text-primary)" }}>{plan.name}</h3>
              <div className="flex items-baseline gap-1">
                {plan.price === 0 ? (
                  <span className="text-3xl font-black" style={{ color: "var(--text-primary)" }}>Grátis</span>
                ) : (
                  <>
                    <span className="text-sm" style={{ color: "var(--text-muted)" }}>R$</span>
                    <span className="text-3xl font-black" style={{ color: "var(--text-primary)" }}>{plan.price}</span>
                    <span className="text-sm" style={{ color: "var(--text-muted)" }}>/mês</span>
                  </>
                )}
              </div>
            </div>

            <ul className="space-y-2 mb-6">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm">
                  <Check className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                  <span style={{ color: "var(--text-primary)" }}>{f}</span>
                </li>
              ))}
            </ul>

            <Button
              className="w-full"
              variant={plan.popular ? "default" : "outline"}
              disabled={loading === plan.id}
              loading={loading === plan.id}
              onClick={() => subscribe(plan.id)}
            >
              {plan.cta}
            </Button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
