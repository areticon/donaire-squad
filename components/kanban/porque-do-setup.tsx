"use client";

import { Loader2, RefreshCw, Wand2 } from "lucide-react";
import { LinhaDeCusto } from "@/components/kanban/relatorio-do-perfil";
import type { CampoDoSetup, SetupSugerido } from "@/lib/referencias/tipos-do-perfil-proprio";

/**
 * O PORQUÊ DE CADA CAMPO PREENCHIDO PELO DIAGNÓSTICO (03/10/2026).
 *
 * Sem isto a pessoa chega numa etapa cheia de texto que ela não escreveu e não
 * sabe se pode confiar (a mesma lição da leitura dos documentos, 17/09). Cada
 * campo vem com a frase "vou treinar o time assim porque o diagnóstico
 * mostrou X". Campo que a pessoa já escreveu NÃO é trocado: ele ganha o botão
 * "Usar a sugestão", e a escolha é dela.
 */

const NOME_DO_CAMPO: Record<CampoDoSetup, string> = {
  niche: "Nicho",
  targetAudience: "Público",
  description: "Descrição",
  voice: "Voz",
  colorPalette: "Cores",
  postFrequency: "Frequência",
  references: "Referências",
  linhaEditorial: "Linha editorial",
};

export function PorqueDoSetup({
  setup,
  campos,
  form,
  set,
  montando,
  onRefazer,
}: {
  setup: SetupSugerido | null;
  campos: CampoDoSetup[];
  form: Record<string, string>;
  set: (campo: string, valor: string) => void;
  montando: boolean;
  onRefazer?: () => void;
}) {
  if (montando) {
    return (
      <div className="mb-5 flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[13px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Montando o seu setup a partir do estudo do seu perfil e das referências...
      </div>
    );
  }
  const itens = campos.filter((c) => setup?.porque[c] || setup?.campos[c]);
  if (!setup || !itens.length) return null;
  return (
    <div className="mb-5 rounded-xl border p-3" style={{ borderColor: "color-mix(in srgb, var(--painel-2) 40%, var(--border))", background: "var(--bg-elevated)" }}>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          <Wand2 className="h-4 w-4" style={{ color: "var(--painel-2)" }} />
          Preenchi a partir do seu diagnóstico. Leia e corrija o que não for do seu jeito.
        </p>
        {onRefazer && (
          <button type="button" onClick={onRefazer} className="inline-flex items-center gap-1 text-xs font-medium text-orange-500 hover:underline">
            <RefreshCw className="h-3 w-3" /> Refazer com o estudo mais novo
          </button>
        )}
      </div>
      <ul className="space-y-1.5">
        {itens.map((c) => {
          const sugerido = setup.campos[c];
          const diferente = sugerido && (form[c] ?? "").trim() && (form[c] ?? "").trim() !== sugerido.trim();
          return (
            <li key={c} className="text-[13px] leading-snug" style={{ color: "var(--text-muted)" }}>
              <b style={{ color: "var(--text-primary)" }}>{NOME_DO_CAMPO[c]}:</b> {setup.porque[c] ?? "veio do estudo do seu perfil."}
              {diferente && (
                <button type="button" onClick={() => set(c, sugerido!)} className="ml-1.5 text-xs font-medium text-orange-500 hover:underline">
                  Usar a sugestão
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-1.5">
        <LinhaDeCusto custo={setup.custo} rotulo="Custo da sugestão" />
      </div>
    </div>
  );
}
