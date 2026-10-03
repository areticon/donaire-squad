"use client";

import { useState, type CSSProperties } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BarraDoPainel, ExemploDoAchado, GraficoDoPainel, PainelExecutivo } from "@/lib/referencias/tipos-das-analises";

/**
 * O PAINEL EXECUTIVO DAS REFERÊNCIAS EM GRÁFICOS (02/10/2026).
 *
 * Pedido do Bruno: "precisa ser gráfico. Não pode ser um monte de card,
 * precisa ser executivo; deixe os cards para quem quer estudar mais, porém
 * lúdico, com gráficos mesmo, comparando os formatos, estilos, ganchos, CTAs".
 *
 * A FORMA: o número é uma razão ("rende 5x o resto do perfil"), e razão tem
 * dois lados. Por isso a barra é DIVERGENTE a partir de 1x (igual ao resto
 * do perfil): para a direita rende mais, para a esquerda rende menos, numa
 * escala de dobros (2x e 0,5x têm o mesmo comprimento). Sem isso, 0,3x e
 * 0,05x pareceriam iguais, e 20x esmagaria todas as outras barras.
 *
 * A COR diz o lado (laranja da marca para "rende mais", ardósia para "rende
 * menos"); o número está sempre escrito, em cor de texto. Biblioteca nenhuma,
 * como o painel de gestão (components/admin/painel-graficos.tsx): HTML e
 * CSS, com as cores --painel-* já validadas para daltonismo nos dois temas.
 *
 * A FORÇA é visual: barra cheia é forte (5 posts ou mais, de 2 perfis ou
 * mais, todos para o mesmo lado); barra hachurada e mais clara é indício.
 * Indício de 1 perfil nunca vira manchete (as frases do topo vêm do servidor
 * só de barra forte).
 *
 * O DETALHE: tocar na barra abre os posts de exemplo com o link (funciona no
 * celular, onde não existe passar o mouse); no computador o título nativo
 * também mostra a amostra.
 */

/** Até 8x para cada lado; além disso a barra encosta na ponta e ganha a seta. */
const DOBROS_NA_PONTA = 3;

function numero(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (n >= 10_000) return `${Math.round(n / 1000).toLocaleString("pt-BR")} mil`;
  return Math.round(n).toLocaleString("pt-BR");
}

export function vezesNaTela(v: number): string {
  if (v < 0.1) return "<0,1x";
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: v >= 10 ? 0 : 1 })}x`;
}

function arroba(perfil: string, rede: string): string {
  if (rede === "linkedin") return perfil.match(/\/(?:company|school|showcase)\/([^/?#]+)/i)?.[1] ?? "página";
  return perfil.startsWith("@") ? perfil : `@${perfil}`;
}

/** Um post real citado como prova, com link (usado nos gráficos e nos cards). */
export function Exemplo({ e }: { e: ExemploDoAchado }) {
  const partes = [
    e.visualizacoes ? `${numero(e.visualizacoes)} visualizações` : null,
    e.curtidas ? `${numero(e.curtidas)} curtidas` : null,
    e.comentarios ? `${numero(e.comentarios)} comentários` : null,
    e.salvamentos ? `${numero(e.salvamentos)} salvamentos` : null,
  ].filter(Boolean);
  const data = e.publicadoEm ? new Date(e.publicadoEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }) : "";
  return (
    <li className="text-xs" style={{ color: "var(--text-muted)" }}>
      {e.url ? (
        <a href={e.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-orange-500 hover:underline">
          {arroba(e.perfil, e.rede)}
          {data ? `, ${data}` : ""}
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <span className="font-medium">{arroba(e.perfil, e.rede)}</span>
      )}
      {partes.length ? `: ${partes.join(", ")}` : ""}
      {e.ganho !== null && e.ganho !== undefined
        ? e.ganho < 0.1
          ? " (menos de um décimo do normal do perfil)"
          : ` (${e.ganho.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${e.ganho === 1 ? "vez" : "vezes"} o normal do perfil)`
        : ""}
    </li>
  );
}

/** A barra divergente a partir de 1x, na escala de dobros. */
export function BarraDivergente({ vezes, forca, altura = 10 }: { vezes: number; forca: "forte" | "indicio"; altura?: number }) {
  const dobros = Math.log2(Math.max(vezes, 0.001));
  const fracao = Math.min(Math.abs(dobros), DOBROS_NA_PONTA) / DOBROS_NA_PONTA;
  const passou = Math.abs(dobros) > DOBROS_NA_PONTA;
  const mais = vezes >= 1;
  const cor = mais ? "var(--painel-2)" : "var(--painel-5)";
  const largura = `${Math.max(fracao * 50, 0.8)}%`;
  const fundo =
    forca === "forte" ? cor : `repeating-linear-gradient(135deg, ${cor} 0 2px, transparent 2px 5px)`;
  return (
    <div className="relative w-full" style={{ height: altura + 4 }}>
      {/* o trilho e a linha do 1x (igual ao resto do perfil) */}
      <div className="absolute inset-x-0 rounded-full" style={{ top: 2, height: altura, background: "var(--bg-input)" }} />
      <div className="absolute" style={{ left: "50%", top: 0, bottom: 0, width: 2, marginLeft: -1, background: "var(--text-muted)", opacity: 0.55 }} />
      <div
        className="absolute"
        style={{
          top: 2,
          height: altura,
          width: largura,
          ...(mais ? { left: "50%", borderRadius: "0 4px 4px 0" } : { right: "50%", borderRadius: "4px 0 0 4px" }),
          background: fundo,
          border: forca === "forte" ? "none" : `1px solid ${cor}`,
          opacity: forca === "forte" ? 1 : 0.85,
        }}
      />
      {passou && (
        <span
          aria-hidden
          className="absolute text-[10px] font-bold leading-none"
          style={{ top: 1, color: cor, ...(mais ? { right: -2 } : { left: -2 }) }}
        >
          {mais ? "▶" : "◀"}
        </span>
      )}
    </div>
  );
}

function LinhaDaBarra({ b, vence }: { b: BarraDoPainel; vence: boolean }) {
  const [aberta, setAberta] = useState(false);
  const meta = `${b.posts} ${b.posts === 1 ? "post" : "posts"} de ${b.perfis} ${b.perfis === 1 ? "perfil" : "perfis"}`;
  return (
    <li>
      <button
        type="button"
        onClick={() => setAberta(!aberta)}
        aria-expanded={aberta}
        title={`${b.nome}: ${vezesNaTela(b.vezes)} o resto do perfil, ${meta}, ${b.forca === "forte" ? "forte" : "indício"}. Toque para ver os posts.`}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg px-1.5 py-1.5 text-left hover:bg-[var(--realce-1)] sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_4rem]"
      >
        <span className="order-1 min-w-0">
          <span className={cn("block truncate text-sm", vence ? "font-bold" : "font-medium")} style={{ color: "var(--text-primary)" }}>
            {b.nome}
          </span>
          <span className="block text-[11px]" style={{ color: "var(--text-muted)" }}>
            {meta}, {b.forca === "forte" ? "forte" : "indício"}
          </span>
        </span>
        <span className="order-3 col-span-2 sm:order-2 sm:col-span-1">
          <BarraDivergente vezes={b.vezes} forca={b.forca} />
        </span>
        <span className="order-2 text-right tabular-nums sm:order-3">
          <span className={cn("text-base", vence ? "font-extrabold" : "font-semibold")} style={{ color: "var(--text-primary)" }}>
            {vezesNaTela(b.vezes)}
          </span>
          <ChevronDown className={cn("ml-0.5 inline h-3 w-3 transition-transform", aberta && "rotate-180")} style={{ color: "var(--text-muted)" }} />
        </span>
      </button>
      {aberta && (
        <div className="mx-1.5 mb-1 rounded-lg p-2.5" style={{ background: "var(--bg-input)" }}>
          <p className="text-xs" style={{ color: "var(--text-primary)" }}>
            {b.vezes >= 1 ? `Rendeu ${vezesNaTela(b.vezes)} o que renderam os outros posts do mesmo perfil.` : `Rendeu ${vezesNaTela(b.vezes)} do que renderam os outros posts do mesmo perfil.`}{" "}
            {b.forca === "forte" ? "Forte: amostra grande e todos os perfis na mesma direção." : "Indício: amostra pequena ou perfis que discordam. Leia como pista, não como lei."}
          </p>
          {b.exemplos.length > 0 && <ul className="mt-1.5 space-y-0.5">{b.exemplos.map((e, i) => <Exemplo key={i} e={e} />)}</ul>}
        </div>
      )}
    </li>
  );
}

function Grafico({ g }: { g: GraficoDoPainel }) {
  return (
    <section id={`grafico-${g.id}`} className="min-w-0 scroll-mt-24 rounded-2xl border p-3 sm:p-4" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
      <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        {g.titulo}
      </h3>
      <p className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
        {g.pergunta}
      </p>
      <ul className="space-y-0.5">
        {g.barras.map((b) => (
          <LinhaDaBarra key={b.chave} b={b} vence={b.chave === g.vencedora} />
        ))}
      </ul>
      {/* o eixo, uma vez por gráfico: os dobros e o lado */}
      <div className="mt-1 grid grid-cols-[minmax(0,1fr)] px-1.5 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_4rem] sm:gap-x-3">
        <span className="hidden sm:block" />
        <div className="relative h-4 text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
          {[
            { k: -2, t: "¼x" },
            { k: -1, t: "½x" },
            { k: 0, t: "1x" },
            { k: 1, t: "2x" },
            { k: 2, t: "4x" },
          ].map(({ k, t }) => (
            <span key={k} className="absolute -translate-x-1/2" style={{ left: `${50 + (k / DOBROS_NA_PONTA) * 50}%` }}>
              {t}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/** A legenda única do painel: o lado, a cor e a força. */
function Legenda() {
  const item = "inline-flex items-center gap-1.5";
  const amostra = (estilo: CSSProperties) => <span className="inline-block h-2.5 w-6 rounded-sm" style={estilo} />;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
      <span className={item}>{amostra({ background: "var(--painel-2)" })}rende mais que o resto do perfil</span>
      <span className={item}>{amostra({ background: "var(--painel-5)" })}rende menos</span>
      <span className={item}>{amostra({ background: "var(--text-muted)" })}forte: 5 posts ou mais, de 2 perfis ou mais</span>
      <span className={item}>
        {amostra({ background: "repeating-linear-gradient(135deg, var(--text-muted) 0 2px, transparent 2px 5px)", border: "1px solid var(--text-muted)" })}
        indício: pista, não lei
      </span>
    </div>
  );
}

export function PainelExecutivoDasReferencias({ painel, amostra }: { painel: PainelExecutivo; amostra: { comGanho: number; perfis: number } }) {
  if (!painel.graficos.length) return null;
  return (
    <div className="space-y-4">
      {painel.frases.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {painel.frases.map((f) => {
            const mais = !f.texto.startsWith("Evite");
            return (
              <a
                key={f.grafico + f.numero}
                href={`#grafico-${f.grafico}`}
                className="group flex min-w-0 gap-3 rounded-2xl border p-3 transition-colors hover:border-orange-500/50 sm:p-4"
                style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}
              >
                <span className="w-1.5 shrink-0 rounded-full" style={{ background: mais ? "var(--painel-2)" : "var(--painel-5)" }} />
                <span className="min-w-0">
                  <span className="block text-3xl font-extrabold leading-none tabular-nums" style={{ color: "var(--text-primary)" }}>
                    {f.numero}
                  </span>
                  <span className="mt-1.5 block text-sm font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>
                    {f.texto}
                  </span>
                  <span className="mt-1 block text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {f.detalhe}. <span className="text-orange-500 group-hover:underline">Ver o gráfico</span>
                  </span>
                </span>
              </a>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Cada barra compara os posts de um tipo com os outros posts do <b>mesmo perfil</b> ({amostra.comGanho} posts comparáveis de {amostra.perfis} perfis). 1x é igual ao
          resto do perfil. Toque numa barra para ver os posts.
        </p>
        <Legenda />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {painel.graficos.map((g) => (
          <Grafico key={g.id} g={g} />
        ))}
      </div>
    </div>
  );
}

/** O gráfico pequeno de um achado, ao lado da regra que ele sustenta. */
export function MiniGraficoDoAchado({ vezes, forca, rotulo }: { vezes: number; forca: "forte" | "indicio"; rotulo: string }) {
  return (
    <div className="mt-1.5">
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="truncate" style={{ color: "var(--text-muted)" }}>
          {rotulo}
        </span>
        <span className="font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
          {vezesNaTela(vezes)}
        </span>
      </div>
      <BarraDivergente vezes={vezes} forca={forca} altura={8} />
    </div>
  );
}
