"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import type { Elegibilidade, PacoteNaTela } from "@/lib/credits/pacotes-de-credito";

/**
 * "COMPRAR MAIS CRÉDITOS" (06/10/2026), onde o saldo aparece.
 *
 * Fechado, é um botão ao lado do saldo. Abre sozinho quando o saldo está baixo
 * ou acabou, ou quando a pessoa chega por um atalho de compra (?comprar=1).
 * Quem não pode comprar vê o porquê no lugar dos pacotes: membro de equipe é
 * mandado ao dono, quem está em teste fica sabendo quando abre.
 *
 * Os números (créditos, ganho, o que rende) vêm prontos de
 * lib/credits/pacotes-de-credito.ts, pela rota /api/stripe/creditos.
 */

type Dados = { pacotes: PacoteNaTela[]; elegibilidade: Elegibilidade };

const n = (v: number) => v.toLocaleString("pt-BR");

export function ComprarCreditos({ abertoDeInicio, saldoZerado }: { abertoDeInicio: boolean; saldoZerado: boolean }) {
  const [aberto, setAberto] = useState(abertoDeInicio);
  const [dados, setDados] = useState<Dados | null>(null);
  const [comprando, setComprando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => setAberto((a) => a || abertoDeInicio), [abertoDeInicio]);

  useEffect(() => {
    let vivo = true;
    fetch("/api/stripe/creditos")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => vivo && d && setDados(d))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  async function comprar(pacoteId: string) {
    setComprando(pacoteId);
    setErro(null);
    try {
      const r = await fetch("/api/stripe/creditos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pacoteId }),
      });
      const d = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!r.ok || !d.url) throw new Error(d.error ?? "Não consegui abrir o pagamento agora.");
      window.location.href = d.url;
    } catch (e) {
      setErro((e as Error).message);
      setComprando(null);
    }
  }

  if (!dados) return null;
  const { elegibilidade, pacotes } = dados;

  // Membro de equipe: sem botão de compra, só a quem pedir.
  if (elegibilidade.motivo === "membro") {
    return (
      <p className="text-sm mt-3" style={{ color: "var(--text-muted)" }} data-comprar-creditos="membro">
        {elegibilidade.frase}
      </p>
    );
  }

  return (
    <div id="comprar-creditos" className="mt-4 scroll-mt-24" data-comprar-creditos={elegibilidade.pode ? "pode" : elegibilidade.motivo}>
      {!aberto ? (
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors hover:border-orange-500"
          style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
        >
          <Plus className="h-4 w-4" aria-hidden /> Comprar mais créditos
        </button>
      ) : (
        <section className="rounded-xl border p-4 sm:p-5" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              {saldoZerado ? "Seus créditos acabaram" : "Comprar mais créditos"}
            </h3>
            <button type="button" onClick={() => setAberto(false)} className="text-xs underline" style={{ color: "var(--text-muted)" }}>
              Fechar
            </button>
          </div>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Pagamento único, sem renovação. Os créditos entram no saldo assim que o pagamento é aprovado e somam ao que o plano repõe.
          </p>

          {!elegibilidade.pode ? (
            <p className="text-sm mt-3" style={{ color: "var(--marca-laranja-texto, #fb923c)" }}>
              {elegibilidade.frase}
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              {pacotes.map((p, i) => {
                const maior = i === pacotes.length - 1;
                return (
                  <div
                    key={p.id}
                    className="flex flex-col rounded-lg border p-4"
                    style={{ borderColor: maior ? "var(--accent-orange, #f97316)" : "var(--border)", background: "var(--bg-card)" }}
                    data-pacote={p.id}
                  >
                    <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>{p.nome}</p>
                    <p className="mt-1 text-2xl font-black tabular-nums" style={{ color: "var(--text-primary)" }}>
                      {n(p.creditos)} <span className="text-sm font-semibold">créditos</span>
                    </p>
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>R$ {n(p.reais)}</p>
                    {p.ganho ? (
                      <p className="mt-1 text-xs font-semibold" style={{ color: "#22c55e" }}>{p.ganho}</p>
                    ) : (
                      <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>O pacote de entrada</p>
                    )}
                    <p className="mt-2 text-xs leading-snug flex-1" style={{ color: "var(--text-muted)" }}>
                      Rende cerca de {p.rende}.
                    </p>
                    <button
                      type="button"
                      disabled={comprando !== null}
                      onClick={() => void comprar(p.id)}
                      className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-60"
                      style={{ background: maior ? "var(--accent-orange, #f97316)" : "var(--azul-600, #2563eb)" }}
                    >
                      {comprando === p.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                      Comprar por R$ {n(p.reais)}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {erro && <p className="text-sm mt-3" style={{ color: "#f87171" }}>{erro}</p>}
          {elegibilidade.pode && (
            <p className="text-[11px] mt-3 leading-snug" style={{ color: "var(--text-muted)" }}>
              Como contamos: uma gravação de 30 minutos com a semana sugerida (vídeo completo, 3 cortes e as peças) e cada corte vertical a mais, no preço que a tela de envio mostra.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
