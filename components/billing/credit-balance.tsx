"use client";

import { useEffect, useState } from "react";
import { Loader2, TrendingDown, TrendingUp } from "lucide-react";

/**
 * Saldo e extrato de créditos.
 *
 * Mostra o extrato junto do saldo porque saldo sozinho gera a pergunta "onde
 * foi parar isso", e responder por suporte custa mais caro que mostrar.
 */

type Movimento = {
  id: string;
  amount: number;
  operation: string;
  note: string | null;
  balance: number;
  createdAt: string;
};

type Dados = {
  saldo: number;
  doPlano: number;
  resetadoEm: string | null;
  plano: string;
  extrato: Movimento[];
};

const NOMES: Record<string, string> = {
  campanha: "Campanha semanal",
  video_job: "Trabalho de vídeo",
  renovacao: "Renovação do plano",
  recarga: "Créditos extras",
  estorno: "Estorno",
};

export function CreditBalance() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    fetch("/api/credits")
      .then((r) => r.json())
      .then((d) => setDados(d))
      .catch(() => undefined)
      .finally(() => setCarregando(false));
  }, []);

  if (carregando) {
    return (
      <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
        <Loader2 className="w-4 h-4 animate-spin" />
        Carregando saldo
      </div>
    );
  }
  if (!dados) return null;

  const usado = Math.max(0, dados.doPlano - dados.saldo);
  const proporcao = dados.doPlano > 0 ? (dados.saldo / dados.doPlano) * 100 : 0;
  const acabando = dados.doPlano > 0 && proporcao < 20;

  return (
    <div
      className="rounded-xl border p-6"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div className="flex items-baseline justify-between gap-4 flex-wrap mb-2">
        <div>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Créditos disponíveis
          </p>
          <p className="text-4xl font-black" style={{ color: "var(--text-primary)" }}>
            {dados.saldo.toLocaleString("pt-BR")}
          </p>
        </div>
        {dados.doPlano > 0 && (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            de {dados.doPlano.toLocaleString("pt-BR")} do plano, {usado.toLocaleString("pt-BR")} usados
          </p>
        )}
      </div>

      {dados.doPlano > 0 && (
        <div
          className="h-2 rounded-full overflow-hidden mb-2"
          style={{ background: "var(--bg-primary)" }}
        >
          <div
            className="h-full transition-all"
            style={{
              width: `${Math.min(100, proporcao)}%`,
              background: acabando ? "#f97316" : "#22c55e",
            }}
          />
        </div>
      )}

      {acabando && (
        <p className="text-sm text-orange-400 mb-2">
          Seus créditos estão acabando. Uma campanha semanal completa consome
          cerca de 450.
        </p>
      )}

      {dados.extrato.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-semibold mb-2" style={{ color: "var(--text-muted)" }}>
            Últimos movimentos
          </p>
          <div className="space-y-1">
            {dados.extrato.slice(0, 8).map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-3 py-1.5 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {m.amount < 0 ? (
                    <TrendingDown className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                  ) : (
                    <TrendingUp className="w-3.5 h-3.5 text-green-400 shrink-0" />
                  )}
                  <span className="truncate" style={{ color: "var(--text-primary)" }}>
                    {NOMES[m.operation] ?? m.operation}
                    {m.note ? (
                      <span style={{ color: "var(--text-muted)" }}> ({m.note})</span>
                    ) : null}
                  </span>
                </div>
                <span
                  className="shrink-0 tabular-nums"
                  style={{ color: m.amount < 0 ? "var(--text-muted)" : "#22c55e" }}
                >
                  {m.amount > 0 ? "+" : ""}
                  {m.amount}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
