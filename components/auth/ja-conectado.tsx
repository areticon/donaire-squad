"use client";

import { useState } from "react";
import { signOut } from "@/lib/auth/client";

/**
 * A pessoa já tem sessão aberta e abriu a tela de login ou de cadastro.
 *
 * Existe para a troca de conta ter um caminho: sem ele, quem estava logado
 * numa conta errada (o Bruno, em 23/09, numa conta de teste) não conseguia
 * chegar ao formulário. Ver lib/auth/quem-ja-entrou.ts.
 */
export function JaConectado({ email, continuar }: { email: string; continuar: string }) {
  const [saindo, setSaindo] = useState(false);

  async function sair() {
    setSaindo(true);
    try {
      await signOut();
    } finally {
      // Recarrega a própria tela: sem sessão, ela mostra o formulário.
      window.location.reload();
    }
  }

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-[var(--shadow)] p-6 text-center">
      <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Você já está conectado</h2>
      <p className="text-sm text-[var(--text-muted)] leading-relaxed">
        Esta sessão é da conta <span className="text-[var(--text-primary)] font-medium break-all">{email}</span>.
      </p>
      <a
        href={continuar}
        className="mt-5 inline-block w-full rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
      >
        Continuar com esta conta
      </a>
      <button
        type="button"
        onClick={sair}
        disabled={saindo}
        className="mt-3 w-full rounded-lg border border-[var(--border)] py-2.5 text-sm text-[var(--text-primary)] hover:border-[var(--text-muted)] transition-colors disabled:opacity-60"
      >
        {saindo ? "Saindo..." : "Sair e entrar com outra conta"}
      </button>
    </div>
  );
}
