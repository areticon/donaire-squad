"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { BotaoDescartar } from "@/components/ui/descartar";

/**
 * O INTERRUPTOR DOS E-MAILS DE AVISO (02/10/2026). Desligado, a pessoa deixa
 * de receber por e-mail o aviso de vídeo pronto; os pedidos de aprovação
 * (roteiro, peças da semana) continuam chegando, porque sem eles o trabalho
 * para esperando por ela. O sino da plataforma recebe tudo, sempre.
 */
export function AvisosPorEmail({ inicial }: { inicial: boolean }) {
  const [ligado, setLigado] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function trocar() {
    const novo = !ligado;
    setLigado(novo);
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch("/api/notificacoes/preferencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailsDeAviso: novo }),
      });
      if (!r.ok) throw new Error();
    } catch {
      setLigado(!novo);
      setErro("Não consegui salvar agora. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="rounded-xl border p-6" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }} data-secao="avisos-por-email">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <Mail className="w-5 h-5 mt-0.5 shrink-0 text-orange-400" />
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Avisos por e-mail
            </p>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-muted)" }}>
              {ligado
                ? "Ligado: avisamos por e-mail quando o vídeo fica pronto e quando algo precisa da sua aprovação."
                : "Desligado: por e-mail, só os pedidos de aprovação (roteiro e peças da semana). O resto fica no sino."}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Pedidos de aprovação chegam sempre: sem eles o trabalho fica parado esperando você.
            </p>
            {/* O interruptor já voltou ao que estava: o X só tira a frase (07/10). */}
            {erro && (
              <p className="flex items-start gap-1 text-xs mt-2 text-orange-400">
                <span className="flex-1">{erro}</span>
                <BotaoDescartar compacto aoDescartar={() => setErro(null)} className="-my-1" />
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={ligado}
          aria-label="Avisos por e-mail que não são de aprovação"
          onClick={() => void trocar()}
          disabled={salvando}
          className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60"
          style={{ background: ligado ? "var(--marca-laranja-botao)" : "var(--border)" }}
        >
          <span
            className="inline-block h-5 w-5 rounded-full bg-white shadow transition-transform"
            style={{ transform: `translateX(${ligado ? 22 : 2}px)` }}
          />
        </button>
      </div>
    </section>
  );
}
