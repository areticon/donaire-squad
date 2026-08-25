"use client";

import { useState } from "react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { IdentificacaoCurta } from "@/components/identificacao-legal";
import Link from "next/link";
import { Check, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMarkAnimated } from "@/components/brand-mark-animated";
import { cn } from "@/lib/utils";

/**
 * Escolha de plano antes do cadastro. É o destino dos CTAs genéricos
 * ("Começar grátis"): a pessoa decide o plano aqui e sai com ?plan= (e
 * ?ciclo=anual) para o cadastro, que desagua direto no checkout via
 * /billing/start. Página pública, travada no tema escuro como a landing.
 *
 * Os valores são espelho manual dos PLANS de lib/stripe, que não pode ser
 * importado aqui: aquele módulo puxa o SDK do Stripe, e import de servidor em
 * página cliente arrasta o driver para o bundle do navegador (armadilha já
 * paga, ver PROJETO.md).
 */

/**
 * O anual é sempre 10 mensalidades: dois meses de desconto, mesma conta nos
 * três planos. O card mostra o **mensal equivalente** em destaque e o total do
 * ano em letra pequena: número grande de quatro dígitos assusta e derruba a
 * conversão, e o que vende o anual é a economia, não o valor cheio.
 */
const PLANOS = [
  {
    id: "pro",
    nome: "Pro",
    mensal: 149,
    creditos: "1.800 créditos/mês",
    destaque: true,
    cta: "Começar os 7 dias grátis",
    features: [
      "7 dias grátis para testar",
      "Campanha semanal completa: LinkedIn, X e Instagram",
      "Imagens e carrosséis com IA",
      "Comentário de fontes automático",
      "Todos os agentes de IA",
      "Créditos extras por R$0,12",
      "Dashboard de métricas",
    ],
  },
  {
    id: "business",
    nome: "Business",
    mensal: 249,
    creditos: "3.500 créditos/mês",
    destaque: false,
    cta: "Assinar Business",
    features: [
      "Tudo do Pro + vídeo com IA",
      "Múltiplos projetos simultâneos",
      "Créditos extras por R$0,10",
      "Suporte prioritário",
    ],
  },
  {
    id: "studio",
    nome: "Studio",
    mensal: 449,
    creditos: "7.000 créditos/mês",
    destaque: false,
    cta: "Assinar Studio",
    features: [
      "Tudo do Business",
      "Projetos ilimitados",
      "Créditos extras por R$0,08",
      "Onboarding dedicado",
      "Suporte prioritário",
    ],
  },
].map((p) => ({
  ...p,
  anual: p.mensal * 10,
  mensalNoAnual: Math.round((p.mensal * 10) / 12),
  economiaAno: p.mensal * 12 - p.mensal * 10,
}));

function PlanosConteudo() {
  const [ciclo, setCiclo] = useState<"mensal" | "anual">("mensal");
  // Quem já tem conta mas ainda não tem plano é mandado para cá pelo portão
  // do app (lib/onboarding/portao.ts). Sem explicar por que, a pessoa acha
  // que o login falhou.
  const veioDoPortao = useSearchParams().get("assinar") === "1";

  return (
    <main data-theme="dark" className="min-h-screen bg-[var(--bg-primary)]">
      <header className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <BrandMarkAnimated size={30} />
          <span className="flex flex-col justify-center">
            <span className="font-mont font-bold text-[var(--text-primary)] text-lg lowercase leading-none">demandou.</span>
            <span className="text-[11px] text-[var(--text-muted)] lowercase tracking-wide leading-none mt-1">postou.</span>
          </span>
        </Link>
        <Link href="/sign-in" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          Já tenho conta
        </Link>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 lg:py-16">
        {veioDoPortao && (
          <div className="max-w-xl mx-auto mb-8 p-4 rounded-xl border border-orange-500/25 bg-orange-500/5 text-sm text-orange-300 text-center">
            Sua conta está criada. Falta escolher o plano para o seu squad
            começar a trabalhar. O teste de 7 dias não cobra nada se você
            cancelar dentro do prazo.
          </div>
        )}
        <div className="text-center mb-10">
          <h1 className="text-4xl lg:text-5xl font-black text-[var(--text-primary)] mb-3">
            Escolha o plano <span className="text-orange-500">certo para você</span>
          </h1>
          <p className="text-lg text-[var(--text-muted)] max-w-xl mx-auto">
            Cancele quando quiser, sem multa. E o arrependimento em até 7 dias
            devolve tudo, como manda a lei.
          </p>

          <div className="inline-flex items-center gap-1 mt-6 p-1 rounded-full border border-[var(--border)] bg-[var(--bg-surface)]">
            <button
              onClick={() => setCiclo("mensal")}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-medium transition-colors",
                ciclo === "mensal" ? "bg-orange-500 text-white" : "text-[var(--text-muted)]"
              )}
            >
              Mensal
            </button>
            <button
              onClick={() => setCiclo("anual")}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-medium transition-colors",
                ciclo === "anual" ? "bg-orange-500 text-white" : "text-[var(--text-muted)]"
              )}
            >
              Anual <span className="opacity-80">(2 meses grátis)</span>
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
          {PLANOS.map((plano) => {
            const mostrandoAnual = ciclo === "anual";
            const href = `/sign-up?plan=${plano.id}${mostrandoAnual ? "&ciclo=anual" : ""}`;
            return (
              <div
                key={plano.id}
                className={cn(
                  "relative rounded-2xl p-8 border bg-[var(--bg-card)]",
                  plano.destaque ? "border-orange-500 shadow-[0_0_40px_rgba(249,115,22,0.15)]" : "border-[var(--border)]"
                )}
              >
                {plano.destaque && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="bg-orange-500 text-white text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap">
                      MAIS POPULAR
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h2 className="text-xl font-bold text-[var(--text-primary)] mb-1">{plano.nome}</h2>
                  <p className="text-sm text-[var(--text-muted)]">{plano.creditos}</p>
                </div>

                <div className="mb-8">
                  <div className="flex items-baseline gap-1">
                    <span className="text-[var(--text-muted)] text-lg">R$</span>
                    <span className="text-5xl font-black text-[var(--text-primary)]">
                      {mostrandoAnual ? plano.mensalNoAnual : plano.mensal}
                    </span>
                    <span className="text-[var(--text-muted)] text-sm">/mês</span>
                  </div>
                  {mostrandoAnual ? (
                    <div className="mt-2 space-y-1">
                      <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-400">
                        <Zap className="w-3.5 h-3.5" />
                        Economize R$ {plano.economiaAno} por ano
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        R$ {plano.anual.toLocaleString("pt-BR")} cobrados uma vez, equivalentes a 10 mensalidades
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-[var(--text-muted)]">
                      No anual sai por R$ {plano.mensalNoAnual}/mês
                    </p>
                  )}
                </div>

                <Button className="w-full mb-8" variant={plano.destaque ? "default" : "outline"} asChild>
                  <Link href={href}>
                    {plano.destaque && <Zap className="w-4 h-4" />}
                    {plano.cta}
                  </Link>
                </Button>

                <ul className="space-y-3">
                  {plano.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                      <span className="text-[var(--text-primary)]">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <p className="text-center text-sm text-[var(--text-muted)] mt-10 max-w-2xl mx-auto">
          O teste grátis pede cartão e não cobra nada se você cancelar dentro dos 7 dias.
          {ciclo === "anual" && (
            <>
              {" "}No plano anual você contrata 12 meses de uma vez e é por isso que
              o preço por mês cai; o acesso vale o período inteiro, mesmo que você
              pare de usar antes.
            </>
          )}
        </p>

        <IdentificacaoCurta className="mt-12" />
      </div>
    </main>
  );
}

export default function PlanosPage() {
  // useSearchParams precisa de Suspense em torno, senão o build reclama de
  // pré-renderização.
  return (
    <Suspense>
      <PlanosConteudo />
    </Suspense>
  );
}
