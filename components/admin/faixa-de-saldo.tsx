import { AlertTriangle } from "lucide-react";
import { fornecedoresSemSaldo } from "@/lib/fornecedores/aviso-de-saldo";
import { FORNECEDORES } from "@/lib/fornecedores/saldo";

/**
 * A FAIXA DE "SEM SALDO" NO TOPO DO PAINEL (06/10/2026).
 *
 * Pedido do Bruno em 06/10: "estava sem crédito na API da OpenAI. Quando for
 * assim, me avise." O e-mail e o sino avisam uma vez a cada 6 h; esta faixa
 * fica no topo do painel ENQUANTO houver fornecedor zerado, com o link de
 * recarga de cada um, e some sozinha quando a primeira chamada passa de novo.
 *
 * Componente de SERVIDOR, separado de propósito: o painel é mexido por mais
 * de uma frente, e a faixa entra com uma linha só. Sem incidente aberto, não
 * desenha nada. Falha de leitura também não desenha nada: a faixa nunca pode
 * derrubar o painel.
 */
export async function FaixaDeSaldo() {
  const abertos = await fornecedoresSemSaldo();
  if (!abertos.length) return null;

  const quando = (d: Date) =>
    d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <section
      role="alert"
      className="rounded-2xl border px-4 py-3 space-y-3"
      style={{ borderColor: "rgb(239 68 68 / 0.45)", background: "rgb(239 68 68 / 0.08)" }}
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {abertos.length === 1 ? "Um fornecedor de IA está sem saldo" : `${abertos.length} fornecedores de IA estão sem saldo`}
        </p>
      </div>
      <ul className="space-y-2">
        {abertos.map((inc) => {
          const f = FORNECEDORES[inc.fornecedor];
          return (
            <li key={inc.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1 text-sm" style={{ color: "var(--text-primary)" }}>
                <p>
                  <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                    {f.nome}
                  </span>{" "}
                  sem saldo desde {quando(inc.desde)}, {inc.ocorrencias} recusa(s).
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  Parado: {f.oQuePara}
                  {inc.onde.length ? ` Onde bateu: ${inc.onde.slice(-3).join("; ")}.` : ""}
                </p>
              </div>
              <a
                href={f.recarga}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700"
              >
                Recarregar
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
