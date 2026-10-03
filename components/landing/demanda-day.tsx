import Link from "next/link";
import { Users, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BotaoDeCaptura } from "@/components/landing/botao-de-captura";

/**
 * O DEMANDA DAY COMO COMUNIDADE E EVENTO (02/10, pedido do Matheus).
 *
 * Sem data e sem nome de palestrante: nenhum dos dois está decidido, e a
 * página não promete o que não existe. O que existe é o que está nos planos
 * (lib/planos.ts): 1 ingresso no Pro e 3 no Enterprise.
 */
export function DemandaDay() {
  return (
    <section id="demanda-day" aria-label="Demanda Day" className="relative py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-orange-500/40 bg-[var(--bg-surface)] p-6 sm:p-10 grid lg:grid-cols-[minmax(0,1fr)_auto] gap-8 items-center">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-orange-400 mb-3">
              <Users className="w-4 h-4" /> Comunidade e evento
            </p>
            <h2 className="text-3xl lg:text-4xl font-black text-[var(--text-primary)] mb-3">
              Demanda Day. <span className="text-orange-500">Um dia com quem faz o mercado.</span>
            </h2>
            <p className="text-lg text-[var(--text-muted)] max-w-2xl">
              Imersão presencial com alguns dos maiores nomes do mercado empresarial. Conteúdo de valor, acesso e
              networking de alto nível.
            </p>
            <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <Ticket className="w-4 h-4 text-orange-400" /> 1 ingresso no plano Pro. 3 no Enterprise.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row lg:flex-col gap-3">
            <Button size="lg" variant="conversao" asChild>
              <Link href="#pricing">Ver os planos</Link>
            </Button>
            <BotaoDeCaptura origem="demanda-day" size="lg" variant="outline">
              Agendar reunião
            </BotaoDeCaptura>
          </div>
        </div>
      </div>
    </section>
  );
}
