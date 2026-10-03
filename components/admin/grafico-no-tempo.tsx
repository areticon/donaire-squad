"use client";

import { useEffect, useRef, useState } from "react";
import { acumular, numero, reais, soma, type DadosNoTempo } from "@/lib/admin/tipos-do-painel";

/**
 * O GRÁFICO NO TEMPO DO PAINEL (01/10): linhas ou barras empilhadas, com
 * balão ao passar o mouse (ou o dedo, ou as setas do teclado).
 *
 * Por que componente de cliente, se a tela inicial desenha SVG no servidor:
 * aqui o SVG é desenhado na LARGURA REAL da caixa, medida no navegador. Um
 * viewBox fixo de 560 encolhido para os 358 px do celular deixava a letra do
 * eixo com 6 px; medido, a letra fica com 11 px em qualquer tela. E o balão de
 * cada dia precisa de estado. Recebe só dado puro (lib/admin/tipos-do-painel,
 * sem banco): nunca importa nada que toque o banco.
 *
 * Uma escala só no eixo vertical, sempre: duas grandezas de tamanhos
 * diferentes viram dois gráficos, nunca dois eixos.
 */

type Props = {
  dados: DadosNoTempo;
  modo: "linhas" | "barras";
  /** Soma corrida: o dia 3 mostra dia 1 + dia 2 + dia 3. */
  acumulado?: boolean;
  formato?: "numero" | "reais";
  altura?: number;
  /** O que o gráfico mostra, para leitor de tela. */
  rotulo: string;
  /** Uma linha a mais no balão: a diferença entre duas séries (a margem). */
  diferenca?: { nome: string; de: string; menos: string };
};

/** Teto "redondo" para as linhas de grade nomearem valores inteiros. */
function tetoRedondo(max: number): { teto: number; passo: number } {
  if (max <= 0) return { teto: 4, passo: 1 };
  const bruto = max / 4;
  const ordem = Math.pow(10, Math.floor(Math.log10(bruto)));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * ordem).find((p) => p >= bruto) ?? 10 * ordem;
  const passoFinal = max < 4 ? 1 : passo;
  return { teto: Math.ceil(max / passoFinal) * passoFinal, passo: passoFinal };
}

export function GraficoNoTempo({ dados, modo, acumulado = false, formato = "numero", altura = 220, rotulo, diferenca }: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState<number | null>(null);
  const [foco, setFoco] = useState<number | null>(null);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => setLargura(el.clientWidth);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const fmt = (v: number) => (formato === "reais" ? reais(v, v !== 0 && Math.abs(v) < 100 ? 2 : 0) : numero(v));
  const fmtEixo = (v: number) => (formato === "reais" ? reais(v) : numero(v));
  const { baldes } = dados;
  const series = dados.series.map((s) => ({ ...s, pontos: acumulado ? acumular(s.valores) : s.valores }));
  const n = baldes.length;

  const maximo =
    modo === "barras"
      ? Math.max(0, ...baldes.map((_, i) => series.reduce((t, s) => t + s.pontos[i], 0)))
      : Math.max(0, ...series.flatMap((s) => s.pontos));
  const { teto, passo } = tetoRedondo(maximo);

  // A margem esquerda cabe o maior rótulo do eixo (reais é mais largo).
  const esq = Math.max(28, fmtEixo(teto).length * 6.6 + 8);
  const dir = 10, topo = 10, base = 24;
  const L = largura ?? 0;
  const larg = Math.max(0, L - esq - dir);
  const alt = altura - topo - base;
  const colW = n ? larg / n : 0;
  const x = (i: number) => esq + colW * i + colW / 2;
  const y = (v: number) => topo + alt - (v / teto) * alt;

  // Rótulos do eixo de baixo: um a cada ~48 px, e o último sempre.
  const cabem = Math.max(2, Math.floor(larg / 48));
  const saltoX = Math.max(1, Math.ceil(n / cabem));
  const mostraRotulo = (i: number) => i === n - 1 || (i % saltoX === 0 && n - 1 - i >= saltoX * 0.6);

  const indicePeloX = (clientX: number) => {
    const r = caixa.current?.getBoundingClientRect();
    if (!r || !colW) return null;
    const i = Math.floor((clientX - r.left - esq) / colW);
    return i >= 0 && i < n ? i : null;
  };

  const barW = Math.max(2, Math.min(28, colW * 0.62));
  const GAP = 2; // o respiro de superfície entre segmentos empilhados

  return (
    <div>
      {/* Legenda sempre presente com duas séries ou mais, com o total ao lado:
          a cor nunca é a única pista de qual linha é qual. */}
      {series.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
          {series.map((s) => (
            <span key={s.chave} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
              <span
                className={modo === "linhas" ? "h-[3px] w-3.5 rounded-full" : "h-2.5 w-2.5 rounded-[3px]"}
                style={{ background: s.cor }}
              />
              {s.nome}
              <strong className="tabular-nums" style={{ color: "var(--text-primary)" }}>
                {fmt(acumulado ? s.pontos[n - 1] ?? 0 : soma(s.valores))}
              </strong>
            </span>
          ))}
        </div>
      )}

      <div
        ref={caixa}
        className="relative outline-none focus-visible:ring-2 focus-visible:ring-[var(--acento)] rounded-lg"
        style={{ height: altura }}
        tabIndex={0}
        role="img"
        aria-label={rotulo}
        onPointerMove={(e) => setFoco(indicePeloX(e.clientX))}
        onPointerDown={(e) => setFoco(indicePeloX(e.clientX))}
        onPointerLeave={() => setFoco(null)}
        onBlur={() => setFoco(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") setFoco((f) => Math.min(n - 1, (f ?? -1) + 1));
          else if (e.key === "ArrowLeft") setFoco((f) => Math.max(0, (f ?? n) - 1));
          else if (e.key === "Escape") setFoco(null);
          else return;
          e.preventDefault();
        }}
      >
        {largura !== null && larg > 0 && (
          <svg width={L} height={altura} className="block select-none" aria-hidden>
            {/* Grade recessiva: fina, na cor da borda, atrás de tudo. */}
            {Array.from({ length: Math.round(teto / passo) + 1 }, (_, k) => k * passo).map((v) => (
              <g key={v}>
                <line x1={esq} x2={L - dir} y1={y(v)} y2={y(v)} style={{ stroke: "var(--border)" }} strokeWidth={1} />
                <text x={esq - 6} y={y(v) + 3.5} textAnchor="end" fontSize={11} style={{ fill: "var(--text-muted)" }}>
                  {fmtEixo(v)}
                </text>
              </g>
            ))}

            {baldes.map((b, i) =>
              mostraRotulo(i) ? (
                <text key={b.rotulo + i} x={x(i)} y={altura - 6} textAnchor="middle" fontSize={11} style={{ fill: "var(--text-muted)" }}>
                  {b.rotulo}
                </text>
              ) : null
            )}

            {/* O dia em foco: uma faixa clara atrás, a linha de mira por cima. */}
            {foco !== null && (
              <rect x={esq + colW * foco} y={topo} width={colW} height={alt} style={{ fill: "var(--realce-2)" }} />
            )}

            {modo === "barras" &&
              baldes.map((_, i) => {
                let acima = 0;
                return (
                  <g key={i}>
                    {series.map((s) => {
                      const v = s.pontos[i];
                      if (!v) return null;
                      const y1 = y(acima + v);
                      const h = y(acima) - y1;
                      const comGap = acima > 0 ? GAP : 0;
                      acima += v;
                      return (
                        <rect
                          key={s.chave}
                          x={x(i) - barW / 2}
                          y={y1}
                          width={barW}
                          height={Math.max(1.5, h - comGap)}
                          rx={Math.min(3, barW / 4)}
                          style={{ fill: s.cor }}
                        />
                      );
                    })}
                  </g>
                );
              })}

            {modo === "linhas" &&
              series.map((s) => (
                <g key={s.chave}>
                  <polyline
                    points={s.pontos.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
                    fill="none"
                    style={{ stroke: s.cor }}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {foco !== null && (
                    <circle
                      cx={x(foco)}
                      cy={y(s.pontos[foco])}
                      r={4.5}
                      strokeWidth={2}
                      style={{ fill: s.cor, stroke: "var(--bg-elevated)" }}
                    />
                  )}
                </g>
              ))}

            {foco !== null && modo === "linhas" && (
              <line x1={x(foco)} x2={x(foco)} y1={topo} y2={topo + alt} strokeDasharray="3 3" style={{ stroke: "var(--text-muted)" }} />
            )}
          </svg>
        )}

        {foco !== null && largura !== null && (
          <Balao
            x={x(foco)}
            largura={L}
            titulo={baldes[foco].dica}
            linhas={[
              ...series.map((s) => ({ cor: s.cor, nome: s.nome, valor: fmt(s.pontos[foco]) })),
              ...(modo === "barras" && series.length > 1
                ? [{ cor: null, nome: "Total", valor: fmt(series.reduce((t, s) => t + s.pontos[foco], 0)) }]
                : []),
              ...(diferenca
                ? (() => {
                    const de = series.find((s) => s.chave === diferenca.de)?.pontos[foco] ?? 0;
                    const menos = series.find((s) => s.chave === diferenca.menos)?.pontos[foco] ?? 0;
                    return [{ cor: null, nome: diferenca.nome, valor: fmt(de - menos) }];
                  })()
                : []),
            ]}
          />
        )}
      </div>

      {/* A tabela é a saída para quem não lê cor, para leitor de tela e para
          quem quer o número exato de um dia sem caçar com o mouse. */}
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer select-none" style={{ color: "var(--text-muted)" }}>
          Ver os números em tabela
        </summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full tabular-nums">
            <thead>
              <tr style={{ background: "var(--bg-input)" }}>
                <th className="px-2 py-1 text-left font-medium" style={{ color: "var(--text-muted)" }}>
                  {dados.baldes.length > 31 || dados.baldes[0]?.dica.startsWith("semana") ? "Semana" : "Dia"}
                </th>
                {series.map((s) => (
                  <th key={s.chave} className="px-2 py-1 text-right font-medium" style={{ color: "var(--text-muted)" }}>
                    {s.nome}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {baldes.map((b, i) => (
                <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-2 py-1" style={{ color: "var(--text-muted)" }}>{b.dica}</td>
                  {series.map((s) => (
                    <td key={s.chave} className="px-2 py-1 text-right" style={{ color: "var(--text-primary)" }}>
                      {fmt(s.pontos[i])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function Balao({
  x,
  largura,
  titulo,
  linhas,
}: {
  x: number;
  largura: number;
  titulo: string;
  linhas: Array<{ cor: string | null; nome: string; valor: string }>;
}) {
  // O balão foge da borda: na metade direita ele abre para a esquerda.
  const direita = x > largura / 2;
  return (
    <div
      className="pointer-events-none absolute top-1 z-10 min-w-[10rem] rounded-lg border px-3 py-2 text-xs shadow-lg"
      style={{
        left: direita ? undefined : x + 12,
        right: direita ? largura - x + 12 : undefined,
        background: "var(--bg-elevated)",
        borderColor: "var(--border)",
      }}
    >
      <p className="mb-1 font-semibold capitalize" style={{ color: "var(--text-primary)" }}>
        {titulo}
      </p>
      {linhas.map((l) => (
        <p key={l.nome} className="flex items-center justify-between gap-3 leading-5">
          <span className="flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
            {l.cor ? <span className="h-2 w-2 rounded-sm" style={{ background: l.cor }} /> : <span className="w-2" />}
            {l.nome}
          </span>
          <strong className="tabular-nums" style={{ color: "var(--text-primary)" }}>
            {l.valor}
          </strong>
        </p>
      ))}
    </div>
  );
}
