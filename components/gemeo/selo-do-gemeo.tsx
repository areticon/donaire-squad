"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { BotaoDescartar, useDescarte } from "@/components/ui/descartar";

/**
 * O SELO "FALTA UM PASSO NO GÊMEO" (03/10), descartável desde 07/10. O X fica
 * AO LADO do link, como irmão, e nunca dentro dele. A chave muda quando faltam
 * poucas horas para o link vencer ("...:lembrete"), e o selo volta. A
 * confirmação continua em /projects/[id]/gemeo (seção "Último passo"), em
 * Configurações > Gêmeo e no item do sino.
 */
export function SeloDoGemeo({ projectId, chave }: { projectId: string; chave: string | null }) {
  const { descartado } = useDescarte(chave);
  if (descartado) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5">
      <Link
        href={`/projects/${projectId}/gemeo#ultimo-passo`}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold text-orange-500 transition-colors hover:bg-orange-500/10"
        style={{ borderColor: "rgb(249 115 22 / 0.55)" }}
        title="O seu gêmeo digital espera você confirmar pela câmera"
        id="selo-do-gemeo"
      >
        <ShieldCheck className="h-3.5 w-3.5" />
        <span>
          Falta um passo<span className="hidden sm:inline"> no gêmeo</span>
        </span>
      </Link>
      <BotaoDescartar compacto chave={chave} descricaoId="selo-do-gemeo" />
    </span>
  );
}
