import { Mic, Ticket } from "lucide-react";
import { EXTRAS_A_PARTIR_DO_PRO, type PlanoPublico } from "@/lib/planos";

/**
 * O BLOCO DE DESTAQUE DOS ENTREGÁVEIS (02/10, pedido do Bruno): Demanda Day e
 * Demanda Cast em caixa própria, acima da lista do plano, para não se
 * perderem entre as linhas de volume. A landing (components/landing/pricing.tsx)
 * e /planos desenham o mesmo bloco, lido de lib/planos.ts.
 *
 * O Starter não tem extras; nele o bloco vira uma linha discreta dizendo que
 * eles começam no Pro, que é argumento de subida sem prometer o que não vem.
 */
export function ExtrasDoPlano({ plano }: { plano: PlanoPublico }) {
  if (!plano.extras?.length) {
    return <p className="mb-6 text-xs text-[var(--text-muted)]">{EXTRAS_A_PARTIR_DO_PRO}</p>;
  }
  return (
    <div className="mb-6 rounded-xl border border-orange-500/40 bg-orange-500/[0.07] p-4 space-y-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-orange-400">Incluso no plano</p>
      {plano.extras.map((e) => {
        const Icone = e.marca === "Demanda Cast" ? Mic : Ticket;
        return (
          <div key={e.titulo} className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-500 text-white">
              <Icone className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--text-primary)] leading-snug">{e.titulo}</p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{e.texto}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
