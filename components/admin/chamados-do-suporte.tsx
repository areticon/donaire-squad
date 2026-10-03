"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  NOME_DA_CATEGORIA,
  NOME_DO_STATUS,
  STATUS,
  contaComoReclamacao,
  ehCategoria,
  ehStatus,
  type ChamadoNoPainel,
  type StatusDoChamado,
} from "@/lib/suporte/regras";

/**
 * A LISTA DE CHAMADOS DO SUPORTE (02/10/2026): filtro por status na URL, a
 * ficha do chamado com o histórico, o contexto e o diagnóstico interno, e as
 * ações (responder por e-mail, mudar status, marcar reclamação, nota interna).
 * Recebe dado puro do servidor; não importa nada que toque o banco.
 */

const COR_DO_STATUS: Record<string, string> = {
  aberto: "var(--painel-2)",
  andamento: "var(--painel-3)",
  resolvido: "var(--painel-1)",
};

function quando(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function Etiqueta({ texto, cor }: { texto: string; cor: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
      <span className="h-2 w-2 rounded-full" style={{ background: cor }} />
      {texto}
    </span>
  );
}

export function ChamadosDoSuporte({ chamados, status, abrir }: { chamados: ChamadoNoPainel[]; status: StatusDoChamado | null; abrir: string | null }) {
  const router = useRouter();
  const inicial = useMemo(() => {
    if (!abrir) return chamados[0]?.id ?? null;
    const n = Number(abrir.replace(/\D/g, ""));
    return chamados.find((c) => c.numero === n || c.id === abrir)?.id ?? chamados[0]?.id ?? null;
  }, [abrir, chamados]);
  const [aberto, setAberto] = useState<string | null>(inicial);
  const [resposta, setResposta] = useState("");
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const c = chamados.find((x) => x.id === aberto) ?? null;

  async function acao(corpo: Record<string, unknown>, ok: string) {
    if (!c) return;
    setOcupado(true);
    try {
      const r = await fetch(`/api/admin/chamados/${c.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      const d = (await r.json().catch(() => ({}))) as { error?: string; emailEnviado?: boolean };
      if (!r.ok) throw new Error(d.error ?? "Não deu certo.");
      toast.success(d.emailEnviado === false ? `${ok} (o e-mail ao cliente não saiu: confira o RESEND_API_KEY)` : ok);
      setResposta("");
      setNota("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não deu certo.");
    } finally {
      setOcupado(false);
    }
  }

  const ctx = (c?.contexto ?? {}) as { pagina?: string; projeto?: { id: string; nome: string | null } | null; videoId?: string; postId?: string; navegador?: string; tela?: string; plano?: string; email?: string };

  return (
    <section className="rounded-2xl border p-4 sm:p-5 min-w-0" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)", boxShadow: "var(--shadow)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          A fila
        </h2>
        <nav aria-label="Filtrar por status" className="inline-flex flex-wrap rounded-xl border p-1 gap-1" style={{ borderColor: "var(--border)" }}>
          {[null, ...STATUS].map((s) => {
            const ativo = s === status;
            return (
              <Link
                key={s ?? "todos"}
                href={s ? `/admin/chamados?status=${s}` : "/admin/chamados"}
                aria-current={ativo ? "true" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${ativo ? "bg-[var(--acento-forte)] text-white" : "text-[var(--text-muted)] hover:bg-[var(--realce-2)]"}`}
              >
                {s ? NOME_DO_STATUS[s] : "Todos"}
              </Link>
            );
          })}
        </nav>
      </div>

      {chamados.length === 0 ? (
        <div className="rounded-xl border border-dashed px-4 py-8 text-center" style={{ borderColor: "var(--border)", background: "var(--bg-input)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Nenhum chamado {status ? `"${NOME_DO_STATUS[status].toLowerCase()}"` : "ainda"}
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Quando alguém usar o botão Ajuda, o chamado aparece aqui e chega no seu e-mail.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <ul className="space-y-1.5 lg:max-h-[640px] lg:overflow-y-auto pr-1">
            {chamados.map((x) => {
              const ativo = x.id === aberto;
              return (
                <li key={x.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setAberto(x.id);
                      setResposta("");
                      setNota("");
                    }}
                    data-chamado={x.protocolo}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${ativo ? "" : "hover:bg-[var(--realce-2)]"}`}
                    style={{ borderColor: ativo ? "var(--acento-forte)" : "var(--border)", background: ativo ? "var(--realce-2)" : "transparent" }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold" style={{ color: "var(--text-primary)" }}>
                        {x.protocolo}
                      </span>
                      <Etiqueta texto={ehStatus(x.status) ? NOME_DO_STATUS[x.status] : x.status} cor={COR_DO_STATUS[x.status] ?? "var(--painel-neutro)"} />
                    </div>
                    <p className="mt-0.5 text-sm truncate" style={{ color: "var(--text-primary)" }}>
                      {x.texto}
                    </p>
                    <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
                      {ehCategoria(x.categoria) ? NOME_DA_CATEGORIA[x.categoria] : x.categoria}
                      {contaComoReclamacao(x) ? " · reclamação" : ""} · {x.cliente.nome ?? x.cliente.email} · {quando(x.criadoEm)}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>

          {c && (
            <article className="min-w-0 rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-input)" }} data-ficha-do-chamado={c.protocolo}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                    {c.protocolo} · {ehCategoria(c.categoria) ? NOME_DA_CATEGORIA[c.categoria] : c.categoria}
                    {c.codigo ? ` · ${c.codigo}` : ""}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {c.cliente.nome ?? "(sem nome)"} · {c.cliente.email} · {ctx.plano ?? "plano ?"} · aberto em {quando(c.criadoEm)}
                  </p>
                </div>
                <select
                  aria-label="Status do chamado"
                  value={c.status}
                  disabled={ocupado}
                  onChange={(e) => void acao({ acao: "status", status: e.target.value }, "Status atualizado.")}
                  className="rounded-lg border px-2 py-1.5 text-sm"
                  style={{ borderColor: "var(--border)", background: "var(--bg-elevated)", color: "var(--text-primary)" }}
                >
                  {STATUS.map((s) => (
                    <option key={s} value={s}>
                      {NOME_DO_STATUS[s]}
                    </option>
                  ))}
                </select>
              </div>

              <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-muted)" }}>
                <div className="min-w-0 truncate">
                  <dt className="inline font-semibold">Página: </dt>
                  <dd className="inline">{ctx.pagina ?? "?"}</dd>
                </div>
                <div className="min-w-0 truncate">
                  <dt className="inline font-semibold">Projeto: </dt>
                  <dd className="inline">{ctx.projeto ? `${ctx.projeto.nome ?? ""} (${ctx.projeto.id})` : "nenhum"}</dd>
                </div>
                {(ctx.videoId || ctx.postId) && (
                  <div className="min-w-0 truncate">
                    <dt className="inline font-semibold">{ctx.videoId ? "Vídeo: " : "Post: "}</dt>
                    <dd className="inline font-mono">{ctx.videoId ?? ctx.postId}</dd>
                  </div>
                )}
                <div className="min-w-0 truncate sm:col-span-2" title={ctx.navegador}>
                  <dt className="inline font-semibold">Navegador: </dt>
                  <dd className="inline">
                    {ctx.navegador ?? "?"}
                    {ctx.tela ? `, tela ${ctx.tela}` : ""}
                  </dd>
                </div>
              </dl>

              {c.temPrint && (
                <a href={`/api/suporte/chamados/${c.id}/print`} target="_blank" rel="noopener noreferrer" className="mt-3 block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/suporte/chamados/${c.id}/print`} alt={`Print do chamado ${c.protocolo}`} className="max-h-56 rounded-lg border object-contain" style={{ borderColor: "var(--border)" }} />
                </a>
              )}

              {c.diagnostico && (
                <details className="mt-3 rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
                  <summary className="cursor-pointer text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                    Diagnóstico interno (o cliente não vê)
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {c.diagnostico}
                  </pre>
                </details>
              )}

              <ol className="mt-4 space-y-2">
                {c.eventos.map((e) => {
                  const interno = e.tipo.endsWith(":interno");
                  const tipo = e.tipo.replace(":interno", "");
                  if (tipo === "status" || tipo === "reclamacao") {
                    return (
                      <li key={e.id} className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {quando(e.em)} · {e.autorNome ?? "?"}{" "}
                        {tipo === "status"
                          ? `mudou de ${ehStatus(e.de) ? NOME_DO_STATUS[e.de] : e.de} para ${ehStatus(e.para) ? NOME_DO_STATUS[e.para] : e.para}`
                          : `marcou reclamação: ${e.para}`}
                      </li>
                    );
                  }
                  const suporte = e.lado === "suporte";
                  return (
                    <li
                      key={e.id}
                      className="rounded-lg border px-3 py-2"
                      style={{
                        borderColor: interno ? "var(--marca-laranja)" : "var(--border)",
                        background: suporte ? "var(--bg-elevated)" : "transparent",
                        borderStyle: interno ? "dashed" : "solid",
                      }}
                    >
                      <p className="text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>
                        {interno ? "Nota interna" : suporte ? "Resposta do suporte" : tipo === "aberto" ? "Pedido do cliente" : "Mensagem do cliente"} · {e.autorNome ?? "?"} · {quando(e.em)}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm" style={{ color: "var(--text-primary)" }}>
                        {e.texto}
                      </p>
                    </li>
                  );
                })}
              </ol>

              <div className="mt-4">
                <label htmlFor="resposta-do-suporte" className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  Responder ao cliente (vai por e-mail)
                </label>
                <textarea
                  id="resposta-do-suporte"
                  value={resposta}
                  onChange={(e) => setResposta(e.target.value)}
                  rows={4}
                  className="mt-1.5 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  style={{ borderColor: "var(--border)", background: "var(--bg-elevated)", color: "var(--text-primary)" }}
                  placeholder="Escreva a resposta. O cliente recebe por e-mail e vê em Meus chamados."
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={ocupado || resposta.trim().length < 2}
                    onClick={() => void acao({ acao: "responder", texto: resposta }, "Resposta enviada ao cliente.")}
                    className="rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: "var(--acento-forte)" }}
                  >
                    Responder
                  </button>
                  <button
                    type="button"
                    disabled={ocupado || resposta.trim().length < 2}
                    onClick={() => void acao({ acao: "responder", texto: resposta, status: "resolvido" }, "Respondido e resolvido.")}
                    className="rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: "var(--marca-laranja-botao)" }}
                  >
                    Responder e resolver
                  </button>
                  <label className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
                    <input
                      type="checkbox"
                      checked={c.reclamacao}
                      disabled={ocupado}
                      onChange={(e) => void acao({ acao: "reclamacao", reclamacao: e.target.checked }, "Marcação atualizada.")}
                    />
                    Marcar como reclamação
                  </label>
                </div>
              </div>

              <div className="mt-4">
                <label htmlFor="nota-interna" className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  Nota interna (só o time vê)
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    id="nota-interna"
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border px-3 py-1.5 text-sm"
                    style={{ borderColor: "var(--border)", background: "var(--bg-elevated)", color: "var(--text-primary)" }}
                  />
                  <button
                    type="button"
                    disabled={ocupado || !nota.trim()}
                    onClick={() => void acao({ acao: "nota", texto: nota }, "Nota gravada.")}
                    className="rounded-lg border px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                    style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                  >
                    Gravar
                  </button>
                </div>
              </div>
            </article>
          )}
        </div>
      )}
    </section>
  );
}
