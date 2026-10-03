"use client";

import { useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import toast from "react-hot-toast";

/**
 * O botão "Tentar a montagem de novo" (01/10/2026, parte 240), o mesmo no card
 * do vídeo completo, no card de cada corte e no aviso acima do quadro. Não
 * cobra nada: a rota /api/videos/[id]/tentar-montagem reaproveita o plano e
 * as imagens já pagos e devolve o trabalho ao cron.
 */
export function TentarMontagem({
  videoJobId,
  alvo,
  aoPedir,
  compacto = false,
}: {
  videoJobId: string;
  /** "completo" ou o índice do corte. */
  alvo: "completo" | number;
  aoPedir?: () => void;
  compacto?: boolean;
}) {
  const [pedindo, setPedindo] = useState(false);
  const [pedido, setPedido] = useState(false);

  const pedir = async () => {
    setPedindo(true);
    try {
      const r = await fetch(`/api/videos/${videoJobId}/tentar-montagem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(alvo === "completo" ? { alvo: "completo" } : { trecho: alvo }),
      });
      const d = (await r.json().catch(() => ({}))) as { mensagem?: string; error?: string };
      if (!r.ok) throw new Error(d.error ?? "Não consegui pedir a montagem de novo agora.");
      setPedido(true);
      toast.success(d.mensagem ?? "Pedimos a montagem de efeitos de novo, sem custo.");
      aoPedir?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui pedir a montagem de novo agora.");
    } finally {
      setPedindo(false);
    }
  };

  if (pedido) {
    return (
      <p className="flex items-center gap-2 text-xs" style={{ color: "#c084fc" }}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Montagem pedida de novo, sem custo. O card avisa quando terminar.
      </p>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void pedir()}
      disabled={pedindo}
      className={`inline-flex items-center gap-1.5 rounded-lg border font-medium transition-colors hover:border-orange-500/60 disabled:opacity-60 ${compacto ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"}`}
      style={{ borderColor: "var(--accent-orange)", color: "var(--accent-orange)" }}
    >
      {pedindo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
      Tentar a montagem de novo
    </button>
  );
}
