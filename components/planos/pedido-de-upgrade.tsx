"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Tag, Video } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { reais, planoPublico, type PlanoId } from "@/lib/planos";
import { diaEMes } from "@/lib/frase-da-cota";

/**
 * O que a pessoa ve quando esbarra num limite do plano.
 *
 * Nasceu em 18/09/2026, junto com os limites passando a valer. Ate aqui
 * `gravacoesPorMes` e `marcas` eram vitrine: estavam na tabela, apareciam no
 * cartao de preco e nenhuma linha de codigo os lia.
 *
 * ## A decisao que esta peca carrega
 *
 * **Esbarrar num limite e uma oferta, nao um erro.** Quem chegou aqui ja queria
 * usar o produto, que e o momento de maior intencao que existe. Devolver uma
 * frase vermelha de erro nesse ponto e gastar a melhor conversa do mes para
 * dizer "nao".
 *
 * Tres regras de conteudo que vieram do canvas:
 *
 * 1. **O medidor cheio**, porque limite precisa ser uma coisa que se VE. Numero
 *    dentro de frase se le como reclamacao; barra cheia se le como fato.
 * 2. **O salto mostra o que MUDA, nao quanto custa.** Quem esbarrou aqui quer
 *    gravar: o numero que decide e "4 gravacoes", nao "R$ 697". O preco vem
 *    junto, em letra menor, porque esconder preco e pior.
 * 3. **A data de renovacao**, quando existe. E o que impede a tela de virar uma
 *    parede: quem sabe que volta dia 14 espera, quem nao sabe acha que o produto
 *    acabou. Marca nao tem data, porque marca nao renova, e sugerir uma espera
 *    que nunca termina seria mentir.
 */

export type Estouro = {
  recurso: "marcas" | "gravacoes";
  usado: number;
  limite: number;
  plano: string | null;
  sugestao: { planoId: PlanoId; nome: string; marcas: number; gravacoesPorMes: number } | null;
  renovaEm: string | null;
  /** Membro da equipe (01/10): "teto" do membro ou "cota" da conta acabou. */
  equipe?: "teto" | "cota";
  /** O nome de quem administra a conta, quando `equipe` vem (01/10, acabamento). */
  dono?: string;
};

/**
 * "14 de outubro". Sem ano: a renovacao e sempre proxima.
 *
 * O FUSO E FIXO, e nao e detalhe. Medido em 18/09 com o mesmo instante:
 *
 *   servidor em UTC (a Vercel)  -> "14 de outubro"
 *   navegador em BRT (o cliente) -> "13 de outubro"
 *
 * Sem fixar, o componente renderiza uma data no servidor e outra no navegador,
 * pela unica razao de a Vercel rodar em UTC. Alem do aviso de hidratacao, o
 * cliente le um dia a menos e espera a renovacao num dia em que ela nao vem.
 * America/Sao_Paulo e o mesmo fuso que o projeto ja usa como padrao no schema.
 */
function dia(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    timeZone: "America/Sao_Paulo",
  });
}

export function PedidoDeUpgrade({ estouro }: { estouro: Estouro }) {
  // Membro da equipe não vê cobrança (01/10): o cartão diz o limite e manda
  // falar com quem administra a conta, sem botão de plano.
  if (estouro.equipe) return <LimiteDaEquipe estouro={estouro} />;
  return <PedidoDeUpgradeDoDono estouro={estouro} />;
}

function LimiteDaEquipe({ estouro }: { estouro: Estouro }) {
  const teto = estouro.equipe === "teto";
  const u = Math.min(estouro.usado, estouro.limite);
  const titulo = teto
    ? `Você já usou ${u} de ${estouro.limite} ${estouro.limite === 1 ? "gravação" : "gravações"} que a sua equipe liberou para você este mês`
    : `A sua equipe já usou ${u} de ${estouro.limite} gravações deste mês`;
  return (
    <div
      className="rounded-xl border p-6 space-y-[14px]"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div className="flex items-start gap-3.5">
        <span
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] text-white"
          style={{ background: "linear-gradient(135deg, var(--brand-grad-from), var(--brand-grad-to))" }}
        >
          <Video className="h-[19px] w-[19px]" />
        </span>
        <div>
          <p className="text-[17px] font-bold leading-snug text-[var(--text-primary)] text-balance">{titulo}</p>
          <p className="mt-1.5 max-w-[54ch] text-sm leading-relaxed text-[var(--text-muted)]">
            {estouro.renovaEm ? (
              <>
                A próxima libera em <b className="font-semibold text-[var(--text-primary)]">{diaEMes(estouro.renovaEm)}</b>.{" "}
              </>
            ) : null}
            {/* Pelo nome, quando o servidor manda (01/10, acabamento). */}
            {estouro.dono ? `Para liberar mais, fale com ${estouro.dono}.` : "Para liberar mais, fale com quem administra a conta da sua equipe."}
          </p>
        </div>
      </div>
    </div>
  );
}

function PedidoDeUpgradeDoDono({ estouro }: { estouro: Estouro }) {
  const router = useRouter();
  const [indo, setIndo] = useState(false);
  const ehGravacao = estouro.recurso === "gravacoes";
  const sugestao = estouro.sugestao;

  const titulo = !estouro.plano
    ? ehGravacao
      ? "Escolha um plano para enviar a sua primeira gravação"
      : "Escolha um plano para criar a sua marca"
    : ehGravacao
      ? // A frase aprovada em 30/09 (lib/frase-da-cota.ts), partida em duas:
        // o número no título, a saída no texto de baixo.
        `Você já usou ${Math.min(estouro.usado, estouro.limite)} de ${estouro.limite} gravações deste mês`
      : `O ${estouro.plano} inclui ${estouro.limite} marca${estouro.limite > 1 ? "s" : ""}`;

  /**
   * TROCAR de plano vai pelo PORTAL; ASSINAR o primeiro vai pelo checkout.
   *
   * A distincao nao e cosmetica: `createCheckoutSession` abre uma assinatura
   * NOVA. Quem ja paga o Essencial e clicasse aqui terminaria com duas
   * assinaturas ativas no Stripe, pagando as duas, e descobriria na fatura.
   * O portal e onde o Stripe faz troca de plano de verdade, com o rateio do
   * que falta do ciclo, que e justamente o que a linha de baixo promete.
   */
  async function irParaOPlano(planoId: PlanoId) {
    setIndo(true);
    const trocando = Boolean(estouro.plano);
    try {
      const r = await fetch(trocando ? "/api/stripe/portal" : "/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: trocando ? undefined : JSON.stringify({ planId: planoId, ciclo: "mensal" }),
      });
      const data = await r.json();
      if (!r.ok || !data.url) throw new Error(data.error ?? "erro");
      window.location.href = data.url as string;
    } catch {
      // Falhou, e a pagina de planos resolve o mesmo problema pela porta da
      // frente. Beco sem saida aqui seria o pior lugar possivel: a pessoa
      // chegou querendo pagar.
      toast.error("Não consegui abrir a cobrança. Veja os planos.");
      router.push("/planos");
      setIndo(false);
    }
  }

  return (
    <div
      className="rounded-xl border p-6 space-y-[18px]"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div className="flex items-start gap-3.5">
        <span
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] text-white"
          style={{ background: "linear-gradient(135deg, var(--brand-grad-from), var(--brand-grad-to))" }}
        >
          {ehGravacao ? <Video className="h-[19px] w-[19px]" /> : <Tag className="h-[19px] w-[19px]" />}
        </span>
        <div>
          <p className="text-[17px] font-bold leading-snug text-[var(--text-primary)] text-balance">{titulo}</p>
          <p className="mt-1.5 max-w-[54ch] text-sm leading-relaxed text-[var(--text-muted)]">
            {ehGravacao && estouro.plano && (
              <>
                {estouro.renovaEm ? (
                  <>
                    A próxima libera em{" "}
                    <b className="font-semibold text-[var(--text-primary)]">{diaEMes(estouro.renovaEm)}</b> ou faça
                    upgrade
                  </>
                ) : (
                  "Faça upgrade"
                )}
                {sugestao ? (
                  <>
                    {" "}
                    para o <b className="font-semibold text-[var(--text-primary)]">{sugestao.nome}</b>, com{" "}
                    {sugestao.gravacoesPorMes} por mês.
                  </>
                ) : (
                  " falando com a gente."
                )}{" "}
                O {estouro.plano} inclui {estouro.limite} gravações por mês.
              </>
            )}
            {!ehGravacao && estouro.plano && (
              <>
                Você já tem{" "}
                <b className="font-semibold text-[var(--text-primary)]">
                  {estouro.usado} marca{estouro.usado > 1 ? "s" : ""}
                </b>
                .{" "}
                {sugestao
                  ? `Para cuidar de mais de uma, com voz e paleta próprias em cada, o plano é o ${sugestao.nome}.`
                  : "Fale com a gente para cuidar de mais marcas."}
              </>
            )}
            {!estouro.plano && "Contrate um plano para liberar a plataforma inteira."}
          </p>
        </div>
      </div>

      {estouro.plano && (
        <div className="space-y-[7px]">
          <div className="flex justify-between text-xs text-[var(--text-muted)]">
            <span>{ehGravacao ? "Gravações deste mês" : "Marcas"}</span>
            <b className="font-semibold tabular-nums text-[var(--text-primary)]">
              {estouro.usado} de {estouro.limite}
            </b>
          </div>
          <div className="h-[7px] overflow-hidden rounded-full" style={{ background: "var(--bg-input)" }}>
            <div
              className="h-full rounded-full"
              style={{
                width: "100%",
                background: "linear-gradient(90deg, var(--brand-grad-from), var(--brand-grad-to))",
              }}
            />
          </div>
        </div>
      )}

      {sugestao && (
        <div
          className="grid items-center gap-3.5 rounded-xl border px-4 py-3.5 sm:grid-cols-[1fr_auto_1fr]"
          style={{ background: "var(--bg-input)", borderColor: "var(--border)" }}
        >
          {estouro.plano && (
            <div>
              <p className="mb-[3px] text-[10.5px] font-bold uppercase tracking-[.1em] text-[var(--text-muted)]">Hoje</p>
              <p className="mb-0.5 text-[13px] text-[var(--text-muted)]">{estouro.plano}</p>
              <p className="text-[19px] font-bold leading-tight tabular-nums text-[var(--text-primary)]">
                {estouro.limite} {ehGravacao ? "gravações" : `marca${estouro.limite > 1 ? "s" : ""}`}
              </p>
            </div>
          )}
          <span className="hidden justify-self-center text-[var(--text-muted)] sm:block">
            <ArrowRight className="h-[18px] w-[18px]" />
          </span>
          <div>
            <p className="mb-[3px] text-[10.5px] font-bold uppercase tracking-[.1em] text-[var(--text-muted)]">
              No {sugestao.nome}
            </p>
            <p className="mb-0.5 text-[13px] text-[var(--text-muted)]">
              R$ {reais(planoPublico(sugestao.planoId).mensal)} por mês
            </p>
            <p className="text-[19px] font-bold leading-tight tabular-nums text-[var(--accent-orange)]">
              {ehGravacao
                ? `${sugestao.gravacoesPorMes} gravações`
                : `${sugestao.marcas} marca${sugestao.marcas > 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        {sugestao && (
          <Button onClick={() => void irParaOPlano(sugestao.planoId)} loading={indo}>
            {estouro.plano ? `Mudar para o ${sugestao.nome}` : `Começar no ${sugestao.nome}`}
          </Button>
        )}
        <Button variant="outline" onClick={() => router.push("/planos")}>
          Ver os planos
        </Button>
      </div>

      {estouro.plano && sugestao && (
        <p className="text-xs text-[var(--text-muted)]">
          A troca vale na hora, e o Stripe cobra só a diferença do que falta do ciclo.
        </p>
      )}
    </div>
  );
}

/**
 * A mesma informacao em peso menor, para avisar ANTES de esbarrar.
 *
 * Existe porque avisar so depois faz o limite parecer armadilha. Aparece com uma
 * ou duas gravacoes restantes, e some no resto do ciclo: aviso que fica na tela
 * o mes inteiro nao e aviso, e decoracao.
 */
export function FaixaDeCota({
  restantes,
  renovaEm,
  sugestao,
}: {
  restantes: number;
  renovaEm: string | null;
  sugestao: { planoId: PlanoId; nome: string } | null;
}) {
  const router = useRouter();
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
      style={{ background: "var(--bg-input)", borderColor: "var(--border)" }}
    >
      <p className="text-[13.5px] text-[var(--text-primary)]">
        {restantes === 1 ? "Última gravação deste mês." : `Faltam ${restantes} gravações neste mês.`}{" "}
        {renovaEm && (
          <span className="text-[var(--text-muted)]">
            Depois delas, as próximas voltam por volta de {dia(renovaEm)}.
          </span>
        )}
      </p>
      {sugestao && (
        <Button variant="outline" size="sm" onClick={() => router.push("/planos")}>
          Ver o {sugestao.nome}
        </Button>
      )}
    </div>
  );
}
