import { NOMES_DAS_REDES } from "@/lib/posts/estado";

/**
 * OS GRÁFICOS DA TELA INICIAL, em SVG puro (28/09).
 *
 * Pedido do Bruno: "gráficos ao invés de cards". O projeto não tinha
 * biblioteca de gráfico, e duas formas simples (barras empilhadas e barras
 * horizontais) não justificam 90 KB de dependência no navegador: aqui é SVG
 * desenhado no servidor, com as cores das redes e os tokens do tema, e o valor
 * exato no `<title>` de cada barra (aparece ao passar o mouse).
 */

/**
 * As cores dos gráficos saíram das cores oficiais das redes no rebranding de
 * 01/10: o Bruno pediu os gráficos na paleta da marca (marinho, cinzas e
 * laranja, com degradê), e seis cores de logotipo lado a lado brigavam com
 * ela. A série principal (LinkedIn, a rede do comprador B2B) é o marinho; o
 * Instagram leva o laranja. Os tons mudam por tema (--grafico-* em
 * globals.css) para manter contraste sobre o fundo.
 */
export const COR_DA_REDE: Record<string, string> = {
  linkedin: "var(--grafico-1)",
  instagram: "var(--grafico-2)",
  facebook: "var(--grafico-3)",
  twitter: "var(--grafico-4)",
  tiktok: "var(--grafico-5)",
  youtube: "var(--grafico-6)",
};

const nomeDaRede = (r: string) => NOMES_DAS_REDES[r] ?? r;
const num = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/** Posts publicados por semana, cada barra empilhada por rede. */
export function BarrasPorSemana({ semanas }: { semanas: Array<{ rotulo: string; porRede: Record<string, number> }> }) {
  const redes = [...new Set(semanas.flatMap((s) => Object.keys(s.porRede)))];
  const maximo = Math.max(1, ...semanas.map((s) => Object.values(s.porRede).reduce((a, b) => a + b, 0)));
  // Uma escala "redonda" para as três linhas de grade nomearem valores reais.
  const passo = Math.max(1, Math.ceil(maximo / 3));
  const teto = passo * 3;
  // `topo` deixa lugar para o total escrito em cima da barra mais alta.
  const L = 560, A = 210, esq = 30, base = 26, topo = 20;
  const larg = L - esq - 8, alt = A - base - topo;
  const colW = larg / semanas.length;
  const barW = Math.min(34, colW * 0.62);
  const y = (v: number) => topo + alt - (v / teto) * alt;

  return (
    <div>
      <svg viewBox={`0 0 ${L} ${A}`} width="100%" role="img" aria-label="Posts publicados por semana, nas últimas 8 semanas">
        {[0, passo, passo * 2, teto].map((v) => (
          <g key={v}>
            <line x1={esq} x2={L - 8} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
            <text x={esq - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10} fill="var(--text-muted)">{v}</text>
          </g>
        ))}
        {semanas.map((s, i) => {
          const x = esq + i * colW + (colW - barW) / 2;
          let acumulado = 0;
          const total = Object.values(s.porRede).reduce((a, b) => a + b, 0);
          return (
            <g key={s.rotulo}>
              {redes.map((r) => {
                const v = s.porRede[r] ?? 0;
                if (!v) return null;
                const y1 = y(acumulado + v);
                const h = y(acumulado) - y1;
                acumulado += v;
                return (
                  <rect key={r} x={x} y={y1} width={barW} height={Math.max(1, h)} rx={2} fill={COR_DA_REDE[r] ?? "var(--grafico-3)"}>
                    <title>{`${nomeDaRede(r)}: ${v} post${v === 1 ? "" : "s"} na semana até ${s.rotulo}`}</title>
                  </rect>
                );
              })}
              {total > 0 && (
                <text x={x + barW / 2} y={y(total) - 4} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--text-primary)">{total}</text>
              )}
              <text x={x + barW / 2} y={A - 8} textAnchor="middle" fontSize={10} fill="var(--text-muted)">{s.rotulo}</text>
            </g>
          );
        })}
      </svg>
      <Legenda redes={redes} />
    </div>
  );
}

/** Uma barra por rede: o valor principal e a nota ao lado. */
export function BarrasPorRede({
  linhas,
}: {
  linhas: Array<{ rede: string; valor: number; nota: string }>;
}) {
  const maximo = Math.max(1, ...linhas.map((l) => l.valor));
  return (
    <div className="space-y-2.5">
      {linhas.map((l) => (
        <div key={l.rede}>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{nomeDaRede(l.rede)}</span>
            <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
              <strong style={{ color: "var(--text-primary)" }}>{num(l.valor)}</strong> {l.nota}
            </span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--bg-input)" }}>
            {/* Degradê da cor da série, do meio-tom ao cheio (01/10). */}
            <div className="h-full rounded-full" style={{ width: `${(l.valor / maximo) * 100}%`, background: `linear-gradient(90deg, color-mix(in srgb, ${COR_DA_REDE[l.rede] ?? "var(--grafico-3)"} 55%, transparent), ${COR_DA_REDE[l.rede] ?? "var(--grafico-3)"})` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Legenda({ redes }: { redes: string[] }) {
  if (redes.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
      {redes.map((r) => (
        <span key={r} className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
          <span className="h-2 w-2 rounded-sm" style={{ background: COR_DA_REDE[r] ?? "var(--grafico-3)" }} />
          {nomeDaRede(r)}
        </span>
      ))}
    </div>
  );
}

/** A variação contra o período anterior, com a cor dizendo a direção. */
export function Variacao({ atual, anterior }: { atual: number; anterior: number }) {
  if (anterior === 0 && atual === 0) return <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>sem dados no período anterior</span>;
  if (anterior === 0) return <span className="text-[11px] font-semibold text-green-500">novo neste mês</span>;
  const p = ((atual - anterior) / anterior) * 100;
  const sobe = p >= 0;
  return (
    <span className={`text-[11px] font-semibold ${sobe ? "text-green-500" : "text-red-400"}`}>
      {sobe ? "▲" : "▼"} {num(Math.abs(p))}% <span className="font-normal" style={{ color: "var(--text-muted)" }}>vs. 30 dias antes</span>
    </span>
  );
}
