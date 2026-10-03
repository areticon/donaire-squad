import { Lock } from "lucide-react";
import { O_QUE_O_MEMBRO_FAZ } from "@/lib/equipe/regras";

/**
 * O AVISO DE LEITURA DO MEMBRO DA EQUIPE (01/10, acabamento).
 *
 * Aparece em cima do que o membro vê mas não muda (Configurações e
 * Treinamento do projeto, o setup). Diz QUEM muda, pelo nome, e o que ele
 * mesmo pode fazer, porque "você não tem permissão" sozinho manda a pessoa
 * procurar um botão que não existe. Sem "use client" e sem banco: serve à
 * página de servidor e ao componente de cliente.
 */
export function AvisoSoODono({ dono, oQue }: { dono: string; oQue: string }) {
  return (
    <div
      className="flex items-start gap-3 rounded-xl border px-4 py-3"
      style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
      role="note"
    >
      <Lock className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden />
      <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
        <strong style={{ color: "var(--text-primary)" }}>Somente leitura.</strong> Quem muda {oQue} é{" "}
        <strong style={{ color: "var(--text-primary)" }}>{dono}</strong>, que administra a conta. {O_QUE_O_MEMBRO_FAZ}
      </p>
    </div>
  );
}
