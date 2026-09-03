"use client";

import { useState } from "react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { IdentificacaoCurta } from "@/components/identificacao-legal";
import Link from "next/link";
import { Check, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMarkAnimated } from "@/components/brand-mark-animated";
import { cn } from "@/lib/utils";
import { useVagasDeFundador } from "@/lib/use-vagas-de-fundador";
import { FUNDADOR, GARANTIA_DIAS, PLANOS_PUBLICOS, TRIAL_DAYS, mensalDoAnual, reais } from "@/lib/planos";

/**
 * Escolha de plano antes do cadastro. É o destino dos CTAs genéricos
 * ("Começar grátis"): a pessoa decide o plano aqui e sai com ?plan= (e
 * ?ciclo=anual) para o cadastro, que desagua direto no checkout via
 * /billing/start. Página pública, travada no tema escuro como a landing.
 *
 * Os valores vêm de lib/planos, módulo sem Stripe: lib/stripe não pode ser
 * importado aqui porque puxa o SDK do Stripe, e import de servidor em página
 * cliente arrasta o driver para o bundle do navegador (armadilha já paga, ver
 * PROJETO.md).
 */

const PLANOS = PLANOS_PUBLICOS.map((p) => ({
  ...p,
  mensalNoAnual: mensalDoAnual(p),
  economiaAno: p.mensal * 12 - p.anual,
}));

function PlanosConteudo() {
  const [ciclo, setCiclo] = useState<"mensal" | "anual">("mensal");
  // Quem já tem conta mas ainda não tem plano é mandado para cá pelo portão
  // do app (lib/onboarding/portao.ts). Sem explicar por que, a pessoa acha
  // que o login falhou.
  const veioDoPortao = useSearchParams().get("assinar") === "1";
  const vagasDeFundador = useVagasDeFundador();

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
            Você paga por gravação, não por crédito. Cancele quando quiser, sem
            multa. E nos primeiros {GARANTIA_DIAS} dias, se não publicar nada que
            aprovou, devolvemos tudo.
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
            // Fundador só no mensal: o cupom é de R$ 300 por mês para sempre, e
            // no anual a conta ficaria confusa contra os dois meses grátis.
            const fundador = plano.id === FUNDADOR.plano && vagasDeFundador > 0 && !mostrandoAnual;
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
                      MAIS ESCOLHIDO
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h2 className="text-xl font-bold text-[var(--text-primary)] mb-1">{plano.nome}</h2>
                  <p className="text-sm text-[var(--text-muted)]">{plano.descricao}</p>
                </div>

                <div className="mb-8">
                  <div className="flex items-baseline gap-1">
                    {fundador ? (
                      <span className="text-[var(--text-muted)] text-lg line-through mr-1">R$ {reais(plano.mensal)}</span>
                    ) : (
                      <span className="text-[var(--text-muted)] text-lg">R$</span>
                    )}
                    <span className="text-5xl font-black text-[var(--text-primary)]">
                      {fundador ? reais(FUNDADOR.mensal) : reais(mostrandoAnual ? plano.mensalNoAnual : plano.mensal)}
                    </span>
                    <span className="text-[var(--text-muted)] text-sm">/mês</span>
                  </div>
                  {fundador ? (
                    <p className="mt-2 text-sm font-semibold text-orange-400">
                      Fundador: {vagasDeFundador} de {FUNDADOR.vagas} vagas. Esse preço fica para sempre.
                    </p>
                  ) : mostrandoAnual ? (
                    <div className="mt-2 space-y-1">
                      <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-400">
                        <Zap className="w-3.5 h-3.5" />
                        Economize R$ {reais(plano.economiaAno)} por ano
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        R$ {reais(plano.anual)} cobrados uma vez, equivalentes a 10 mensalidades
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-[var(--text-muted)]">
                      No anual sai por R$ {reais(plano.mensalNoAnual)}/mês
                    </p>
                  )}
                </div>

                <Button className="w-full mb-8" variant={plano.destaque ? "default" : "outline"} asChild>
                  <Link href={href}>
                    {plano.destaque && <Zap className="w-4 h-4" />}
                    {fundador ? "Garantir vaga de fundador" : `Começar os ${TRIAL_DAYS} dias grátis`}
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

        <div className="mt-10 max-w-2xl mx-auto flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
          <ShieldCheck className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
          <p className="text-sm text-[var(--text-muted)]">
            <span className="font-semibold text-[var(--text-primary)]">Garantia de {GARANTIA_DIAS} dias.</span>{" "}
            Se nos primeiros {GARANTIA_DIAS} dias você não publicar nada que aprovou, devolvemos
            tudo. Além dela vale o arrependimento de 7 dias, como manda a lei.
          </p>
        </div>

        <p className="text-center text-sm text-[var(--text-muted)] mt-6 max-w-2xl mx-auto">
          O teste grátis pede cartão e não cobra nada se você cancelar dentro dos {TRIAL_DAYS} dias.
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
