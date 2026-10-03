import { ChevronRight, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EtapaDoParecer, TomDaEtapa } from "@/lib/squad/parecer-da-peca";

/**
 * A LINHA DO TEMPO DO PARECER: reprovado pela Vera, corrigido pelo redator,
 * aprovado por você, publicado.
 *
 * Substitui o selo único da ficha ("Vera: reprovado"), que em 19/09 fazia
 * TODA peça parecer reprovada, inclusive as corrigidas e aprovadas em
 * seguida. Uma peça tem história, e é a história que diz se está tudo bem.
 *
 * Puro de propósito: recebe as etapas prontas e desenha. É o que deixa o
 * renderToString provar os cenários (reprovada e corrigida, rejeitada pelo
 * cliente, publicada) sem banco e sem fetch.
 */

const COR: Record<TomDaEtapa, { texto: string; ponto: string }> = {
  ok: { texto: "text-green-400", ponto: "#4ade80" },
  alerta: { texto: "text-orange-400", ponto: "#fb923c" },
  erro: { texto: "text-red-400", ponto: "#f87171" },
  neutro: { texto: "text-[var(--text-muted)]", ponto: "var(--text-muted)" },
};

export function LinhaDoTempoDoParecer({
  etapas,
  compacta = false,
  className,
}: {
  etapas: EtapaDoParecer[];
  /** Na ficha, uma linha só e a nota cortada; no card aberto, com espaço. */
  compacta?: boolean;
  className?: string;
}) {
  if (etapas.length === 0) return null;
  // A nota que vale mostrar é o MOTIVO: a da reprovação (ou da ressalva). As
  // etapas seguintes não têm nota, então a primeira com nota é a certa.
  const motivo = etapas.find((e) => e.nota)?.nota ?? null;

  return (
    <div
      data-parecer
      className={cn("flex flex-col gap-1 rounded-md border px-2 py-1.5", className)}
      style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
    >
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5" aria-label="Linha do tempo do parecer">
        {etapas.map((e, i) => (
          <li key={`${i}-${e.rotulo}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden />}
            {i === 0 && <ShieldCheck className="h-3 w-3 shrink-0" style={{ color: COR[e.tom].ponto }} aria-hidden />}
            <span
              className={cn(
                "whitespace-nowrap font-bold uppercase tracking-[.04em]",
                compacta ? "text-[10px]" : "text-[11px]",
                COR[e.tom].texto
              )}
            >
              {e.rotulo}
            </span>
          </li>
        ))}
      </ol>
      {motivo && (
        <p
          className={cn("leading-snug", compacta ? "line-clamp-2 text-[10.5px]" : "text-xs")}
          style={{ color: "var(--text-muted)" }}
        >
          {motivo}
        </p>
      )}
    </div>
  );
}
