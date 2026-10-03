"use client";

import { useState } from "react";
import { signOut } from "@/lib/auth/client";

/**
 * SAIR, na tela de equipe pausada (01/10, acabamento). O membro não tem o que
 * fazer ali até o dono reativar; a única ação útil é trocar de conta. Sem
 * banco, como todo componente de cliente.
 */
export function SairDaConta() {
  const [saindo, setSaindo] = useState(false);
  async function sair() {
    setSaindo(true);
    try {
      await signOut();
    } finally {
      window.location.href = "/sign-in";
    }
  }
  return (
    <button
      type="button"
      onClick={sair}
      disabled={saindo}
      className="inline-flex h-11 w-full items-center justify-center rounded-lg border px-6 text-sm font-medium disabled:opacity-60"
      style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
    >
      {saindo ? "Saindo..." : "Sair e entrar com outra conta"}
    </button>
  );
}
