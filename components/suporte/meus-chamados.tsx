"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { LifeBuoy, MessageCircle } from "lucide-react";
import { abrirChamado } from "@/lib/suporte/abrir-chamado";
import { NOME_DA_CATEGORIA, NOME_DO_STATUS, ehCategoria, ehStatus, linkDoWhatsapp, type ChamadoNaTela } from "@/lib/suporte/regras";

/**
 * A LISTA "MEUS CHAMADOS" (02/10/2026). Recebe dado puro do servidor; o
 * complemento da pessoa vai para /api/suporte/chamados/[id]/mensagem. Não
 * importa nada que toque o banco.
 */

const COR: Record<string, string> = { aberto: "var(--painel-2)", andamento: "var(--painel-3)", resolvido: "var(--painel-1)" };

function quando(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function MeusChamados({ chamados, whatsapp }: { chamados: ChamadoNaTela[]; whatsapp: string | null }) {
  const router = useRouter();
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState<string | null>(null);

  async function complementar(id: string) {
    const texto = (textos[id] ?? "").trim();
    if (texto.length < 2) return;
    setEnviando(id);
    try {
      const r = await fetch(`/api/suporte/chamados/${id}/mensagem`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto }) });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(d.error ?? "Não consegui enviar.");
      setTextos((t) => ({ ...t, [id]: "" }));
      toast.success("Mensagem enviada ao suporte.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui enviar.");
    } finally {
      setEnviando(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => abrirChamado()}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
          style={{ background: "var(--marca-laranja-botao)" }}
        >
          <LifeBuoy className="h-4 w-4" />
          Abrir um chamado
        </button>
      </div>

      {chamados.length === 0 && (
        <div className="rounded-2xl border border-dashed px-4 py-10 text-center" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Você ainda não abriu nenhum chamado
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Quando precisar de ajuda, use o botão acima ou o Ajuda no menu.
          </p>
        </div>
      )}

      {chamados.map((c) => (
        <article
          key={c.id}
          data-meu-chamado={c.protocolo}
          className="rounded-2xl border p-4 sm:p-5"
          style={{ borderColor: "var(--border)", background: "var(--bg-elevated)", boxShadow: "var(--shadow)" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-sm font-bold" style={{ color: "var(--text-primary)" }}>
              Chamado {c.protocolo}
            </p>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
              <span className="h-2 w-2 rounded-full" style={{ background: COR[c.status] ?? "var(--painel-neutro)" }} />
              {ehStatus(c.status) ? NOME_DO_STATUS[c.status] : c.status}
            </span>
          </div>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {ehCategoria(c.categoria) ? NOME_DA_CATEGORIA[c.categoria] : c.categoria}
            {c.codigo ? ` · código ${c.codigo}` : ""} · aberto em {quando(c.criadoEm)}
            {c.temPrint ? " · com print" : ""}
          </p>

          <ol className="mt-3 space-y-2">
            {c.eventos.map((e) =>
              e.tipo === "status" ? (
                <li key={e.id} className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {quando(e.em)}: situação mudou para {ehStatus(e.para) ? NOME_DO_STATUS[e.para].toLowerCase() : e.para}
                </li>
              ) : (
                <li
                  key={e.id}
                  className="rounded-xl border px-3 py-2"
                  style={{ borderColor: "var(--border)", background: e.lado === "suporte" ? "var(--realce-2)" : "var(--bg-input)" }}
                >
                  <p className="text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>
                    {e.lado === "suporte" ? "Suporte Demandou" : "Você"} · {quando(e.em)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm" style={{ color: "var(--text-primary)" }}>
                    {e.texto}
                  </p>
                </li>
              )
            )}
          </ol>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={textos[c.id] ?? ""}
              onChange={(e) => setTextos((t) => ({ ...t, [c.id]: e.target.value }))}
              placeholder={c.status === "resolvido" ? "Não resolveu? Escreva aqui e o chamado reabre." : "Quer acrescentar algo? Escreva aqui."}
              aria-label={`Mensagem para o chamado ${c.protocolo}`}
              className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--bg-input)", color: "var(--text-primary)" }}
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={enviando === c.id || (textos[c.id] ?? "").trim().length < 2}
                onClick={() => void complementar(c.id)}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "var(--acento-forte)" }}
              >
                {enviando === c.id ? "Enviando..." : "Enviar"}
              </button>
              {whatsapp && c.status !== "resolvido" && (
                <a
                  href={linkDoWhatsapp(whatsapp, c.protocolo, c.texto)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-white"
                  style={{ background: "#1f8f4e" }}
                  title="Falar com uma pessoa pelo WhatsApp sobre este chamado"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </a>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
