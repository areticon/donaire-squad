"use client";

import { useEffect, useState } from "react";
import { Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { fraseDosCreditosDaEquipe } from "@/lib/equipe/regras";
import { creditosDaNota } from "@/lib/credits/nota-simulada";
import { ComprarCreditos } from "@/components/billing/comprar-creditos";
import { BotaoDescartar, Descartavel } from "@/components/ui/descartar";
import { chaveDaCompraAutomatica, chaveDosCreditosAcabando } from "@/lib/avisos/chaves";

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
  /** Membro da equipe (01/10): o saldo é da conta do dono, e quem repõe é ele. */
  equipe?: { dono: string } | null;
  /** Só admin (03/10): o que o ciclo teria cobrado, somado das linhas de valor zero. */
  consumoSimulado?: { total: number; desde: string; porOperacao: Array<{ operacao: string; creditos: number }> } | null;
  /** A última recarga da conta (07/10): a marca dos avisos de saldo baixo. */
  ultimaRecarga?: string | null;
};

const NOMES: Record<string, string> = {
  campanha: "Campanha semanal",
  video_job: "Trabalho de vídeo",
  renovacao: "Renovação do plano",
  recarga: "Créditos extras",
  // 06/10: crédito dado pelo time da Demandou, e o acerto de saldo da conta.
  concessao_admin: "Créditos concedidos",
  reset_de_saldo: "Acerto de saldo",
  compra_creditos: "Pacote de créditos",
  estorno: "Estorno",
  // A primeira parte devolvida quando a gravação não rende trecho (01/10).
  estorno_roteiro: "Estorno da gravação",
  // Linha de valor zero, uma por gravação aceita (30/09): é a contagem da cota
  // do plano, escrita onde o cliente já confere o consumo.
  gravacao_enviada: "Gravação do mês",
  // As operações que aparecem no consumo simulado do admin (03/10).
  video_aprovacao: "Aprovação do vídeo",
  video_roteiro: "Roteiro do vídeo",
  gemeo_video: "Vídeo do gêmeo",
  video_ia: "Vídeo por IA",
  levar_para_outra_rede: "Levar para outra rede",
  reescrever_campo: "Reescrita de texto",
  roteiro_nova_ideia: "Roteiro de nova ideia",
};

export function CreditBalance() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(true);

  // A volta do checkout do pacote (?creditos=ok) e o atalho de compra
  // (?comprar=1, da barra lateral e da janela da campanha), 06/10.
  // Lido no primeiro render do navegador; no servidor fica falso, e nada disso
  // aparece antes de o saldo carregar, então não há diferença na hidratação.
  /** "Pagamento recebido" fechado pelo X (07/10): só local, e o ?creditos=ok sai da URL. */
  const [pagoFechado, setPagoFechado] = useState(false);
  const [volta] = useState<{ pago: boolean; comprar: boolean }>(() => {
    if (typeof window === "undefined") return { pago: false, comprar: false };
    const q = new URLSearchParams(window.location.search);
    return { pago: q.get("creditos") === "ok", comprar: q.get("comprar") === "1" };
  });

  useEffect(() => {
    const ler = () =>
      fetch("/api/credits")
        .then((r) => r.json())
        .then((d) => setDados(d))
        .catch(() => undefined)
        .finally(() => setCarregando(false));
    void ler();
    // O crédito entra pelo webhook, segundos depois da volta: lê de novo.
    if (volta.pago) {
      const t = setTimeout(() => void ler(), 5000);
      return () => clearTimeout(t);
    }
  }, [volta.pago]);

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
            {dados.equipe ? `Créditos da equipe, na conta de ${dados.equipe.dono}` : "Créditos disponíveis"}
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
              background: acabando ? "var(--marca-laranja)" : "#22c55e",
            }}
          />
        </div>
      )}

      {/* Membro da equipe (01/10, acabamento): sem saldo, a frase diz a quem
          pedir; acabando, avisa sem mandar comprar. */}
      {dados.equipe && dados.saldo <= 0 ? (
        <p className="text-sm text-orange-400 mb-2">{fraseDosCreditosDaEquipe(dados.equipe.dono)}</p>
      ) : acabando && (dados.equipe || dados.saldo > 0) ? (
        // Descartável (07/10), lembrado até a próxima recarga.
        <Descartavel chave={chaveDosCreditosAcabando(dados.ultimaRecarga ?? "sem-recarga")}>
          <div className="flex items-start gap-1 mb-2">
            <p className="flex-1 text-sm text-orange-400">
              {dados.equipe ? "Os créditos da equipe estão acabando." : "Seus créditos estão acabando."} Uma campanha semanal completa consome
              cerca de 450.
            </p>
            <BotaoDescartar compacto />
          </div>
        </Descartavel>
      ) : null}

      {volta.pago && !pagoFechado && (
        <div className="flex items-start gap-1 mb-2" data-volta-do-pacote>
          <p className="flex-1 text-sm" style={{ color: "#22c55e" }}>
            Pagamento recebido. Os créditos do pacote entram no saldo em instantes, e o recibo vai para o seu e-mail.
          </p>
          <BotaoDescartar
            compacto
            aoDescartar={() => {
              setPagoFechado(true);
              // Sem o ?creditos=ok na URL, recarregar não traz o aviso de volta.
              const u = new URL(window.location.href);
              if (u.searchParams.has("creditos")) {
                u.searchParams.delete("creditos");
                window.history.replaceState(window.history.state, "", u.toString());
              }
            }}
          />
        </div>
      )}

      {/* OS PACOTES AVULSOS (06/10): o botão mora onde o saldo aparece e abre
          sozinho quando o saldo está baixo ou acabou. Membro sem saldo já leu
          acima a quem pedir; não repete. */}
      {!(dados.equipe && dados.saldo <= 0) && (
        <ComprarCreditos
          abertoDeInicio={volta.comprar || (!dados.equipe && (acabando || dados.saldo <= 0))}
          saldoZerado={dados.saldo <= 0}
          chaveDoAutomatico={
            !volta.comprar && !dados.equipe && (acabando || dados.saldo <= 0)
              ? chaveDaCompraAutomatica(dados.ultimaRecarga ?? "sem-recarga", dados.saldo <= 0 ? "zerado" : "acabando")
              : null
          }
        />
      )}

      {/* O CONSUMO SIMULADO DO ADMIN (03/10): só com ADMIN_SEM_DEBITO=1 desde
          06/10, quando o saldo do admin não se move. */}
      {dados.consumoSimulado && (
        <div className="mt-4 rounded-lg border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }} data-consumo-simulado>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Consumido no ciclo (simulado), desde{" "}
            {new Date(dados.consumoSimulado.desde).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
          </p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
            {dados.consumoSimulado.total.toLocaleString("pt-BR")} créditos
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            Acesso interno não desconta do saldo. É a soma do que cada operação teria cobrado.
          </p>
          {dados.consumoSimulado.porOperacao.length > 0 && (
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5 text-xs">
              {dados.consumoSimulado.porOperacao.slice(0, 8).map((o) => (
                <div key={o.operacao} className="flex justify-between gap-3">
                  <span className="truncate" style={{ color: "var(--text-muted)" }}>{NOMES[o.operacao] ?? o.operacao}</span>
                  <span className="tabular-nums" style={{ color: "var(--text-primary)" }}>{o.creditos.toLocaleString("pt-BR")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
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
                  {m.amount < 0 || creditosDaNota(m.note) > 0 ? (
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
                  {m.amount === 0 && creditosDaNota(m.note) > 0
                    ? `(−${creditosDaNota(m.note).toLocaleString("pt-BR")})`
                    : `${m.amount > 0 ? "+" : ""}${m.amount}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
