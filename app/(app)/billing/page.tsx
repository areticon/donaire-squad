"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Zap, ExternalLink, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreditBalance } from "@/components/billing/credit-balance";
import { cn } from "@/lib/utils";
import { FUNDADOR, GARANTIA_DIAS, PLANOS_PUBLICOS, mensalDoAnual, reais } from "@/lib/planos";
import { useVagasDeFundador } from "@/lib/use-vagas-de-fundador";
import toast from "react-hot-toast";

// A tabela vem de lib/planos, a mesma da landing e de /planos. A oferta de
// fundador (Autoridade por R$ 397 para sempre, 10 vagas) aparece enquanto o
// Stripe disser que há vaga; o checkout confere de novo e aplica o cupom.
const PLANS = PLANOS_PUBLICOS;

export default function BillingPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const vagasDeFundador = useVagasDeFundador();

  async function subscribe(planId: string, ciclo?: "anual") {
    setLoading(ciclo ? `${planId}-anual` : planId);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, ciclo }),
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

      <div className="mb-8">
        <CreditBalance />
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
        {PLANS.map((plan, i) => {
          const fundador = plan.id === FUNDADOR.plano && vagasDeFundador > 0;
          return (
          <motion.div
            key={plan.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className={cn("relative p-6 rounded-2xl border", plan.destaque ? "border-orange-500" : "")}
            style={plan.destaque ? { background: "var(--bg-card)" } : { background: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            {plan.destaque && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-orange-500 text-white text-xs font-bold px-3 py-0.5 rounded-full">
                  RECOMENDADO
                </span>
              </div>
            )}

            <div className="mb-4">
              <h3 className="font-bold mb-1" style={{ color: "var(--text-primary)" }}>{plan.nome}</h3>
              <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>{plan.descricao}</p>
              <div className="flex items-baseline gap-1">
                {fundador && (
                  <span className="text-sm line-through mr-1" style={{ color: "var(--text-muted)" }}>R$ {reais(plan.mensal)}</span>
                )}
                <span className="text-sm" style={{ color: "var(--text-muted)" }}>R$</span>
                <span className="text-3xl font-black" style={{ color: "var(--text-primary)" }}>
                  {reais(fundador ? FUNDADOR.mensal : plan.mensal)}
                </span>
                <span className="text-sm" style={{ color: "var(--text-muted)" }}>/mês</span>
              </div>
              {fundador && (
                <p className="mt-1 text-xs font-semibold text-orange-400">
                  Fundador: {vagasDeFundador} de {FUNDADOR.vagas} vagas. Esse preço fica para sempre.
                </p>
              )}
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
              variant={plan.destaque ? "default" : "outline"}
              disabled={loading === plan.id}
              loading={loading === plan.id}
              onClick={() => subscribe(plan.id)}
            >
              {fundador ? "Garantir vaga de fundador" : `Assinar ${plan.nome}`}
            </Button>

            <div className="mt-3 text-center">
              <button
                className="text-sm font-medium text-orange-400 hover:text-orange-300 disabled:opacity-50"
                disabled={loading === `${plan.id}-anual`}
                onClick={() => subscribe(plan.id, "anual")}
              >
                {loading === `${plan.id}-anual`
                  ? "Abrindo checkout..."
                  : `ou R$ ${reais(mensalDoAnual(plan))}/mês no anual (2 meses grátis)`}
              </button>
            </div>
          </motion.div>
          );
        })}
      </div>

      <div className="mt-8 flex items-start gap-3 rounded-xl border p-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <ShieldCheck className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          <span className="font-semibold" style={{ color: "var(--text-primary)" }}>Garantia de {GARANTIA_DIAS} dias.</span>{" "}
          Se nos primeiros {GARANTIA_DIAS} dias você não publicar nada que aprovou, devolvemos tudo.
        </p>
      </div>
    </div>
  );
}
