"use client";

import { useEffect, useId, useRef, useState } from "react";
import { acumular, numero, reais, soma, variacao, type Balde } from "@/lib/admin/tipos-do-painel";

/**
 * O PAINEL NO ESTILO DO STRIPE (06/10/2026).
 *
 * Pedido do Bruno: "quero um painel igual do Stripe, o funil precisa voltar
 * mas com os elementos gráficos melhores, mais acabados". O que o painel
 * inicial do Stripe faz, e estas peças copiam:
 *  - número grande, com a variação contra o período anterior ao lado
 *    ("+12,4%"), verde quando a mudança é boa e vermelha quando é ruim (custo
 *    subindo é ruim), sempre com o sinal escrito, nunca só a cor;
 *  - linha fina de 2 px com uma área bem clara por baixo, e o período
 *    anterior TRACEJADO, na mesma escala;
 *  - eixo discreto: só o zero e o teto, só a primeira e a última data;
 *  - balão ao passar o mouse (ou o dedo, ou as setas do teclado), com o dia de
 *    agora e o dia equivalente do período anterior;
 *  - cartão limpo, muito respiro, letra sóbria, e o clique leva ao detalhe.
 *
 * Cores: só os tokens do app (--painel-1 é a série principal; o anterior é o
 * --text-muted tracejado). Funciona nos dois temas porque os tokens mudam com
 * o tema. Uma escala só por gráfico, sempre.
 */

type Formato = "reais" | "numero";

const fmtValor = (v: number, formato: Formato, casas?: number) =>
  formato === "reais" ? reais(v, casas ?? (v !== 0 && Math.abs(v) < 1000 ? 2 : 0)) : numero(v);

// ─────────────────────────────────────────────────────────────────────────────
// A VARIAÇÃO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A pílula de variação. `subirEhBom` decide a cor: receita subindo é verde,
 * custo subindo é vermelho. Sem base no período anterior, escreve "novo".
 */
export function Variacao({ atual, anterior, subirEhBom = true }: { atual: number; anterior: number; subirEhBom?: boolean }) {
  const v = variacao(atual, anterior);
  if (v === null) {
    if (!atual) return <span className="text-xs" style={{ color: "var(--text-muted)" }}>sem movimento</span>;
    return (
      <span className="rounded-md px-1.5 py-0.5 text-xs font-semibold" style={{ background: "var(--realce-2)", color: "var(--text-primary)" }}>
        novo
      </span>
    );
  }
  const arred = Math.round(v * 1000) / 10;
  if (arred === 0) {
    return (
      <span className="rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums" style={{ background: "var(--realce-2)", color: "var(--text-muted)" }}>
        0%
      </span>
    );
  }
  const bom = arred > 0 === subirEhBom;
  return (
    <span
      className="rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums whitespace-nowrap"
      style={{
        background: bom ? "var(--badge-success-bg)" : "var(--badge-danger-bg)",
        color: bom ? "var(--badge-success-text)" : "var(--badge-danger-text)",
      }}
    >
      {arred > 0 ? "+" : "−"}
      {Math.abs(arred).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// O CARTÃO DE INDICADOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Abre a dobra de detalhe e rola até ela. `<details>` não abre pelo endereço
 * sozinho; o clique no cartão faz isso, e o link continua funcionando sem
 * JavaScript (rola até a dobra fechada).
 */
function abrirDobra(id: string) {
  const el = document.getElementById(id);
  if (el instanceof HTMLDetailsElement) el.open = true;
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Abre a dobra cujo id está no endereço (#custo), ao entrar e ao trocar. */
export function AbreDobraPeloEndereco() {
  useEffect(() => {
    const abrir = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (id) abrirDobra(id);
    };
    abrir();
    window.addEventListener("hashchange", abrir);
    return () => window.removeEventListener("hashchange", abrir);
  }, []);
  return null;
}

export function Indicador({
  rotulo,
  valor,
  atual,
  anterior,
  serie,
  serieAnterior,
  subirEhBom = true,
  nota,
  detalhe,
  dobra,
  acumulado = false,
  destaque = false,
}: {
  rotulo: string;
  valor: string;
  /** Total do período, para a variação. */
  atual: number;
  /** Total do período anterior, para a variação. Sem ele, o número é foto de hoje e não compara. */
  anterior?: number;
  serie?: number[];
  serieAnterior?: number[];
  subirEhBom?: boolean;
  nota?: React.ReactNode;
  detalhe?: React.ReactNode;
  /** O id da dobra de detalhe: o cartão inteiro vira o caminho até ela. */
  dobra?: string;
  acumulado?: boolean;
  destaque?: boolean;
}) {
  const corpo = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium" style={{ color: "var(--text-muted)" }}>
          {rotulo}
        </p>
        {anterior !== undefined ? (
          <Variacao atual={atual} anterior={anterior} subirEhBom={subirEhBom} />
        ) : (
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            hoje
          </span>
        )}
      </div>
      <p className={`${destaque ? "text-[2rem]" : "text-[1.65rem]"} font-semibold leading-tight mt-1 tracking-tight`} style={{ color: "var(--text-primary)" }}>
        {valor}
      </p>
      {nota && (
        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
          {nota}
        </p>
      )}
      {serie && serie.length > 1 && (
        <MiniLinha serie={acumulado ? acumular(serie) : serie} anterior={serieAnterior ? (acumulado ? acumular(serieAnterior) : serieAnterior) : undefined} rotulo={rotulo} />
      )}
      {detalhe && <div className="mt-3">{detalhe}</div>}
    </>
  );
  const classe = "block rounded-2xl border p-5 min-w-0 transition-colors";
  const estilo = { borderColor: "var(--border)", background: "var(--bg-elevated)", boxShadow: "var(--shadow)" };
  if (!dobra) return <div className={classe} style={estilo}>{corpo}</div>;
  return (
    <a
      href={`#${dobra}`}
      onClick={(e) => {
        e.preventDefault();
        history.replaceState(null, "", `#${dobra}`);
        abrirDobra(dobra);
      }}
      className={`${classe} group hover:border-[var(--border-accent)] focus-visible:outline-2 focus-visible:outline-[var(--acento)]`}
      style={estilo}
      aria-label={`${rotulo}: ${valor}. Abrir o detalhe`}
    >
      {corpo}
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium opacity-70 group-hover:opacity-100" style={{ color: "var(--text-muted)" }}>
        Ver detalhe <span aria-hidden>→</span>
      </span>
    </a>
  );
}

/**
 * A linha pequena do cartão: o período atual sólido com a área clara, o
 * anterior tracejado por baixo, na mesma escala. Sem eixo: o número de cima
 * e a variação dizem quanto; a linha diz como foi o caminho.
 */
function MiniLinha({ serie, anterior, rotulo }: { serie: number[]; anterior?: number[]; rotulo: string }) {
  const id = useId().replace(/:/g, "");
  const W = 100, H = 36, P = 2;
  const max = Math.max(0, ...serie, ...(anterior ?? []));
  const n = serie.length;
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * W : W / 2);
  const y = (v: number) => (max > 0 ? H - P - (v / max) * (H - 2 * P) : H - P);
  const linha = (vs: number[]) => caminhoSuave(vs.map((v, i) => [x(i), y(v)]));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-3 block h-9 w-full" role="img" aria-label={`${rotulo} no período, com o período anterior tracejado`}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--painel-1)", stopOpacity: 0.16 }} />
          <stop offset="100%" style={{ stopColor: "var(--painel-1)", stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <line x1={0} x2={W} y1={H - P} y2={H - P} vectorEffect="non-scaling-stroke" strokeWidth={1} style={{ stroke: "var(--border)" }} />
      {anterior && anterior.some((v) => v > 0) && (
        <path d={linha(anterior)} fill="none" vectorEffect="non-scaling-stroke" strokeWidth={1.5} strokeDasharray="3 3" style={{ stroke: "var(--text-muted)", opacity: 0.6 }} />
      )}
      {max > 0 && <path d={`${linha(serie)} L ${x(n - 1)} ${H - P} L ${x(0)} ${H - P} Z`} style={{ fill: `url(#g${id})` }} />}
      <path d={linha(serie)} fill="none" vectorEffect="non-scaling-stroke" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" style={{ stroke: "var(--painel-1)" }} />
    </svg>
  );
}

/**
 * Curva monotônica (Fritsch e Carlson): suaviza sem inventar pico que não
 * existe e sem descer abaixo de zero entre dois dias.
 */
function caminhoSuave(p: Array<[number, number]>): string {
  if (p.length === 0) return "";
  if (p.length < 3) return p.map(([a, b], i) => `${i ? "L" : "M"} ${a} ${b}`).join(" ");
  const n = p.length;
  const dx: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(p[i + 1][0] - p[i][0]);
    m.push((p[i + 1][1] - p[i][1]) / (dx[i] || 1));
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      t[i] = k * a * m[i];
      t[i + 1] = k * b * m[i];
    }
  }
  let d = `M ${p[0][0]} ${p[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C ${p[i][0] + h} ${p[i][1] + t[i] * h} ${p[i + 1][0] - h} ${p[i + 1][1] - t[i + 1] * h} ${p[i + 1][0]} ${p[i + 1][1]}`;
  }
  return d;
}

// ─────────────────────────────────────────────────────────────────────────────
// O GRÁFICO GRANDE, COM O PERÍODO ANTERIOR TRACEJADO
// ─────────────────────────────────────────────────────────────────────────────

function tetoRedondo(max: number): number {
  if (max <= 0) return 1;
  const ordem = Math.pow(10, Math.floor(Math.log10(max)));
  const passo = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((k) => k * ordem).find((v) => v >= max);
  return passo ?? 10 * ordem;
}

export function GraficoComparado({
  titulo,
  atual,
  anterior,
  baldes,
  baldesAnteriores,
  rotuloAnterior,
  formato = "numero",
  acumulado = false,
  subirEhBom = true,
  altura = 200,
  partes,
  dobra,
  nota,
  cor = "var(--painel-1)",
  nomeDaLinha,
}: {
  titulo: string;
  atual: number[];
  anterior: number[];
  baldes: Balde[];
  baldesAnteriores: Balde[];
  rotuloAnterior: string;
  formato?: Formato;
  /** Soma corrida: o número de cada dia é o total até ele, como no Stripe. */
  acumulado?: boolean;
  subirEhBom?: boolean;
  altura?: number;
  /** Uma divisão do atual, desenhada como segunda linha sólida (ex.: a parte de cliente). */
  partes?: { nome: string; valores: number[]; cor: string; nomeDoResto: string };
  dobra?: string;
  nota?: React.ReactNode;
  /** A cor da linha principal; o padrão é a série principal do painel. */
  cor?: string;
  /** O nome da linha principal na legenda. */
  nomeDaLinha?: string;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState<number | null>(null);
  const [foco, setFoco] = useState<number | null>(null);
  const gid = useId().replace(/:/g, "");

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => setLargura(el.clientWidth);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const pa = acumulado ? acumular(atual) : atual;
  const pb = acumulado ? acumular(anterior) : anterior;
  const pp = partes ? (acumulado ? acumular(partes.valores) : partes.valores) : null;
  const totalAtual = soma(atual);
  const totalAnterior = soma(anterior);
  const n = pa.length;
  const teto = tetoRedondo(Math.max(0, ...pa, ...pb));

  const L = largura ?? 0;
  const esq = 4, dir = 4, topo = 8, base = 22;
  const larg = Math.max(0, L - esq - dir);
  const alt = altura - topo - base;
  const x = (i: number) => esq + (n > 1 ? (i / (n - 1)) * larg : larg / 2);
  const y = (v: number) => topo + alt - (v / teto) * alt;
  const pts = (vs: number[]) => vs.map((v, i) => [x(i), y(v)] as [number, number]);

  const indicePeloX = (clientX: number) => {
    const r = caixa.current?.getBoundingClientRect();
    if (!r || n < 1 || larg <= 0) return null;
    const rel = (clientX - r.left - esq) / larg;
    return Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1))));
  };

  const f = (v: number) => fmtValor(v, formato);
  const temAnterior = pb.some((v) => v > 0);
  // Sem nada nos dois períodos, a área fica vazia com a frase, e não com um
  // teto inventado ("R$ 1") em cima de uma linha no zero.
  const semDado = !temAnterior && !pa.some((v) => v !== 0);

  return (
    <section className="rounded-2xl border p-5 min-w-0" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)", boxShadow: "var(--shadow)" }}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[13px] font-medium" style={{ color: "var(--text-muted)" }}>
              {titulo}
            </h2>
            <Variacao atual={totalAtual} anterior={totalAnterior} subirEhBom={subirEhBom} />
          </div>
          <p className="text-[1.65rem] font-semibold leading-tight tracking-tight mt-0.5" style={{ color: "var(--text-primary)" }}>
            {f(totalAtual)}
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {f(totalAnterior)} no período anterior ({rotuloAnterior})
          </p>
        </div>
        {dobra && (
          <a
            href={`#${dobra}`}
            onClick={(e) => {
              e.preventDefault();
              history.replaceState(null, "", `#${dobra}`);
              abrirDobra(dobra);
            }}
            className="text-xs font-medium rounded-lg px-2 py-1 hover:bg-[var(--realce-2)]"
            style={{ color: "var(--text-muted)" }}
          >
            Ver detalhe →
          </a>
        )}
      </div>

      {/* A legenda: linha sólida é agora, tracejada é o período anterior. */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-muted)" }}>
        <span className="flex items-center gap-1.5">
          <span className="h-[2px] w-4 rounded-full" style={{ background: cor }} />
          {nomeDaLinha ?? (partes ? "Total" : "Este período")}
        </span>
        {partes && (
          <span className="flex items-center gap-1.5">
            <span className="h-[2px] w-4 rounded-full" style={{ background: partes.cor }} />
            {partes.nome}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed" style={{ borderColor: "var(--text-muted)" }} />
          Período anterior
        </span>
      </div>

      <div
        ref={caixa}
        className="relative mt-2 outline-none rounded-lg focus-visible:ring-2 focus-visible:ring-[var(--acento)]"
        style={{ height: altura }}
        tabIndex={0}
        role="img"
        aria-label={`${titulo}: ${f(totalAtual)} no período, contra ${f(totalAnterior)} no período anterior`}
        onPointerMove={(e) => setFoco(indicePeloX(e.clientX))}
        onPointerDown={(e) => setFoco(indicePeloX(e.clientX))}
        onPointerLeave={() => setFoco(null)}
        onBlur={() => setFoco(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") setFoco((v) => Math.min(n - 1, (v ?? -1) + 1));
          else if (e.key === "ArrowLeft") setFoco((v) => Math.max(0, (v ?? n) - 1));
          else if (e.key === "Escape") setFoco(null);
          else return;
          e.preventDefault();
        }}
      >
        {largura !== null && larg > 0 && (
          <svg width={L} height={altura} className="block select-none" aria-hidden>
            <defs>
              <linearGradient id={`a${gid}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" style={{ stopColor: cor, stopOpacity: 0.14 }} />
                <stop offset="100%" style={{ stopColor: cor, stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            {/* O eixo discreto: o teto em cima, o zero embaixo, nada no meio. */}
            <line x1={esq} x2={L - dir} y1={y(teto)} y2={y(teto)} strokeWidth={1} style={{ stroke: "var(--border)" }} />
            <line x1={esq} x2={L - dir} y1={y(0)} y2={y(0)} strokeWidth={1} style={{ stroke: "var(--border)" }} />
            {!semDado && (
              <text x={esq} y={y(teto) + 13} fontSize={11} style={{ fill: "var(--text-muted)" }}>
                {fmtValor(teto, formato, 0)}
              </text>
            )}
            <text x={esq} y={altura - 5} fontSize={11} style={{ fill: "var(--text-muted)" }}>
              {baldes[0]?.rotulo}
            </text>
            <text x={L - dir} y={altura - 5} textAnchor="end" fontSize={11} style={{ fill: "var(--text-muted)" }}>
              {baldes[n - 1]?.rotulo}
            </text>

            {temAnterior && (
              <path d={caminhoSuave(pts(pb))} fill="none" strokeWidth={1.5} strokeDasharray="4 4" style={{ stroke: "var(--text-muted)", opacity: 0.55 }} />
            )}
            <path d={`${caminhoSuave(pts(pa))} L ${x(n - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`} style={{ fill: `url(#a${gid})` }} />
            {pp && <path d={caminhoSuave(pts(pp))} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" style={{ stroke: partes!.cor }} />}
            <path d={caminhoSuave(pts(pa))} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" style={{ stroke: cor }} />

            {foco !== null && (
              <>
                <line x1={x(foco)} x2={x(foco)} y1={topo} y2={topo + alt} strokeWidth={1} style={{ stroke: "var(--text-muted)", opacity: 0.5 }} />
                {temAnterior && <circle cx={x(foco)} cy={y(pb[foco])} r={3.5} strokeWidth={2} style={{ fill: "var(--text-muted)", stroke: "var(--bg-elevated)" }} />}
                {pp && <circle cx={x(foco)} cy={y(pp[foco])} r={4} strokeWidth={2} style={{ fill: partes!.cor, stroke: "var(--bg-elevated)" }} />}
                <circle cx={x(foco)} cy={y(pa[foco])} r={4.5} strokeWidth={2} style={{ fill: cor, stroke: "var(--bg-elevated)" }} />
              </>
            )}
          </svg>
        )}

        {semDado && largura !== null && (
          <p className="pointer-events-none absolute inset-x-0 text-center text-xs" style={{ top: altura / 2 - 18, color: "var(--text-muted)" }}>
            Nada neste período nem no anterior.
          </p>
        )}

        {foco !== null && largura !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 min-w-[11rem] rounded-lg border px-3 py-2 text-xs shadow-lg"
            style={{
              left: x(foco) > L / 2 ? undefined : x(foco) + 12,
              right: x(foco) > L / 2 ? L - x(foco) + 12 : undefined,
              background: "var(--bg-elevated)",
              borderColor: "var(--border)",
            }}
          >
            <LinhaDoBalao cor={cor} nome={baldes[foco]?.dica ?? ""} valor={f(pa[foco])} />
            {pp && <LinhaDoBalao cor={partes!.cor} nome={partes!.nome} valor={f(pp[foco])} />}
            {pp && <LinhaDoBalao cor={null} nome={partes!.nomeDoResto} valor={f(pa[foco] - pp[foco])} />}
            <LinhaDoBalao cor="var(--text-muted)" tracejado nome={baldesAnteriores[foco]?.dica ?? "anterior"} valor={f(pb[foco] ?? 0)} />
            {acumulado && (
              <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                Soma desde o primeiro dia do período.
              </p>
            )}
          </div>
        )}
      </div>

      {nota && (
        <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
          {nota}
        </p>
      )}

      <details className="mt-2 text-xs">
        <summary className="cursor-pointer select-none" style={{ color: "var(--text-muted)" }}>
          Ver os números em tabela
        </summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full tabular-nums">
            <thead>
              <tr style={{ background: "var(--bg-input)" }}>
                {["Dia", "Este período", ...(partes ? [partes.nome] : []), "Dia anterior", "Período anterior"].map((h) => (
                  <th key={h} className="px-2 py-1 text-left font-medium" style={{ color: "var(--text-muted)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {baldes.map((b, i) => (
                <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-2 py-1" style={{ color: "var(--text-muted)" }}>{b.dica}</td>
                  <td className="px-2 py-1" style={{ color: "var(--text-primary)" }}>{f(atual[i])}</td>
                  {partes && <td className="px-2 py-1" style={{ color: "var(--text-primary)" }}>{f(partes.valores[i])}</td>}
                  <td className="px-2 py-1" style={{ color: "var(--text-muted)" }}>{baldesAnteriores[i]?.dica}</td>
                  <td className="px-2 py-1" style={{ color: "var(--text-primary)" }}>{f(anterior[i] ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function LinhaDoBalao({ cor, nome, valor, tracejado = false }: { cor: string | null; nome: string; valor: string; tracejado?: boolean }) {
  return (
    <p className="flex items-center justify-between gap-4 leading-5">
      <span className="flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
        {cor ? (
          tracejado ? (
            <span className="w-3 border-t-2 border-dashed" style={{ borderColor: cor }} />
          ) : (
            <span className="h-[2px] w-3 rounded-full" style={{ background: cor }} />
          )
        ) : (
          <span className="w-3" />
        )}
        {nome.charAt(0).toUpperCase() + nome.slice(1)}
      </span>
      <strong className="tabular-nums" style={{ color: "var(--text-primary)" }}>
        {valor}
      </strong>
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// O FUNIL, DE VOLTA (06/10)
// ─────────────────────────────────────────────────────────────────────────────

export type EtapaDoFunil = {
  chave: string;
  nome: string;
  explica: string;
  pessoas: number;
  anterior: number;
};

/**
 * O FUNIL NO ESTILO DO STRIPE. Saiu da vista em 05/10, à noite, quando o
 * painel virou executivo e tudo o que não era um dos seis números foi para
 * dobras fechadas (commit e05fadb); o Bruno pediu de volta em 06/10, mais
 * acabado.
 *
 * Cada etapa é uma barra na MESMA escala (a primeira etapa é a largura
 * inteira): a parte cheia é quem chegou, a parte clara logo depois é quem
 * caiu desde a etapa anterior, e o resto é trilho. A queda fica visível sem
 * truque de escala; o número exato está sempre escrito. Entre as etapas vai a
 * conversão, com a do período anterior ao lado, e a etapa que mais perde
 * gente ganha o aviso.
 */
export function FunilComparado({ etapas, rotuloAnterior }: { etapas: EtapaDoFunil[]; rotuloAnterior: string }) {
  const topo = Math.max(1, etapas[0]?.pessoas ?? 0, ...etapas.map((e) => e.pessoas));
  const conv = (de: number, para: number) => (de > 0 ? para / de : null);
  const taxas = etapas.map((e, i) => (i === 0 ? null : conv(etapas[i - 1].pessoas, e.pessoas)));
  const taxasAntes = etapas.map((e, i) => (i === 0 ? null : conv(etapas[i - 1].anterior, e.anterior)));
  const candidatas = taxas.map((t, i) => ({ t, i })).filter((c): c is { t: number; i: number } => c.t !== null && c.t < 1);
  const pior = candidatas.length ? candidatas.reduce((a, b) => (b.t < a.t ? b : a)).i : -1;
  const pct = (t: number | null) => (t === null ? "sem base" : `${(Math.round(t * 1000) / 10).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
  const primeira = etapas[0];
  const ultima = etapas[etapas.length - 1];
  const total = primeira && ultima ? conv(primeira.pessoas, ultima.pessoas) : null;
  const totalAntes = primeira && ultima ? conv(primeira.anterior, ultima.anterior) : null;
  const vazio = etapas.every((e) => e.pessoas === 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium" style={{ color: "var(--text-muted)" }}>
            Conversão de ponta a ponta
          </p>
          <p className="text-[1.65rem] font-semibold leading-tight tracking-tight" style={{ color: "var(--text-primary)" }}>
            {pct(total)}
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            de {primeira?.nome.toLowerCase()} até {ultima?.nome.toLowerCase()} · antes {pct(totalAntes)} ({rotuloAnterior})
          </p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-muted)" }}>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: "var(--painel-1)" }} />
            Chegaram
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: "var(--painel-1)", opacity: 0.22 }} />
            Caíram desde a etapa anterior
          </span>
        </div>
      </div>

      <ol className="mt-5">
        {etapas.map((e, i) => {
          const cheio = e.pessoas / topo;
          const antes = i > 0 ? etapas[i - 1].pessoas : e.pessoas;
          const caiu = Math.max(0, antes - e.pessoas) / topo;
          const taxa = taxas[i];
          return (
            <li key={e.chave}>
              {i > 0 && (
                <div className="flex items-center gap-2 py-1.5 pl-1 text-xs">
                  <span aria-hidden className="h-4 w-px" style={{ background: "var(--border)" }} />
                  <span
                    className="rounded-md px-1.5 py-0.5 font-semibold tabular-nums"
                    style={{
                      background: i === pior ? "var(--badge-warning-bg)" : "var(--realce-2)",
                      color: i === pior ? "var(--badge-warning-text)" : "var(--text-primary)",
                    }}
                  >
                    {taxa !== null && taxa > 1 ? "entraram sem passar pela anterior" : `${pct(taxa)} seguiram`}
                  </span>
                  <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {antes > e.pessoas ? `${numero(antes - e.pessoas)} ficaram · ` : ""}antes {pct(taxasAntes[i])}
                    {i === pior ? " · onde mais perde gente" : ""}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-[13rem_minmax(0,1fr)_7.5rem] items-center gap-x-4 gap-y-1.5 rounded-xl px-1 py-1 transition-colors hover:bg-[var(--realce-1)]">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                    {e.nome}
                  </p>
                  <p className="text-[11px] leading-tight truncate" style={{ color: "var(--text-muted)" }}>
                    {e.explica}
                  </p>
                </div>
                <div
                  className="relative h-7 w-full overflow-hidden rounded-md"
                  style={{ background: "var(--bg-input)" }}
                  title={`${e.nome}: ${numero(e.pessoas)} pessoas; período anterior ${numero(e.anterior)}`}
                >
                  {!vazio && (
                    <div className="absolute inset-y-0 left-0 flex gap-[2px]" style={{ width: `${Math.min(1, cheio + caiu) * 100}%` }}>
                      {e.pessoas > 0 && (
                        <div className="h-full rounded-md" style={{ flexGrow: cheio, flexBasis: 0, minWidth: 4, background: "var(--painel-1)" }} />
                      )}
                      {caiu > 0 && <div className="h-full rounded-md" style={{ flexGrow: caiu, flexBasis: 0, background: "var(--painel-1)", opacity: 0.22 }} />}
                    </div>
                  )}
                </div>
                <div className="flex items-baseline justify-between gap-2 sm:block sm:text-right">
                  <p className="text-lg font-semibold leading-tight tabular-nums" style={{ color: "var(--text-primary)" }}>
                    {numero(e.pessoas)}
                  </p>
                  <p className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                    antes {numero(e.anterior)} <Variacao atual={e.pessoas} anterior={e.anterior} />
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {vazio && (
        <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
          Nada passou pelo funil neste período. Cada visita, cadastro confirmado, abertura de pagamento, assinatura e primeira campanha entra aqui, com a conversão entre uma etapa e a seguinte.
        </p>
      )}
    </div>
  );
}
