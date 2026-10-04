"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import type { CadastroDoGemeo } from "@/lib/media/gemeo";
import { situacaoDoGemeo, type SituacaoDoGemeo } from "@/lib/media/gemeo-situacao";
import { ConfirmacaoDoGemeo } from "@/components/gemeo/confirmacao-do-gemeo";

/**
 * O GÊMEO NAS CONFIGURAÇÕES DO PROJETO (03/10/2026).
 *
 * O pedido do Bruno: "precisa estar nas configurações". O estado do gêmeo,
 * numa frase, com o passo que falta à mão (confirmar no gerador, ou pedir um
 * link novo) e a porta para a tela inteira do gêmeo. A leitura do estado é a
 * mesma do selo do topo e dos avisos (`lib/media/gemeo-situacao.ts`).
 *
 * Componente de cliente puro: o cadastro desce do servidor já sem ids de
 * fornecedor (`cadastroParaTela`).
 */

function Icone({ s }: { s: SituacaoDoGemeo }) {
  if (s.tom === "ok") return <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />;
  if (s.tom === "erro") return <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />;
  if (s.tom === "espera") return <ShieldCheck className="h-5 w-5 shrink-0 text-orange-400" />;
  if (s.tom === "andando") return <Loader2 className="h-5 w-5 shrink-0 animate-spin text-orange-400" />;
  if (s.fase === "sem-gemeo") return <Sparkles className="h-5 w-5 shrink-0 text-orange-400" />;
  return <Clock className="h-5 w-5 shrink-0" style={{ color: "var(--text-muted)" }} />;
}

export function GemeoNasConfiguracoes({ projectId, cadastro }: { projectId: string; cadastro: CadastroDoGemeo | null }) {
  const [cad, setCad] = useState(cadastro);
  const s = situacaoDoGemeo(cad);
  const espera = s.fase === "falta-um-passo" || s.fase === "link-vencido";
  const rotulo = s.fase === "sem-gemeo" ? "Criar o meu gêmeo" : s.fase === "pronto" || s.fase === "reserva" ? "Gerar um vídeo com o gêmeo" : "Abrir a tela do gêmeo";

  return (
    <section className="flex flex-col gap-5 rounded-xl border p-6" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div>
        <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
          Gêmeo digital
        </h2>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
          O seu rosto e a sua voz falando os roteiros da linha editorial, para as semanas sem tempo de gravar.
        </p>
      </div>

      <div
        className="flex items-start gap-3 rounded-lg border px-4 py-3.5"
        style={{ background: "var(--bg-elevated)", borderColor: espera ? "rgb(249 115 22 / 0.55)" : s.tom === "ok" ? "rgb(34 197 94 / 0.4)" : "var(--border)" }}
      >
        <Icone s={s} />
        <div className="flex min-w-0 flex-col gap-2.5">
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {s.titulo}
            </p>
            <p className="mt-0.5 text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
              {s.texto}
            </p>
          </div>
          <ConfirmacaoDoGemeo projectId={projectId} situacao={s} onRenovou={(c) => c && setCad(c)} />
        </div>
      </div>

      <Link
        href={`/projects/${projectId}/gemeo`}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors hover:border-orange-500"
        style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
      >
        {rotulo} <ArrowRight className="h-4 w-4" />
      </Link>
    </section>
  );
}
