import Link from "next/link";
import { ArrowRight, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BotaoDeCaptura } from "@/components/landing/botao-de-captura";
import { AGENTES } from "@/lib/squad/estado-do-squad";
import { contaDoStarter, emReais } from "@/lib/calculadora/custos";

/**
 * SOLUÇÃO PRONTA (02/10, noite, pedido do Matheus), logo depois de "Conheça a
 * sua equipe".
 *
 * Ele disse "mais de 7 pessoas"; a página diz o número real, o tamanho da
 * lista de agentes (lib/squad/estado-do-squad.ts, 11 hoje). "Aumentando a sua
 * receita" virou "para vender mais": é a ambição, não um resultado prometido,
 * porque não temos prova de receita. A despesa menor tem prova, a mesma conta
 * da calculadora no volume do Starter (agência contra o plano).
 */
const CONTA = contaDoStarter();
const AGENCIA = CONTA.cenarios.find((c) => c.id === "agencia")?.mensal ?? 0;

export function SolucaoPronta() {
  return (
    <section id="solucao-pronta" aria-label="Solução pronta" className="relative pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-orange-500/40 bg-[linear-gradient(135deg,var(--bg-surface),var(--bg-elevated))] p-8 sm:p-12 text-center">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-orange-400 mb-4">
            <Building2 className="w-4 h-4" /> Solução pronta
          </p>
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-[var(--text-primary)] leading-[1.08] max-w-4xl mx-auto">
            Um escritório de marketing com {AGENTES.length} especialistas,{" "}
            <span className="text-orange-500">24 horas só para o seu negócio.</span>
          </h2>
          <div className="mt-6 space-y-1.5 text-lg sm:text-xl max-w-2xl mx-auto">
            <p className="font-semibold text-[var(--text-primary)]">Para vender mais.</p>
            <p className="text-[var(--text-muted)]">Com muito menos despesa na operação de marketing.</p>
          </div>
          {AGENCIA > 0 && (
            <p className="mt-5 text-sm text-[var(--text-muted)]">
              Uma agência cobra <span className="whitespace-nowrap">{emReais(AGENCIA)}</span> por mês pelo mesmo volume. Com a Demandou,{" "}
              <span className="whitespace-nowrap">{emReais(CONTA.plano.mensal)}</span>.
            </p>
          )}
          <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:justify-center">
            <Button size="lg" variant="conversao" asChild>
              <Link href="#pricing">
                Ver planos <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            <BotaoDeCaptura origem="equipe" size="lg" variant="outline">
              Agendar reunião
            </BotaoDeCaptura>
          </div>
        </div>
      </div>
    </section>
  );
}
