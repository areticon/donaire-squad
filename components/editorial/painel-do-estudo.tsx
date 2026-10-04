"use client";

import { useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { Check, ChevronDown, ExternalLink, ImageOff, Loader2, Plus, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { BarraDivergente } from "@/components/editorial/graficos-das-referencias";
import { numeroCurto, vezesCurto, valorDaLinha, type NumeroDoTopo, type Recomendacao } from "@/lib/referencias/painel-executivo";
import type { BarraDoPainel, ExemploDoAchado } from "@/lib/referencias/tipos-das-analises";
import type { FatiaDoPerfil, LinhaDoDePara } from "@/lib/referencias/tipos-do-perfil-proprio";

/**
 * AS PEÇAS DO PAINEL EXECUTIVO DO ESTUDO DE PERFIS (03/10/2026).
 *
 * Pedido do Bruno: "muita informação misturada e confusa, precisa ser gráfico
 * e executivo". Três andares, nas três telas que mostram o estudo (o seu
 * perfil e as referências na jornada de entrada, e a linha editorial):
 *
 *   1. os NÚMEROS grandes do topo, cada um com uma frase de uma linha;
 *   2. os GRÁFICOS no lugar do texto (você contra as referências, mix de
 *      formatos, ritmo, o que rende, paleta, o post de maior engajamento);
 *   3. O QUE FAZER: até 3 ações, cada uma com o dado e o botão;
 *
 * e os detalhes (achados, legendas, tabelas) recolhidos em "ver detalhes".
 *
 * Mesma linguagem do painel das referências: HTML e CSS, sem biblioteca, as
 * cores --painel-* validadas nos dois temas, o número sempre escrito ao lado
 * da marca. VOCÊ é azul (--painel-3), REFERÊNCIAS é laranja (--painel-2); o
 * rótulo também diz o lado, para não depender só de cor.
 */

export const COR_VOCE = "var(--painel-3)";
export const COR_REFS = "var(--painel-2)";
/**
 * As cores das fatias do mix, na ordem: as mesmas nos dois lados para o mesmo
 * formato. Fora do azul e do laranja, que aqui já querem dizer você e as
 * referências. Cada cor com o texto que contrasta nos dois temas.
 */
const CORES_DO_MIX: Array<{ fundo: string; texto: string }> = [
  { fundo: "var(--painel-1)", texto: "var(--bg-elevated)" },
  { fundo: "var(--painel-5)", texto: "var(--bg-elevated)" },
  { fundo: "var(--painel-4)", texto: "#0a1f3b" },
  { fundo: "var(--painel-neutro)", texto: "var(--text-primary)" },
  { fundo: "var(--painel-3)", texto: "#fff" },
  { fundo: "var(--painel-2)", texto: "#fff" },
];
/** Quantos dobros até a ponta nas barras de "rende Nx" do painel: 4x. */
const DOBROS_DO_PAINEL = 2;

// ── Andar 1: os números do topo ──

export function NumerosDoTopo({ numeros }: { numeros: NumeroDoTopo[] }) {
  if (!numeros.length) return null;
  return (
    <div className={cn("grid grid-cols-1 gap-2 min-[360px]:grid-cols-2", numeros.length >= 4 ? "lg:grid-cols-4" : numeros.length === 3 ? "lg:grid-cols-3" : "")}>
      {numeros.map((n) => (
        <div
          key={n.chave}
          className="relative min-w-0 overflow-hidden rounded-2xl border p-3 pt-3.5 sm:p-4"
          style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}
        >
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-1"
            style={{ background: n.tom === "acao" ? COR_REFS : n.tom === "bom" ? COR_VOCE : "var(--painel-neutro)" }}
          />
          <p className="text-[11px] font-semibold uppercase leading-tight tracking-wide" style={{ color: "var(--text-muted)" }}>
            {n.rotulo}
          </p>
          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <span
              className={cn("min-w-0 break-words font-extrabold leading-none tabular-nums", n.valor.length > 9 ? "text-xl sm:text-2xl" : "text-2xl sm:text-3xl")}
              style={{ color: "var(--text-primary)" }}
            >
              {n.valor}
            </span>
            {n.contra && (
              <span className="text-xs font-medium tabular-nums" style={{ color: "var(--text-muted)" }}>
                {n.contra}
              </span>
            )}
          </p>
          <p className="mt-1.5 text-xs leading-snug" style={{ color: "var(--text-primary)" }}>
            {n.frase}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Andar 2: os gráficos ──

/** O cartão de um gráfico: título, a pergunta em uma linha e o gráfico. */
export function Bloco({ titulo, pergunta, children, className = "", extra }: { titulo: string; pergunta?: string; children: ReactNode; className?: string; extra?: ReactNode }) {
  return (
    <section className={cn("min-w-0 rounded-2xl border p-3 sm:p-4", className)} style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
      <div className="mb-2.5 flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {titulo}
          </h3>
          {pergunta && (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {pergunta}
            </p>
          )}
        </div>
        {extra}
      </div>
      {children}
    </section>
  );
}

export function LegendaVoceReferencias({ rotuloRefs = "referências (a mediana dos perfis)" }: { rotuloRefs?: string }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-5 rounded-sm" style={{ background: COR_VOCE }} />
        você
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-5 rounded-sm" style={{ background: COR_REFS }} />
        {rotuloRefs}
      </span>
    </div>
  );
}

/** Uma medida, dois lados, na mesma escala. */
function ParDeBarras({ l }: { l: LinhaDoDePara }) {
  const escala = l.unidade === "%" ? 100 : Math.max(l.voce ?? 0, l.elas ?? 0, 0.1);
  const barra = (valor: number | null, cor: string, rotulo: string) => (
    <div className="grid grid-cols-[4.75rem_minmax(0,1fr)_3.75rem] items-center gap-2">
      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        {rotulo}
      </span>
      <span className="h-3 rounded-full" style={{ background: "var(--bg-input)" }}>
        <span className="block h-full rounded-full" style={{ width: `${valor === null ? 0 : Math.max(2, Math.min(100, (valor / escala) * 100))}%`, background: cor }} />
      </span>
      <span className="text-right text-xs font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
        {valorDaLinha(l, valor)}
      </span>
    </div>
  );
  return (
    <li className="space-y-1 py-2 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {l.medida}
        </span>
        {l.prioridade === "alta" && (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: "color-mix(in srgb, var(--painel-2) 22%, transparent)", color: "var(--text-primary)" }}>
            prioridade
          </span>
        )}
      </div>
      {barra(l.voce, COR_VOCE, "Você")}
      {barra(l.elas, COR_REFS, "Referências")}
    </li>
  );
}

/** Você contra as referências: as medidas de maior diferença, barras lado a lado. */
export function VoceContraReferencias({ linhas }: { linhas: LinhaDoDePara[] }) {
  if (!linhas.length) return null;
  return (
    <>
      <ul className="divide-y divide-[var(--border)]">
        {linhas.map((l) => (
          <ParDeBarras key={l.chave} l={l} />
        ))}
      </ul>
      <div className="mt-2.5">
        <LegendaVoceReferencias />
      </div>
    </>
  );
}

/** Uma barra empilhada de parte do todo (o mix de formatos de um lado). */
function BarraDoMix({ rotulo, fatias, cor }: { rotulo: string; fatias: FatiaDoPerfil[]; cor: (chave: string) => { fundo: string; texto: string } }) {
  return (
    <div className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-center gap-2">
      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        {rotulo}
      </span>
      <div className="flex h-7 overflow-hidden rounded-lg" style={{ background: "var(--bg-input)" }} role="img" aria-label={`${rotulo}: ${fatias.map((f) => `${f.nome} ${f.pct}%`).join(", ")}`}>
        {fatias.map((f) => (
          <span
            key={f.chave}
            title={`${f.nome}: ${f.pct}%`}
            className="flex h-full min-w-0 items-center justify-center overflow-hidden text-[11px] font-bold tabular-nums"
            style={{ width: `${f.pct}%`, background: cor(f.chave).fundo, color: cor(f.chave).texto, borderRight: "2px solid var(--bg-elevated)" }}
          >
            {f.pct >= 14 ? `${f.pct}%` : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * O MIX DE FORMATOS: uma barra empilhada por lado, a mesma cor para o mesmo
 * formato, e a legenda com a porcentagem e o rendimento ("rende 1,5x").
 */
export function MixDeFormatos({ voce, referencias }: { voce: FatiaDoPerfil[]; referencias?: FatiaDoPerfil[] | null }) {
  const ordem = [...new Set([...voce, ...(referencias ?? [])].sort((a, b) => b.pct - a.pct).map((f) => f.chave))];
  const cor = (k: string) => CORES_DO_MIX[Math.max(0, ordem.indexOf(k)) % CORES_DO_MIX.length];
  const nomes = new Map([...voce, ...(referencias ?? [])].map((f) => [f.chave, f.nome]));
  const seu = new Map(voce.map((f) => [f.chave, f]));
  const delas = new Map((referencias ?? []).map((f) => [f.chave, f]));
  return (
    <div className="space-y-2">
      <BarraDoMix rotulo="Você" fatias={voce} cor={cor} />
      {referencias && referencias.length > 0 && <BarraDoMix rotulo="Referências" fatias={referencias} cor={cor} />}
      <ul className="space-y-1 pt-1">
        {ordem.map((k) => {
          const s = seu.get(k);
          const d = delas.get(k);
          return (
            <li key={k} className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs" style={{ color: "var(--text-primary)" }}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: cor(k).fundo }} />
              <span className="min-w-[5.5rem] flex-1">{nomes.get(k)}</span>
              <span className="whitespace-nowrap tabular-nums" style={{ color: "var(--text-muted)" }}>
                {referencias ? (
                  <>
                    você <b style={{ color: "var(--text-primary)" }}>{s ? s.pct : 0}%</b>, referências <b style={{ color: "var(--text-primary)" }}>{d ? d.pct : 0}%</b>
                  </>
                ) : (
                  <b style={{ color: "var(--text-primary)" }}>{s ? s.pct : 0}%</b>
                )}
              </span>
              {s?.vezes !== null && s?.vezes !== undefined && s.posts >= 3 && (
                <span
                  className="whitespace-nowrap rounded px-1 py-0.5 text-[10px] font-bold"
                  style={{ background: s.vezes >= 1 ? "color-mix(in srgb, var(--painel-2) 18%, transparent)" : "var(--bg-input)", color: "var(--text-primary)" }}
                  title="Quanto rendeu contra os outros posts do seu perfil"
                >
                  rende {vezesCurto(s.vezes)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Barras simples, uma por perfil (ritmo, engajamento), o seu lado em azul. */
export function BarrasPorPerfil({ itens, formato }: { itens: Array<{ rotulo: string; valor: number | null; voce?: boolean; url?: string | null }>; formato: (n: number | null) => string }) {
  const max = Math.max(...itens.map((i) => i.valor ?? 0), 0.0001);
  return (
    <ul className="space-y-1.5">
      {itens.map((i, k) => (
        <li key={i.rotulo + k} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_3.75rem] items-center gap-2 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_4rem]">
          <span className={cn("truncate text-xs", i.voce && "font-bold")} style={{ color: "var(--text-primary)" }} title={i.rotulo}>
            {i.url ? (
              <a href={i.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {i.rotulo}
              </a>
            ) : (
              i.rotulo
            )}
          </span>
          <span className="h-3 rounded-full" style={{ background: "var(--bg-input)" }}>
            <span className="block h-full rounded-full" style={{ width: `${i.valor === null ? 0 : Math.max(2, (i.valor / max) * 100)}%`, background: i.voce ? COR_VOCE : COR_REFS }} />
          </span>
          <span className="text-right text-xs font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
            {formato(i.valor)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** O QUE RENDE MAIS: barras de "rende Nx", divergentes a partir de 1x (igual ao resto do perfil). */
export function BarrasDeRende({ barras, lado = "do perfil" }: { barras: Array<BarraDoPainel & { grafico?: string }>; lado?: string }) {
  if (!barras.length) return null;
  return (
    <div>
      <ul className="space-y-1">
        {barras.map((b) => (
          <li
            key={(b.grafico ?? "") + b.chave}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1"
            title={`${b.nome}: ${vezesCurto(b.vezes)} o resto ${lado}, ${b.posts} posts${b.perfis > 1 ? ` de ${b.perfis} perfis` : ""}, ${b.forca === "forte" ? "forte" : "indício"}`}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {b.nome}
              </span>
              <span className="block truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
                {b.grafico ? `${b.grafico}, ` : ""}
                {b.posts} posts{b.forca === "forte" ? "" : ", indício"}
              </span>
            </span>
            <span className="order-3 col-span-2">
              <BarraDivergente vezes={b.vezes} forca={b.forca} naPonta={DOBROS_DO_PAINEL} />
            </span>
            <span className="text-right text-base font-extrabold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {vezesCurto(b.vezes)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-1.5">
        <div className="relative h-4 text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
          {[
            { k: -2, t: "¼x" },
            { k: -1, t: "½x" },
            { k: 0, t: "1x" },
            { k: 1, t: "2x" },
            { k: 2, t: "4x" },
          ].map(({ k, t }) => (
            <span key={k} className={cn("absolute whitespace-nowrap", k === -2 ? "" : k === 2 ? "-translate-x-full" : "-translate-x-1/2", k === 0 && "font-bold")} style={{ left: `${50 + (k / DOBROS_DO_PAINEL) * 50}%` }}>
              {t}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
        1x é igual ao resto {lado}. Barra cheia é forte; listrada é indício (amostra pequena), leia como pista.
      </p>
    </div>
  );
}

/** A PALETA como amostras grandes, com o código embaixo. */
export function Paleta({ cores }: { cores: string[] }) {
  if (!cores.length) return null;
  return (
    <div>
      <div className="flex h-12 overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
        {cores.map((c) => (
          <span key={c} className="h-full flex-1" style={{ background: c }} title={c} />
        ))}
      </div>
      <div className="mt-1 flex">
        {cores.map((c) => (
          <span key={c} className="flex-1 text-center text-[10px] uppercase tabular-nums" style={{ color: "var(--text-muted)" }}>
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}

const dataCurta = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" }) : "";

/** A miniatura do post. O endereço da capa expira em dias: sem imagem, um quadro neutro. */
function Miniatura({ capa, formato }: { capa?: string | null; formato: string }) {
  const [falhou, setFalhou] = useState(false);
  const quadro = "relative h-32 w-24 shrink-0 overflow-hidden rounded-xl sm:h-40 sm:w-32";
  if (!capa || falhou) {
    return (
      <div className={cn(quadro, "flex flex-col items-center justify-center gap-1")} style={{ background: "var(--bg-input)", color: "var(--text-muted)" }}>
        <ImageOff className="h-5 w-5" />
        <span className="text-[10px]">{formato}</span>
      </div>
    );
  }
  return (
    <div className={quadro} style={{ background: "var(--bg-input)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- capa de rede social, endereço externo que expira */}
      <img src={capa} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setFalhou(true)} className="h-full w-full object-cover" />
    </div>
  );
}

/** O POST DE MAIOR ENGAJAMENTO como cartão: miniatura, números grandes e o link. */
export function CartaoDoPost({ post, titulo, porQue, legenda }: { post: ExemploDoAchado; titulo: string; porQue?: string | null; legenda?: string | null }) {
  const numeros = [
    post.visualizacoes ? { v: post.visualizacoes, r: "visualizações" } : null,
    post.curtidas !== null && post.curtidas !== undefined ? { v: post.curtidas, r: "curtidas" } : null,
    post.comentarios !== null && post.comentarios !== undefined ? { v: post.comentarios, r: "comentários" } : null,
  ].filter((x): x is { v: number; r: string } => Boolean(x));
  const quem = post.rede === "linkedin" ? "página" : post.perfil.startsWith("@") ? post.perfil : `@${post.perfil}`;
  return (
    <div className="flex min-w-0 gap-3">
      <Miniatura capa={post.capa} formato={post.formato} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          {titulo}
        </p>
        <p className="mt-0.5 truncate text-xs" style={{ color: "var(--text-muted)" }}>
          {quem}
          {post.publicadoEm ? `, ${dataCurta(post.publicadoEm)}` : ""}
          {post.ganho ? `, ${vezesCurto(post.ganho)} o normal do perfil` : ""}
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {numeros.map((n) => (
            <span key={n.r} className="min-w-0">
              <span className="block text-xl font-extrabold leading-none tabular-nums" style={{ color: "var(--text-primary)" }}>
                {numeroCurto(n.v)}
              </span>
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {n.r}
              </span>
            </span>
          ))}
        </div>
        {porQue && (
          <p className="mt-2 text-xs leading-snug" style={{ color: "var(--text-primary)" }}>
            {porQue}
          </p>
        )}
        {legenda && (
          <p className="mt-1 line-clamp-2 text-xs italic" style={{ color: "var(--text-muted)" }}>
            &ldquo;{legenda}&rdquo;
          </p>
        )}
        {post.url && (
          <a href={post.url} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-orange-500 hover:underline">
            Abrir o post <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}

// ── Andar 3: o que fazer ──

/**
 * Mostra o roteiro na linha editorial. Na mesma página (a aba Linha editorial),
 * avisa a lista para recarregar, rolar até ele e destacá-lo
 * (components/editorial/linha-editorial.tsx ouve "linha-editorial:mostrar");
 * em outra página (a criação do projeto), o link leva para a aba com a âncora.
 */
export function mostrarNaLinhaEditorial(roteiroId: string): boolean {
  if (typeof document === "undefined" || !document.getElementById("linha-editorial-lista")) return false;
  window.dispatchEvent(new CustomEvent("linha-editorial:mostrar", { detail: { roteiroId } }));
  return true;
}

function ItemDoQueFazer({ r, i, projectId, podeEditar, aoMudar }: { r: Recomendacao; i: number; projectId: string; podeEditar: boolean; aoMudar?: () => void | Promise<void> }) {
  const [ocupado, setOcupado] = useState(false);
  const [feita, setFeita] = useState<Recomendacao["feita"]>(r.feita);

  async function agir() {
    const a = r.acao;
    if (!a) return;
    setOcupado(true);
    try {
      let resp: Response;
      if (a.tipo === "regra") {
        resp = await fetch(`/api/projects/${projectId}/referencias/regras`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texto: a.texto, alvos: a.alvos, porque: a.porque }),
        });
      } else if (a.tipo === "aprovar") {
        resp = await fetch(`/api/projects/${projectId}/referencias/regras/${a.regraId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "aprovar" }),
        });
      } else {
        resp = await fetch(`/api/projects/${projectId}/referencias/tendencias/${a.tendenciaId}`, { method: "POST" });
      }
      const j = (await resp.json().catch(() => ({}))) as { error?: string; roteiroId?: string };
      if (!resp.ok) {
        toast.error(j.error ?? "Não consegui agora.");
        return;
      }
      if (a.tipo === "tendencia") {
        setFeita({ rotulo: "Virou roteiro na linha editorial", roteiroId: j.roteiroId ?? null });
        if (j.roteiroId && mostrarNaLinhaEditorial(j.roteiroId)) toast.success("Roteiro criado: está destacado na linha editorial, logo abaixo.");
        else toast.success("Roteiro criado na linha editorial, pronto para você ajustar e gravar.");
      } else {
        setFeita({ rotulo: "Virou regra: a equipe segue a partir da próxima peça" });
        toast.success("Regra valendo: a equipe passa a seguir a partir da próxima peça.");
      }
      await aoMudar?.();
    } finally {
      setOcupado(false);
    }
  }

  const a = r.acao;
  const rotulo = !a ? "" : a.tipo === "regra" ? "Virar regra" : a.tipo === "aprovar" ? "Aprovar como regra" : "Levar para a linha editorial";
  const Icone = !a ? Sparkles : a.tipo === "tendencia" ? Plus : Check;
  return (
    <li className="flex min-w-0 gap-3 rounded-2xl border p-3 sm:p-4" style={{ borderColor: feita ? "color-mix(in srgb, var(--painel-3) 45%, var(--border))" : "var(--border)", background: "var(--bg-elevated)" }}>
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold tabular-nums"
        style={{ background: feita ? "color-mix(in srgb, var(--painel-3) 20%, transparent)" : "color-mix(in srgb, var(--painel-2) 18%, transparent)", color: "var(--text-primary)" }}
      >
        {feita ? <Check className="h-4 w-4" /> : i + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-snug" style={{ color: "var(--text-primary)" }}>
          {r.titulo}
        </p>
        <p className="mt-1 text-xs font-medium leading-snug tabular-nums" style={{ color: "var(--text-primary)" }}>
          {r.dado}
        </p>
        {r.fonte && (
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug" style={{ color: "var(--text-muted)" }} title={r.fonte}>
            {r.fonte}
          </p>
        )}
        <div className="mt-2">
          {feita ? (
            <span className="flex items-start gap-1.5 text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
              <Check className="mt-px h-3.5 w-3.5 shrink-0" style={{ color: COR_VOCE }} />
              <span className="min-w-0">
                {feita.rotulo}
              </span>
              {feita.roteiroId && (
                <a
                  href={`/projects/${projectId}/linha-editorial#roteiro-${feita.roteiroId}`}
                  onClick={(e) => {
                    if (mostrarNaLinhaEditorial(feita.roteiroId!)) e.preventDefault();
                  }}
                  className="text-orange-500 hover:underline"
                >
                  ver o roteiro
                </a>
              )}
            </span>
          ) : a && podeEditar ? (
            <button
              type="button"
              disabled={ocupado}
              onClick={() => void agir()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
            >
              {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icone className="h-3.5 w-3.5" />}
              {rotulo}
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** O QUE FAZER: no máximo 3 ações, cada uma com o dado e o botão. */
export function OQueFazer({
  projectId,
  itens,
  podeEditar,
  aoMudar,
  vazio,
}: {
  projectId: string;
  itens: Recomendacao[];
  podeEditar: boolean;
  aoMudar?: () => void | Promise<void>;
  vazio?: string;
}) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold" style={{ color: "var(--text-primary)" }}>
        <Sparkles className="h-4 w-4" style={{ color: COR_REFS }} />
        O que fazer agora
      </h3>
      {itens.length ? (
        <ol className={cn("grid grid-cols-1 gap-2", itens.length >= 3 ? "lg:grid-cols-3" : itens.length === 2 ? "lg:grid-cols-2" : "")}>
          {itens.slice(0, 3).map((r, i) => (
            <ItemDoQueFazer key={r.id} r={r} i={i} projectId={projectId} podeEditar={podeEditar} aoMudar={aoMudar} />
          ))}
        </ol>
      ) : (
        <p className="rounded-2xl border border-dashed p-3 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          {vazio ?? "Nada pendente: o que o estudo mostrou já virou regra do projeto."}
        </p>
      )}
    </section>
  );
}

// ── Os detalhes recolhidos ──

/** "Ver detalhes": recolhido por padrão, para quem quer estudar. */
export function Detalhes({ titulo, resumo, children, abertoDeInicio = false }: { titulo: string; resumo?: string; children: ReactNode; abertoDeInicio?: boolean }) {
  const [aberto, setAberto] = useState(abertoDeInicio);
  return (
    <section className="rounded-2xl border" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
      <button type="button" onClick={() => setAberto(!aberto)} aria-expanded={aberto} className="flex w-full items-center gap-2 px-3 py-2.5 text-left sm:px-4">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {titulo}
          </span>
          {resumo && (
            <span className="block truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
              {resumo}
            </span>
          )}
        </span>
        <span className="shrink-0 text-xs font-semibold text-orange-500">{aberto ? "recolher" : "ver detalhes"}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", aberto && "rotate-180")} style={{ color: "var(--text-muted)" }} />
      </button>
      {aberto && (
        <div className="border-t px-3 py-3 sm:px-4" style={{ borderColor: "var(--border)" }}>
          {children}
        </div>
      )}
    </section>
  );
}
