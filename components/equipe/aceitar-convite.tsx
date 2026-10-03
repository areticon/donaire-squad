"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * O BOTÃO DO ACEITE (01/10). Componente de cliente sem banco: fala com
 * /api/equipe/aceitar, que confere o e-mail da sessão e as travas do aceite.
 */
export function AceitarConvite({ token }: { token: string }) {
  const router = useRouter();
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aceitar() {
    setIndo(true);
    setErro(null);
    try {
      const r = await fetch("/api/equipe/aceitar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(d.error ?? "Não consegui aceitar agora.");
      router.replace("/dashboard");
      router.refresh();
    } catch (e) {
      setErro((e as Error).message);
      setIndo(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button variant="conversao" size="lg" className="w-full" onClick={() => void aceitar()} loading={indo}>
        Aceitar e entrar na equipe
      </Button>
      {erro && (
        <p role="alert" className="text-sm" style={{ color: "var(--marca-laranja-texto)" }}>
          {erro}
        </p>
      )}
    </div>
  );
}
