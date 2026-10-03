"use client";

import { useState } from "react";
import { Check, ExternalLink, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FUNDADOR, FUNDADOR_COBRANCA, GARANTIA_DIAS, PLANOS_PUBLICOS, fundadorBotao, fundadorVagas, mensalDoAnual, reais } from "@/lib/planos";
import { useVagasDeFundador } from "@/lib/use-vagas-de-fundador";
import type { Assinatura } from "@/lib/stripe/assinatura";
import toast from "react-hot-toast";

/**
 * Plano e cobrança, dentro das configurações da conta.
 *
 * A regra que este componente existe para cumprir: o que a pessoa PAGA vem do
 * Stripe, recebido pronto do servidor em `assinatura`. A tabela de planos só é
 * usada para desenhar as ofertas e para dizer o NOME do plano. Antes de 12/09
 * a tela lia `user.plan` e mostrava o preço de lista de hoje para quem pagava
 * o preço de ontem.
 */

function dataEmPortugues(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

export function PlanoECobranca({ assinatura }: { assinatura: Assinatura }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [cancelaNoFim, setCancelaNoFim] = useState(assinatura.cancelaNoFim);
  const vagasDeFundador = useVagasDeFundador();

  const proxima = dataEmPortugues(assinatura.proximaCobranca);
  const assina = Boolean(assinatura.subscriptionId);

  async function assinar(planId: string, ciclo?: "anual") {
    setLoading(ciclo ? `${planId}-anual` : planId);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, ciclo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.location.href = data.url;
    } catch {
      toast.error("Erro ao processar pagamento. Tente novamente.");
      setLoading(null);
    }
  }

  async function abrirPortal() {
    setLoading("portal");
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.location.href = data.url;
    } catch {
      toast.error("Erro ao abrir o portal de cobrança.");
      setLoading(null);
    }
  }

  async function cancelar(desfazer: boolean) {
    setLoading("cancelar");
    try {
      const res = await fetch("/api/stripe/cancelar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desfazer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCancelaNoFim(data.cancelaNoFim);
      toast.success(
        data.cancelaNoFim
          ? "Assinatura cancelada. Você continua com tudo até o fim do período pago."
          : "Assinatura reativada."
      );
    } catch {
      toast.error("Não consegui falar com o Stripe. Tente de novo.");
    } finally {
      setLoading(null);
    }
  }

  // ── Acesso interno ────────────────────────────────────────────────────────
  // Sem oferta, sem botão de assinar, sem barra de crédito. Quem não é cobrado
  // não precisa ver preço, e mostrar "Assinar" para o dono é a mesma mentira do
  // card 399 ao contrário.
  if (assinatura.admin) {
    return (
      <section
        className="rounded-xl border p-6"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-orange-500/10">
            <ShieldCheck className="h-5 w-5 text-orange-400" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-extrabold" style={{ color: "var(--text-primary)" }}>
                Acesso interno
              </h2>
              <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-orange-400">
                Admin da plataforma
              </span>
            </div>
            <p className="mt-1.5 text-sm" style={{ color: "var(--text-primary)" }}>
              Tudo liberado, <span className="font-bold">sem cobrança</span> e sem limite de créditos.
            </p>
            <p className="mt-0.5 text-[13px]" style={{ color: "var(--text-muted)" }}>
              Esta conta não tem assinatura e não vai ser cobrada. O consumo continua sendo medido
              para a conta de custo, só não é debitado de você.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Plano atual, lido do Stripe */}
      <section
        className="rounded-xl border p-6"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-orange-500/10">
              <Zap className="h-5 w-5 text-orange-400" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-xl font-extrabold" style={{ color: "var(--text-primary)" }}>
                  {assina ? (assinatura.nome ?? "Plano ativo") : "Nenhum plano ativo"}
                </h2>
                {assina && (
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                    style={{
                      color: cancelaNoFim ? "var(--badge-warning-text)" : "var(--badge-success-text)",
                      background: cancelaNoFim ? "var(--badge-warning-bg)" : "var(--badge-success-bg)",
                      border: `1px solid ${cancelaNoFim ? "var(--badge-warning-border)" : "var(--badge-success-border)"}`,
                    }}
                  >
                    {cancelaNoFim ? "Cancelada, ativa até o fim do período" : "Assinatura ativa"}
                  </span>
                )}
                {assinatura.status === "trialing" && (
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                    style={{
                      color: "var(--badge-warning-text)",
                      background: "var(--badge-warning-bg)",
                      border: "1px solid var(--badge-warning-border)",
                    }}
                  >
                    Em teste
                  </span>
                )}
              </div>

              {assina ? (
                <>
                  <p className="mt-1.5 text-sm" style={{ color: "var(--text-primary)" }}>
                    <span className="font-bold">
                      R$ {reais((assinatura.valorEmCentavos ?? 0) / 100)}
                    </span>{" "}
                    {assinatura.intervalo === "year" ? "por ano" : "por mês"}
                    {assinatura.cartaoFinal ? `, no cartão final ${assinatura.cartaoFinal}` : ""}
                  </p>
                  <p className="mt-0.5 text-[13px]" style={{ color: "var(--text-muted)" }}>
                    {proxima
                      ? cancelaNoFim
                        ? `Você continua com tudo até ${proxima}, o período que já está pago.`
                        : `Próxima cobrança em ${proxima}. Renova sozinha até você cancelar.`
                      : "A data da próxima cobrança está no portal de cobrança."}
                  </p>
                  {assinatura.precoTravado && (
                    <p className="mt-1 text-xs font-semibold text-orange-400">
                      Este é o seu preço travado. O valor de lista mudou e o seu não.
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-1.5 text-[13px]" style={{ color: "var(--text-muted)" }}>
                  Você ainda não tem assinatura. Escolha um plano abaixo para começar.
                </p>
              )}
            </div>
          </div>

          {assina && (
            <Button variant="outline" onClick={abrirPortal} loading={loading === "portal"}>
              <ExternalLink className="h-3.5 w-3.5" />
              Nota fiscal e cartão
            </Button>
          )}
        </div>
      </section>

      {/* Ofertas */}
      <section className="flex flex-col gap-3">
        <h3 className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>
          {assina ? "Mudar de plano" : "Escolher um plano"}
        </h3>

        <div className="grid items-start gap-4 md:grid-cols-2 lg:grid-cols-3">
          {PLANOS_PUBLICOS.map((plan) => {
            const atual = assina && plan.id === assinatura.planoId;
            // A oferta de fundador acabou com a tabela de 27/09; a variável
            // fica para o desenho abaixo, e é sempre falsa sem vaga.
            const fundador = !assina && plan.id === FUNDADOR.plano && vagasDeFundador > 0;
            return (
              <div
                key={plan.id}
                className="flex flex-col gap-3 rounded-xl border p-5"
                style={{
                  background: "var(--bg-elevated)",
                  borderColor: atual ? "var(--accent-orange)" : "var(--border)",
                  position: "relative",
                }}
              >
                {atual && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-orange-500 px-3 py-0.5 text-[11px] font-bold text-white">
                      SEU PLANO
                    </span>
                  </div>
                )}

                <div>
                  <p className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>
                    {plan.nome}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    {plan.descricao}
                  </p>
                </div>

                <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                  {fundador && (
                    <span className="mr-1.5 text-sm line-through">R$ {reais(plan.mensal)}</span>
                  )}
                  <span className="text-2xl font-black" style={{ color: "var(--text-primary)" }}>
                    R$ {reais(fundador ? FUNDADOR.mensal : plan.mensal)}
                  </span>{" "}
                  /mês
                </p>
                <p className="-mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  Contrato anual: R$ {reais(plan.anual)} pagos à vista
                </p>

                {fundador && (
                  <>
                    <p className="text-xs font-semibold text-orange-400">
                      {fundadorVagas(vagasDeFundador)}
                    </p>
                    {/* Terceira tela a dizer a mesma coisa, e por isso a frase
                        mora em lib/planos: quando cada uma tinha a sua cópia,
                        as três divergiram. */}
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {FUNDADOR_COBRANCA}
                    </p>
                  </>
                )}

                <ul className="flex flex-col gap-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <Check className="h-3.5 w-3.5 shrink-0 text-orange-400" />
                      <span style={{ color: "var(--text-primary)" }}>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto flex flex-col gap-2 pt-2">
                  {atual ? (
                    <div className="flex h-10 items-center justify-center gap-1.5 rounded border border-orange-500/30 bg-orange-500/10 text-sm font-semibold text-orange-400">
                      <Check className="h-3.5 w-3.5" />É o seu plano
                    </div>
                  ) : (
                    /* A vaga de fundador é um price ANUAL: sem o ciclo no
                       clique, o checkout cobraria o mensal de lista de quem
                       clicou em fundador. Mesma armadilha do link da landing.
                       O `loading` segue o mesmo desvio, porque `assinar` marca
                       a chave com sufixo `-anual` quando recebe o ciclo. */
                    <Button
                      className="w-full"
                      variant={assina ? "outline" : "default"}
                      loading={loading === `${plan.id}-anual`}
                      onClick={() => assinar(plan.id, "anual")}
                    >
                      {assina
                        ? `Mudar para ${plan.nome}`
                        : fundador
                          ? fundadorBotao()
                          : `Contratar o ${plan.nome}`}
                    </Button>
                  )}

                </div>
              </div>
            );
          })}
        </div>

        {assina && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Trocar de plano cobra a diferença proporcional aos dias que faltam do ciclo. Quem muda
            para um plano maior recebe os créditos novos na hora.
          </p>
        )}
      </section>

      {/* Garantia */}
      <div
        className="flex items-start gap-3 rounded-xl border p-4"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-orange-400" />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
            Garantia de {GARANTIA_DIAS} dias.
          </span>{" "}
          Se nos primeiros {GARANTIA_DIAS} dias você não publicar nada que aprovou, devolvemos tudo.
        </p>
      </div>

      {/* Cancelar */}
      {assina && (
        <section
          className="flex flex-col gap-4 rounded-xl border p-6 sm:flex-row sm:items-center sm:justify-between"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <div>
            <h2 className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>
              {cancelaNoFim ? "Reativar assinatura" : "Cancelar assinatura"}
            </h2>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
              {cancelaNoFim
                ? `Sua assinatura está cancelada${proxima ? ` e termina em ${proxima}` : ""}. Dá para voltar atrás enquanto não terminar.`
                : `Você continua com tudo até ${proxima ?? "o fim do período pago"}, o período que já está pago. Depois dessa data a plataforma deixa de publicar, e seus posts ficam guardados.`}
            </p>
          </div>
          <Button
            variant={cancelaNoFim ? "outline" : "destructive"}
            className="shrink-0"
            loading={loading === "cancelar"}
            onClick={() => cancelar(cancelaNoFim)}
          >
            {cancelaNoFim ? "Reativar assinatura" : "Cancelar assinatura"}
          </Button>
        </section>
      )}
    </div>
  );
}
