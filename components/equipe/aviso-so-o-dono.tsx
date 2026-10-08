"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { O_QUE_O_MEMBRO_FAZ } from "@/lib/equipe/regras";
import { BotaoDescartar, useDescarte } from "@/components/ui/descartar";
import { chaveDaDica } from "@/lib/avisos/chaves";

/**
 * O AVISO DE LEITURA DO MEMBRO DA EQUIPE (01/10, acabamento).
 *
 * Aparece em cima do que o membro vê mas não muda (Configurações e
 * Treinamento do projeto, o setup). Diz QUEM muda, pelo nome, e o que ele
 * mesmo pode fazer, porque "você não tem permissão" sozinho manda a pessoa
 * procurar um botão que não existe. Sem banco: serve à página de servidor e
 * ao componente de cliente.
 *
 * DESCARTÁVEL NO MODO RECOLHER (07/10): com o projeto e a tela, o X recolhe o
 * aviso num selo "Somente leitura", que abre o texto de novo no clique. O
 * descarte não muda a permissão: a tela continua inerte, e o membro nunca
 * fica sem saber por quê.
 */
export function AvisoSoODono({ dono, oQue, projectId, tela }: { dono: string; oQue: string; projectId?: string; tela?: string }) {
  const { descartado, descartar } = useDescarte(projectId && tela ? chaveDaDica("somente-leitura", projectId, tela) : null);
  const [aberto, setAberto] = useState(false);
  if (descartado && !aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
        style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        aria-expanded={false}
        data-somente-leitura-recolhido
      >
        <Lock className="h-3.5 w-3.5" aria-hidden />
        Somente leitura
      </button>
    );
  }
  return (
    <div
      className="flex items-start gap-3 rounded-xl border px-4 py-3"
      style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
      role="note"
    >
      <Lock className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden />
      <p className="flex-1 text-sm leading-relaxed" style={{ color: "var(--text-muted)" }} id="aviso-somente-leitura">
        <strong style={{ color: "var(--text-primary)" }}>Somente leitura.</strong> Quem muda {oQue} é{" "}
        <strong style={{ color: "var(--text-primary)" }}>{dono}</strong>, que administra a conta. {O_QUE_O_MEMBRO_FAZ}
      </p>
      {descartado ? (
        <BotaoDescartar rotulo="Recolher" aoDescartar={() => setAberto(false)} className="-my-2 -mr-2" />
      ) : (
        <BotaoDescartar aoDescartar={() => descartar()} descricaoId="aviso-somente-leitura" className="-my-2 -mr-2" />
      )}
    </div>
  );
}
