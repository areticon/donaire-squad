"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { ArrowDown, ArrowUp, ExternalLink, Loader2, NotebookPen, Plus, Sparkles, Trash2, UserRound, Video, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ROTULO_DA_ORIGEM,
  segundosDaFala,
  type CenaDoRoteiro,
  type FonteDaIdeia,
  type OrigemDaIdeia,
  type PapelDaCena,
  type RoteiroNaTela,
} from "@/lib/editorial/tipos";

/**
 * A TELA DA LINHA EDITORIAL (29/09/2026): ideias à esquerda, roteiro à direita.
 *
 * O fluxo aprovado: o squad propõe pautas novas no nicho (radar da semana e
 * memória de 8 semanas, sem repetir), o cliente escolhe uma, a IA escreve o
 * roteiro por cenas (gancho, desenvolvimento, fechamento, com a fala e o que
 * aparece na tela) e ele edita à mão. "Gravar com este roteiro" leva para a
 * jornada do vídeo. O roteiro guardado é a partitura que o editor novo vai ler.
 *
 * Nada é gerado sozinho: cada chamada de IA acontece num clique do cliente.
 */
const DURACOES = [
  { segundos: 60, rotulo: "1 min", dica: "Reels, Shorts, TikTok" },
  { segundos: 180, rotulo: "3 min", dica: "LinkedIn, YouTube curto" },
  { segundos: 480, rotulo: "8 min", dica: "YouTube, aula" },
];
const PAPEL: Record<PapelDaCena, string> = { gancho: "Gancho", desenvolvimento: "Desenvolvimento", fechamento: "Fechamento" };

/**
 * A ORIGEM DE CADA IDEIA NA TELA (01/10). O Bruno achou que o Roberto tinha
 * "um banco de dados limitado"; mostrar de onde veio cada ideia deixa visível
 * que a rodada mistura radar, X, pesquisa, curiosidade, pergunta do público,
 * documento e padrão de referência.
 */
const COR_DA_ORIGEM: Record<OrigemDaIdeia, string> = {
  radar: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  x: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
  pesquisa: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  curiosidade: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  publico: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  documento: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  padrao: "bg-pink-500/15 text-pink-600 dark:text-pink-400",
  tendencia: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
};

function SeloDaOrigem({ origem, titulo }: { origem?: OrigemDaIdeia; titulo?: string }) {
  if (!origem || !ROTULO_DA_ORIGEM[origem]) return null;
  // A tendência diz QUAL (02/10): "da tendência: O cliente te pesquisa antes...".
  const texto = origem === "tendencia" && titulo ? `da tendência: ${titulo.length > 48 ? `${titulo.slice(0, 47)}...` : titulo}` : ROTULO_DA_ORIGEM[origem];
  return <span className={cn("inline-block max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-semibold", COR_DA_ORIGEM[origem])}>{texto}</span>;
}

/** Como a origem se lê depois de um número no aviso da rodada. */
const ORIGEM_NO_AVISO: Record<OrigemDaIdeia, string> = {
  radar: "do radar da semana",
  x: "do X",
  pesquisa: "de pesquisa",
  curiosidade: "de curiosidade ou data",
  publico: "de pergunta do público",
  documento: "do seu documento",
  padrao: "de padrão de referência",
  tendencia: "de tendência da semana",
};

/** "2 de pesquisa, 1 do X e 1 do radar da semana". */
function resumoDasOrigens(origens: Partial<Record<OrigemDaIdeia, number>> | undefined): string {
  const partes = Object.entries(origens ?? {})
    .filter(([, n]) => Number(n) > 0)
    .map(([o, n]) => `${n} ${ORIGEM_NO_AVISO[o as OrigemDaIdeia] ?? o}`);
  if (partes.length <= 1) return partes.join("");
  return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
}

function paraTela(r: Record<string, unknown>): RoteiroNaTela {
  return {
    id: String(r.id),
    status: r.status as RoteiroNaTela["status"],
    titulo: String(r.titulo ?? ""),
    gancho: (r.gancho as string | null) ?? null,
    fonte: (r.fonte as FonteDaIdeia | null) ?? null,
    tese: (r.tese as string | null) ?? null,
    cenas: Array.isArray(r.cenas) ? (r.cenas as CenaDoRoteiro[]) : [],
    duracao: Number(r.duracao ?? 60),
    createdAt: String(r.createdAt ?? ""),
  };
}

export function LinhaEditorial({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [roteiros, setRoteiros] = useState<RoteiroNaTela[] | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [escrevendo, setEscrevendo] = useState(false);
  const [duracao, setDuracao] = useState(60);
  const [rascunho, setRascunho] = useState<RoteiroNaTela | null>(null);
  const [salvando, setSalvando] = useState(false);
  // As ideias da última rodada, marcadas como "nova" na lista.
  const [novas, setNovas] = useState<Set<string>>(new Set());
  // O roteiro que acabou de chegar de fora (uma tendência levada pelas
  // análises das referências), destacado por alguns segundos.
  const [destaque, setDestaque] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/projects/${projectId}/linha-editorial`);
    const d = (await r.json().catch(() => ({}))) as { roteiros?: Array<Record<string, unknown>> };
    const lista = (d.roteiros ?? []).map(paraTela);
    setRoteiros(lista);
    return lista;
  }, [projectId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // "LEVAR PARA A LINHA EDITORIAL" (02/10): o Bruno levou duas tendências, o
  // botão mudou e ele não achou as ideias, porque esta lista não sabia que
  // tinha roteiro novo. Agora as análises avisam ("linha-editorial:mostrar"), e
  // o link de outra página chega com #roteiro-<id>: a lista recarrega, rola até
  // o roteiro e o destaca por 4 segundos.
  useEffect(() => {
    let parar: ReturnType<typeof setTimeout> | null = null;
    const mostrar = async (id: string) => {
      const lista = await carregar();
      if (!lista.some((r) => r.id === id)) return;
      setDestaque(id);
      requestAnimationFrame(() => document.getElementById(`roteiro-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
      if (parar) clearTimeout(parar);
      parar = setTimeout(() => setDestaque(null), 4000);
    };
    const ouvir = (e: Event) => {
      const id = (e as CustomEvent<{ roteiroId?: string }>).detail?.roteiroId;
      if (id) void mostrar(id);
    };
    window.addEventListener("linha-editorial:mostrar", ouvir);
    const daAncora = window.location.hash.match(/^#roteiro-([\w-]+)$/)?.[1];
    if (daAncora) void mostrar(daAncora);
    return () => {
      window.removeEventListener("linha-editorial:mostrar", ouvir);
      if (parar) clearTimeout(parar);
    };
  }, [carregar]);

  const atual = useMemo(() => roteiros?.find((r) => r.id === aberto) ?? null, [roteiros, aberto]);
  // O rascunho é a cópia que o cliente edita; ela só vai ao banco no "Salvar".
  useEffect(() => {
    setRascunho(atual ? { ...atual, cenas: atual.cenas.map((c) => ({ ...c })) } : null);
    if (atual) setDuracao(atual.duracao || 60);
  }, [atual]);
  const mudou = useMemo(() => JSON.stringify(rascunho) !== JSON.stringify(atual), [rascunho, atual]);

  async function gerarIdeias() {
    setGerando(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/linha-editorial`, { method: "POST" });
      const d = (await r.json()) as { novas?: number; ids?: string[]; origens?: Partial<Record<OrigemDaIdeia, number>>; error?: string };
      if (!r.ok) throw new Error(d.error);
      setNovas(new Set(d.ids ?? []));
      await carregar();
      if (d.novas) toast.success(`${d.novas} ideias novas: ${resumoDasOrigens(d.origens)}.`, { duration: 6000 });
      else toast.error("Não consegui ideias diferentes das que você já viu agora. Tente de novo em alguns minutos.");
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Não consegui gerar as ideias.");
    } finally {
      setGerando(false);
    }
  }

  async function escrever() {
    if (!atual) return;
    setEscrevendo(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/linha-editorial/${atual.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duracao }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(d.error);
      await carregar();
      toast.success("Roteiro pronto. Edite o que quiser antes de gravar.");
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Não consegui escrever o roteiro.");
    } finally {
      setEscrevendo(false);
    }
  }

  async function salvar(extra?: Partial<RoteiroNaTela>) {
    if (!rascunho) return;
    setSalvando(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/linha-editorial/${rascunho.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: rascunho.titulo, tese: rascunho.tese ?? "", cenas: rascunho.cenas, ...extra }),
      });
      if (!r.ok) throw new Error();
      await carregar();
      if (!extra) toast.success("Roteiro salvo.");
    } catch {
      toast.error("Não consegui salvar. O texto continua na tela; tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  async function descartar(id: string) {
    await fetch(`/api/projects/${projectId}/linha-editorial/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "descartada" }),
    });
    if (aberto === id) setAberto(null);
    await carregar();
  }

  function mudarCena(i: number, parte: Partial<CenaDoRoteiro>) {
    setRascunho((r) => (r ? { ...r, cenas: r.cenas.map((c, k) => (k === i ? { ...c, ...parte } : c)) } : r));
  }
  function moverCena(i: number, para: number) {
    setRascunho((r) => {
      if (!r || para < 0 || para >= r.cenas.length) return r;
      const cenas = [...r.cenas];
      const [c] = cenas.splice(i, 1);
      cenas.splice(para, 0, c);
      return { ...r, cenas };
    });
  }

  const totalSegundos = rascunho?.cenas.reduce((s, c) => s + segundosDaFala(c.fala), 0) ?? 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      {/* ── As ideias ─────────────────────────────────────────────────────── */}
      <aside id="linha-editorial-lista" className="space-y-3">
        <button
          type="button"
          onClick={() => void gerarIdeias()}
          disabled={gerando}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {gerando ? "O Roberto está cruzando radar, pesquisas e perguntas do público..." : "Gerar ideias novas"}
        </button>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Cada rodada mistura o radar da semana, conversas no X, pesquisas, curiosidades e datas, perguntas do
          público e o seu documento. Nada do que você já viu, gravou ou descartou volta.
        </p>

        {roteiros === null ? (
          <div className="flex items-center gap-2 py-6 text-sm" style={{ color: "var(--text-muted)" }}>
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando
          </div>
        ) : roteiros.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
            Nenhuma ideia ainda. Clique em &quot;Gerar ideias novas&quot;.
          </div>
        ) : (
          <div className="space-y-2">
            {roteiros.map((r) => (
              <div
                key={r.id}
                id={`roteiro-${r.id}`}
                className={cn(
                  "group scroll-mt-24 rounded-xl border p-3 transition-all duration-500",
                  aberto === r.id ? "border-orange-500 bg-orange-500/5" : "hover:border-orange-500/40",
                  destaque === r.id && "ring-2 ring-orange-500 ring-offset-2 ring-offset-[var(--bg-primary)]"
                )}
                style={aberto === r.id ? undefined : { borderColor: "var(--border)", background: "var(--bg-card)" }}
              >
                <div className="flex items-start gap-2">
                  <button type="button" onClick={() => setAberto(r.id)} className="flex-1 text-left">
                    <span className="mb-1 flex flex-wrap items-center gap-1">
                      <span
                        className={cn(
                          "inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                          r.status === "ideia" ? "bg-sky-500/15 text-sky-500" : r.status === "pronto" ? "bg-green-500/15 text-green-600" : "bg-gray-500/15 text-gray-500"
                        )}
                      >
                        {r.status === "ideia" ? "Ideia" : r.status === "pronto" ? "Roteiro pronto" : "Gravado"}
                      </span>
                      {novas.has(r.id) && (
                        <span className="inline-block rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Nova</span>
                      )}
                      <SeloDaOrigem origem={r.fonte?.origem} titulo={r.fonte?.titulo} />
                    </span>
                    <p className="text-sm font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>
                      {r.titulo}
                    </p>
                    {(r.fonte?.abertura || r.gancho) && (
                      <p className="mt-1 line-clamp-2 text-xs" style={{ color: "var(--text-muted)" }}>
                        {r.fonte?.abertura ? `"${r.fonte.abertura}"` : r.gancho}
                      </p>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => void descartar(r.id)}
                    title="Descartar (não volta nas próximas ideias)"
                    className="rounded p-1 opacity-0 transition-opacity group-hover:opacity-100"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* ── O roteiro ─────────────────────────────────────────────────────── */}
      <section className="min-w-0">
        {!rascunho ? (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-10 text-center" style={{ borderColor: "var(--border)" }}>
            <NotebookPen className="h-8 w-8 text-orange-400" />
            <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
              Escolha uma ideia para ver ou escrever o roteiro
            </p>
            <p className="max-w-md text-sm" style={{ color: "var(--text-muted)" }}>
              O roteiro vem por cenas: o gancho, o desenvolvimento e o fechamento, com a sua fala e o que
              aparece na tela. É por ele que a edição sabe como montar o vídeo que você gravar.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
              <input
                value={rascunho.titulo}
                onChange={(e) => setRascunho({ ...rascunho, titulo: e.target.value })}
                className="w-full bg-transparent text-xl font-semibold outline-none"
                style={{ color: "var(--text-primary)" }}
              />
              {/* Gancho, ângulo, por que agora e fonte (01/10). */}
              <div className="mt-2 space-y-1 text-sm" style={{ color: "var(--text-muted)" }}>
                {rascunho.fonte?.origem && (
                  <p>
                    <SeloDaOrigem origem={rascunho.fonte.origem} titulo={rascunho.fonte.titulo} />
                  </p>
                )}
                {rascunho.fonte?.abertura && (
                  <p>
                    <b style={{ color: "var(--text-primary)" }}>Gancho:</b> &ldquo;{rascunho.fonte.abertura}&rdquo;
                  </p>
                )}
                {rascunho.fonte?.angulo && (
                  <p>
                    <b style={{ color: "var(--text-primary)" }}>Ângulo:</b> {rascunho.fonte.angulo}
                  </p>
                )}
                {rascunho.gancho && (
                  <p>
                    <b style={{ color: "var(--text-primary)" }}>Por que agora:</b> {rascunho.gancho}
                    {rascunho.fonte?.url && (
                      <a href={rascunho.fonte.url} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 text-orange-500 hover:underline">
                        fonte <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </p>
                )}
              </div>
            </div>

            {/* A escolha da duração e o pedido do roteiro. */}
            <div className="flex flex-wrap items-center gap-2">
              {DURACOES.map((d) => (
                <button
                  key={d.segundos}
                  type="button"
                  onClick={() => setDuracao(d.segundos)}
                  className={cn("rounded-lg border px-3 py-1.5 text-left text-sm", duracao === d.segundos ? "border-orange-500 bg-orange-500/10" : "")}
                  style={duracao === d.segundos ? undefined : { borderColor: "var(--border)" }}
                >
                  <b style={{ color: "var(--text-primary)" }}>{d.rotulo}</b>{" "}
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {d.dica}
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => void escrever()}
                disabled={escrevendo}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {escrevendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {escrevendo ? "Escrevendo o roteiro..." : rascunho.cenas.length ? "Escrever de novo" : "Escrever o roteiro"}
              </button>
            </div>

            {rascunho.cenas.length > 0 && (
              <>
                <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                    A tese (a ideia que o público leva embora)
                  </p>
                  <textarea
                    value={rascunho.tese ?? ""}
                    onChange={(e) => setRascunho({ ...rascunho, tese: e.target.value })}
                    rows={2}
                    className="mt-1 w-full resize-none bg-transparent text-sm outline-none"
                    style={{ color: "var(--text-primary)" }}
                  />
                </div>

                <div className="space-y-3">
                  {rascunho.cenas.map((c, i) => (
                    <div key={c.id} className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
                      <div className="mb-2 flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500/15 text-xs font-semibold text-orange-400">{i + 1}</span>
                        <select
                          value={c.papel}
                          onChange={(e) => mudarCena(i, { papel: e.target.value as PapelDaCena })}
                          className="rounded-md border px-2 py-1 text-xs"
                          style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                        >
                          {Object.entries(PAPEL).map(([v, r]) => (
                            <option key={v} value={v}>
                              {r}
                            </option>
                          ))}
                        </select>
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          cerca de {segundosDaFala(c.fala)} s
                        </span>
                        <div className="ml-auto flex gap-1" style={{ color: "var(--text-muted)" }}>
                          <button type="button" title="Subir" onClick={() => moverCena(i, i - 1)} className="rounded p-1 hover:bg-[var(--bg-elevated)]">
                            <ArrowUp className="h-4 w-4" />
                          </button>
                          <button type="button" title="Descer" onClick={() => moverCena(i, i + 1)} className="rounded p-1 hover:bg-[var(--bg-elevated)]">
                            <ArrowDown className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="Apagar a cena"
                            onClick={() => setRascunho({ ...rascunho, cenas: rascunho.cenas.filter((_, k) => k !== i) })}
                            className="rounded p-1 hover:bg-[var(--bg-elevated)]"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <label className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                        O que você fala
                      </label>
                      <textarea
                        value={c.fala}
                        onChange={(e) => mudarCena(i, { fala: e.target.value })}
                        rows={3}
                        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-orange-500"
                        style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                      />
                      <label className="mt-2 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                        O que aparece na tela
                      </label>
                      <input
                        value={c.naTela}
                        onChange={(e) => mudarCena(i, { naTela: e.target.value })}
                        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-orange-500"
                        style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setRascunho({
                        ...rascunho,
                        cenas: [...rascunho.cenas, { id: `c${Date.now()}`, papel: "desenvolvimento", fala: "", naTela: "" }],
                      })
                    }
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed py-3 text-sm"
                    style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                  >
                    <Plus className="h-4 w-4" /> Adicionar cena
                  </button>
                </div>

                <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-xl border p-3 shadow-lg" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
                  <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                    {rascunho.cenas.length} cenas, cerca de {totalSegundos >= 60 ? `${Math.floor(totalSegundos / 60)} min ${totalSegundos % 60} s` : `${totalSegundos} s`} de fala
                  </span>
                  <div className="ml-auto flex gap-2">
                    <button
                      type="button"
                      onClick={() => void salvar()}
                      disabled={!mudou || salvando}
                      className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                      style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                    >
                      {salvando ? "Salvando..." : mudou ? "Salvar" : "Salvo"}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (mudou) await salvar({ status: "pronto" });
                        router.push(`/projects/${projectId}/live?abrir=video`);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white"
                    >
                      <Video className="h-4 w-4" /> Gravei, enviar o vídeo
                    </button>
                    {/* O GÊMEO (01/10): sem tempo de gravar, o gêmeo fala este roteiro. */}
                    <button
                      type="button"
                      onClick={async () => {
                        if (mudou) await salvar({ status: "pronto" });
                        router.push(`/projects/${projectId}/gemeo?roteiro=${rascunho.id}`);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold"
                      style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                    >
                      <UserRound className="h-4 w-4" /> Gerar com o meu gêmeo
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
