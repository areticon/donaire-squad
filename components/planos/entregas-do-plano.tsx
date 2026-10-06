import { Clapperboard, Film, HardDrive, LayoutGrid, Sparkles, Users } from "lucide-react";
import type { PlanoPublico } from "@/lib/planos";
import { comoContamos, numerosDoCartao } from "@/lib/entregas-do-plano";

/**
 * O QUE O PLANO ENTREGA, em números (06/10, decisão do Bruno): minutos de vídeo,
 * vídeos, peças, vídeo por IA, armazenamento e marcas, no lugar das linhas de
 * volume escritas à mão. Os números saem todos de lib/entregas-do-plano.ts; a
 * landing, /planos e a aba Plano desenham o mesmo bloco.
 */
const ICONES = {
  minutos: Clapperboard,
  videos: Film,
  pecas: LayoutGrid,
  ia: Sparkles,
  armazenamento: HardDrive,
  marcas: Users,
} as const;

export function EntregasDoPlano({ plano, className = "mb-6" }: { plano: PlanoPublico; className?: string }) {
  const numeros = numerosDoCartao(plano);
  return (
    <div className={className}>
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Por mês, você leva</p>
      <dl className="grid grid-cols-2 gap-2">
        {numeros.map((n) => {
          const Icone = ICONES[n.id as keyof typeof ICONES] ?? Film;
          return (
            <div key={n.id} className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3">
              <dt className="sr-only">{n.rotulo}</dt>
              <dd>
                <div className="flex items-center gap-1.5">
                  <Icone className="h-3.5 w-3.5 shrink-0 text-orange-400" aria-hidden />
                  <span className="text-xl font-black leading-none text-[var(--text-primary)] tabular-nums">{n.valor}</span>
                </div>
                <p className="mt-1.5 text-xs font-semibold leading-snug text-[var(--text-primary)]">{n.rotulo}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-[var(--text-muted)]">{n.detalhe}</p>
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

/**
 * "COMO CONTAMOS": a ajuda discreta, fechada por padrão, e o único lugar da
 * vitrine onde a palavra crédito aparece. Quem quer conferir a conta abre;
 * quem compra não precisa.
 */
export function ComoContamos({ className = "" }: { className?: string }) {
  const { linhas, tabela } = comoContamos();
  return (
    <details className={`group mx-auto max-w-3xl rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-5 py-3 ${className}`}>
      <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] [&::-webkit-details-marker]:hidden">
        <span className="mr-1.5 inline-block transition-transform group-open:rotate-90">›</span>
        Como contamos esses números
      </summary>
      <div className="mt-3 space-y-2 text-xs leading-relaxed text-[var(--text-muted)]">
        {linhas.map((l) => (
          <p key={l}>{l}</p>
        ))}
        <div className="overflow-x-auto pt-1">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[var(--text-primary)]">
                <th className="py-1 pr-3 font-semibold">Plano</th>
                <th className="py-1 pr-3 font-semibold">Saldo do mês, em créditos</th>
                <th className="py-1 pr-3 font-semibold">Cada gravação, em créditos</th>
                <th className="py-1 font-semibold">Gravações</th>
              </tr>
            </thead>
            <tbody>
              {tabela.map((t) => (
                <tr key={t.plano} className="border-t border-[var(--border)]">
                  <td className="py-1 pr-3">{t.plano}</td>
                  <td className="py-1 pr-3 tabular-nums">{t.saldo}</td>
                  <td className="py-1 pr-3 tabular-nums">{t.porGravacao}</td>
                  <td className="py-1 tabular-nums">{t.minutos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}
