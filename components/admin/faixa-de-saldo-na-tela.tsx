"use client";

import { AlertTriangle } from "lucide-react";
import { BotaoDescartar, useDescartes } from "@/components/ui/descartar";
import { chaveDoSaldoDoFornecedor } from "@/lib/avisos/chaves";

/** Um incidente de saldo aberto, pronto para a tela (montado no servidor). */
export type IncidenteNaTela = {
  id: string;
  nome: string;
  recarga: string;
  desde: string;
  ocorrencias: number;
  oQuePara: string;
  onde: string[];
};

/**
 * O INVÓLUCRO DE CLIENTE DA FAIXA DE SALDO (07/10/2026). A faixa é crítica: o
 * "Recarregar" é a única porta da recarga no painel. Por isso o X RECOLHE por
 * incidente: sai a frase longa e fica a linha "<fornecedor> sem saldo" com o
 * botão, sem cor de alerta. A chave é o id do incidente, então um incidente
 * novo traz o destaque de volta. Ver components/admin/faixa-de-saldo.tsx.
 */
export function FaixaDeSaldoNaTela({ itens }: { itens: IncidenteNaTela[] }) {
  const descartes = useDescartes();
  const chave = (i: IncidenteNaTela) => chaveDoSaldoDoFornecedor(i.id);
  const abertos = itens.filter((i) => !descartes.ehDescartado(chave(i)));
  const recolhidos = itens.filter((i) => descartes.ehDescartado(chave(i)));
  const recarregar = (i: IncidenteNaTela) => (
    <a
      href={i.recarga}
      target="_blank"
      rel="noopener noreferrer"
      className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700"
    >
      Recarregar
    </a>
  );

  return (
    <div className="space-y-2">
      {abertos.length > 0 && (
        <section
          role="alert"
          className="rounded-2xl border px-4 py-3 space-y-3"
          style={{ borderColor: "rgb(239 68 68 / 0.45)", background: "rgb(239 68 68 / 0.08)" }}
          data-lista-de-avisos
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {abertos.length === 1 ? "Um fornecedor de IA está sem saldo" : `${abertos.length} fornecedores de IA estão sem saldo`}
            </p>
          </div>
          <ul className="space-y-2">
            {abertos.map((inc) => (
              <li key={inc.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1 text-sm" style={{ color: "var(--text-primary)" }}>
                  <p id={`saldo-${inc.id}`}>
                    <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                      {inc.nome}
                    </span>{" "}
                    sem saldo desde {inc.desde}, {inc.ocorrencias} recusa(s).
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    Parado: {inc.oQuePara}
                    {inc.onde.length ? ` Onde bateu: ${inc.onde.join("; ")}.` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {recarregar(inc)}
                  <BotaoDescartar chave={chave(inc)} descricaoId={`saldo-${inc.id}`} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {recolhidos.map((inc) => (
        <div
          key={inc.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2 text-sm"
          style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
          data-saldo-recolhido
        >
          <span>{inc.nome} sem saldo</span>
          {recarregar(inc)}
        </div>
      ))}
    </div>
  );
}
