"use client";

import { useState } from "react";
import type { FichaDoCliente } from "@/lib/admin/crm";

/**
 * CONCEDER CRÉDITOS, na ficha da conta do admin (06/10/2026).
 *
 * Componente próprio, e não mais um bloco dentro de crm-clientes.tsx, para a
 * ação viver separada do resto do painel (que está sendo redesenhado em outra
 * frente). As regras moram em lib/admin/conceder-creditos.ts.
 *
 * A CHAVE DO PEDIDO nasce quando o formulário abre e só muda depois de um
 * sucesso: o clique duplo, a rede que repete o envio e o "tentar de novo"
 * depois de um erro mandam a MESMA chave, e o servidor credita uma vez só.
 */

const fraco = { color: "var(--text-muted)" } as const;
const forte = { color: "var(--text-primary)" } as const;
const entrada = { borderColor: "var(--border)", color: "var(--text-primary)" } as const;
const campo = "w-full rounded-lg border px-3 py-2 text-sm bg-transparent focus:outline-none focus:border-orange-500";

function novaChave(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

type Resposta = {
  ok?: boolean;
  error?: string;
  duplicado?: boolean;
  contaEmail?: string;
  viaDono?: string | null;
  saldo?: number;
  ficha?: FichaDoCliente | null;
};

export function ConcederCreditos({
  userId,
  membroDe,
  aoConceder,
}: {
  userId: string;
  /** E-mail do dono quando a conta é membro de equipe: o crédito cai lá. */
  membroDe: string | null;
  aoConceder: (ficha: FichaDoCliente) => void;
}) {
  const [quantidade, setQuantidade] = useState("");
  const [motivo, setMotivo] = useState("");
  const [chave, setChave] = useState(novaChave);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ ok?: string; erro?: string }>({});

  const q = Number(quantidade.replace(/\D/g, ""));
  const pronto = q > 0 && motivo.trim().length >= 3;

  async function conceder() {
    if (ocupado || !pronto) return;
    setOcupado(true);
    setAviso({});
    try {
      const r = await fetch(`/api/admin/usuarios/${userId}/conceder-creditos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantidade: q, motivo, chave }),
      });
      const d = (await r.json().catch(() => ({}))) as Resposta;
      if (!r.ok) throw new Error(d.error ?? "Não consegui conceder agora.");
      if (d.ficha) aoConceder(d.ficha);
      const onde = d.viaDono ? ` na conta de ${d.viaDono}, que paga pela equipe` : "";
      setAviso({
        ok: d.duplicado
          ? "Esse pedido já tinha sido concedido. Nada foi somado de novo."
          : `${q.toLocaleString("pt-BR")} créditos concedidos${onde}. Saldo agora: ${(d.saldo ?? 0).toLocaleString("pt-BR")}.`,
      });
      setQuantidade("");
      setMotivo("");
      setChave(novaChave());
    } catch (err) {
      setAviso({ erro: (err as Error).message });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="border-t pt-4 mt-4" style={{ borderColor: "var(--border)" }} data-conceder-creditos>
      <h3 className="text-sm font-semibold mb-1" style={forte}>Conceder créditos</h3>
      <p className="text-xs mb-2" style={fraco}>
        Soma ao saldo com o motivo no extrato do cliente. Não é receita: não passa pelo Stripe.
        {membroDe ? ` Esta conta é membro da equipe de ${membroDe}: o crédito cai na conta dela.` : ""}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="conceder-quantidade"
          inputMode="numeric"
          value={quantidade}
          onChange={(e) => setQuantidade(e.target.value.replace(/\D/g, ""))}
          placeholder="Quantos créditos"
          aria-label="Quantos créditos conceder"
          className={`${campo} sm:max-w-[160px]`}
          style={entrada}
        />
        <input
          id="conceder-motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo (obrigatório, aparece no extrato)"
          aria-label="Motivo da concessão"
          maxLength={300}
          className={campo}
          style={entrada}
        />
      </div>
      <button
        type="button"
        disabled={ocupado || !pronto}
        onClick={() => void conceder()}
        className="mt-2 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
      >
        {ocupado ? "Concedendo..." : q > 0 ? `Conceder ${q.toLocaleString("pt-BR")} créditos` : "Conceder créditos"}
      </button>
      {aviso.ok && <p className="text-xs mt-2" style={{ color: "#4ade80" }}>{aviso.ok}</p>}
      {aviso.erro && <p className="text-xs mt-2" style={{ color: "#f87171" }}>{aviso.erro}</p>}
    </section>
  );
}
