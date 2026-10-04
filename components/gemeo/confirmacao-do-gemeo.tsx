"use client";

import { useState } from "react";
import { Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import type { CadastroDoGemeo } from "@/lib/media/gemeo";
import type { SituacaoDoGemeo } from "@/lib/media/gemeo-situacao";

/**
 * O BOTÃO DO PASSO QUE FALTA (03/10/2026): "Confirmar no gerador de vídeo"
 * enquanto o link vale, com o prazo, e "Pedir um link novo" quando venceu.
 * O mesmo nas Configurações do projeto e na tela do gêmeo, para a pessoa
 * aprovar de onde estiver.
 *
 * Componente de cliente puro: só fala com a rota do gêmeo.
 */
export function ConfirmacaoDoGemeo({
  projectId,
  situacao,
  somenteLeitura = false,
  onRenovou,
}: {
  projectId: string;
  situacao: SituacaoDoGemeo;
  /** Membro da equipe: vê o estado, mas a confirmação é de quem gravou. */
  somenteLeitura?: boolean;
  onRenovou?: (cadastro: CadastroDoGemeo | null) => void;
}) {
  const [pedindo, setPedindo] = useState(false);

  async function pedirLinkNovo() {
    setPedindo(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/gemeo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "link-novo" }),
      });
      const d = (await r.json().catch(() => ({}))) as { cadastro?: CadastroDoGemeo | null; error?: string };
      if (!r.ok) throw new Error(d.error ?? "Não consegui pedir um link novo agora.");
      toast.success("Link novo pronto. Ele vale por 24 horas.");
      onRenovou?.(d.cadastro ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui pedir um link novo agora.");
    } finally {
      setPedindo(false);
    }
  }

  if (somenteLeitura) return null;
  if (situacao.fase === "falta-um-passo" && situacao.confirmarUrl) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={situacao.confirmarUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-orange-500 px-3.5 py-2 text-sm font-semibold text-white hover:bg-orange-600"
        >
          <ShieldCheck className="h-4 w-4" /> Confirmar no gerador de vídeo
        </a>
        {situacao.prazo && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            O link vale até {situacao.prazo}.
          </span>
        )}
      </div>
    );
  }
  if (situacao.fase === "link-vencido") {
    return (
      <button
        type="button"
        onClick={pedirLinkNovo}
        disabled={pedindo}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-orange-500 px-3.5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
      >
        {pedindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Pedir um link novo
      </button>
    );
  }
  return null;
}
