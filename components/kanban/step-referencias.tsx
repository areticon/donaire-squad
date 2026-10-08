"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { AvisoDescartavel } from "@/components/ui/descartar";
import { chaveDaDica } from "@/lib/avisos/chaves";
import { AnalisesDasReferencias } from "@/components/editorial/analises-das-referencias";
import type { RespostaDasAnalises } from "@/lib/referencias/tipos-das-analises";

/**
 * O PASSO "REFERÊNCIAS" DA CRIAÇÃO DO PROJETO (02/10/2026).
 *
 * Pedido do Bruno: o estudo das referências "teria que estar também na
 * criação do projeto, para entender o estilo da arte, que tipo de post, qual
 * funciona mais". Aqui o Roberto descobre os perfis do nicho, estuda os
 * posts, mostra os achados com número e fonte, propõe as regras e busca as
 * tendências da semana.
 *
 * NÃO TRAVA A CRIAÇÃO: o trabalho roda no servidor (lib/referencias/analise.ts)
 * e leva alguns minutos; a pessoa pode seguir para a ativação e aprovar as
 * regras depois, em Linha editorial, Perfis de referência. O pedido já sai
 * quando a pessoa deixa a etapa de voz (kanban-board.tsx), para estar pronto
 * aqui; se não saiu (projeto antigo, edição do setup), sai ao abrir este passo.
 */
export function StepReferencias({ projectId }: { projectId: string }) {
  const [estado, setEstado] = useState<"verificando" | "pronto" | "desligado">("verificando");
  const pediu = useRef(false);

  useEffect(() => {
    if (pediu.current) return;
    pediu.current = true;
    (async () => {
      const r = await fetch(`/api/projects/${projectId}/referencias/analises`).catch(() => null);
      const d = r?.ok ? ((await r.json()) as RespostaDasAnalises) : null;
      if (!d || !d.ligado) {
        setEstado(d ? "desligado" : "pronto");
        return;
      }
      // Sem pedido nenhum e sem nada estudado: pede agora (só o dono pode).
      if (d.podeEditar && !d.estado && !d.achados.length) {
        await fetch(`/api/projects/${projectId}/referencias/analises`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "comecar", tipo: "criacao", origem: "criacao" }),
        }).catch(() => null);
      }
      setEstado("pronto");
    })();
  }, [projectId]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="mb-1 flex items-center gap-2 text-xl font-bold text-[var(--text-primary)]">
          <Search className="h-5 w-5 text-pink-500" />
          As regras do seu time
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          Do estudo das suas referências saem regras para o squad (como abrir, como fechar, que formato usar), cada uma com o número e o post de onde
          ela saiu. Só a que você aprovar passa a valer, e vale até você desligar. As tendências da semana que combinam com você aparecem aqui também.
          Não trava nada: pode seguir e aprovar depois, em Linha editorial.
        </p>
      </div>
      {estado === "verificando" && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Preparando o estudo...
        </div>
      )}
      {estado === "desligado" && (
        <AvisoDescartavel chave={chaveDaDica("estudo-desligado", projectId)} className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          O estudo de referências está desligado nesta conta. Pode seguir: quando ele for ligado, as análises aparecem em Linha editorial.
        </AvisoDescartavel>
      )}
      {estado === "pronto" && <AnalisesDasReferencias projectId={projectId} modo="criacao" />}
    </div>
  );
}
