import { redirect } from "next/navigation";
import { Check, Clock, FileSignature, Wallet, Rocket } from "lucide-react";
import { auth } from "@/lib/auth/server";
import { contratoPendenteDaConta, entradaPaga, restantePago } from "@/lib/contratos/pagamento";
import { nomeDoPlano } from "@/lib/contratos/contratos";
import { centavosEmReais } from "@/lib/contratos/situacao";
import { ehParcelado, formasDoContrato, portaDoParcelado } from "@/lib/contratos/condicao";
import { resumoDaCondicao } from "@/lib/contratos/parcelado";
import { chavePix, linksDoContrato } from "@/lib/contratos/links-de-pagamento";
import { SairDaConta } from "@/components/equipe/sair-da-conta";

export const dynamic = "force-dynamic";

/**
 * AGUARDANDO PAGAMENTO (04/10/2026).
 *
 * Quem fechou por contrato e ainda não pagou NÃO É CLIENTE (regra do dono): o
 * portão de entrada manda para cá em vez do produto, e em vez de /planos, que
 * mostraria preço de vitrine e outro checkout. A tela diz em que pé está o
 * contrato (assinatura, pagamento, acesso) e o que falta, sem nada a clicar
 * que não resolva.
 *
 * Fica FORA do grupo (app) pelo mesmo motivo da equipe pausada: o layout de lá
 * roda o portão, que mandaria para cá de novo. Sem contrato pendente (pagou,
 * ou o link foi colado), volta para o painel.
 */
export default async function AguardandoPagamentoPage({ searchParams }: { searchParams: Promise<{ pago?: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect=%2Faguardando-pagamento");
  const sp = await searchParams;
  const c = await contratoPendenteDaConta(userId);
  if (!c) redirect("/dashboard");

  const n = String(c.numero).padStart(4, "0");
  const assinado = Boolean(c.assinadoEm);
  const voltouDoStripe = sp.pago === "1";
  // O PARCELADO (05/10): a condição por extenso, o que falta de cada parte e
  // os links que não vencem (a entrada por fora não tem link: vai a chave Pix).
  const parcelado = ehParcelado(c)
    ? await (async () => {
        const formas = formasDoContrato(c);
        const porta = portaDoParcelado({ ...c, entradaPagaCentavos: (await entradaPaga(c.id)).centavos, restantePagoCentavos: await restantePago(c.id) });
        return { ...formas, ...porta, porExtenso: resumoDaCondicao(c), links: linksDoContrato({ id: c.id, ...formas }), chavePix: chavePix() };
      })()
    : null;
  const passos = [
    {
      nome: "Assinatura do contrato",
      feito: assinado,
      icone: FileSignature,
      nota: assinado ? "Assinado." : "O link de assinatura foi para o seu e-mail.",
    },
    {
      nome: "Pagamento",
      feito: false,
      icone: Wallet,
      nota: voltouDoStripe
        ? "Recebemos o seu pagamento no Stripe e estamos confirmando. Leva poucos minutos."
        : "Assim que o pagamento for confirmado, o acesso é liberado.",
    },
    {
      nome: "Acesso à plataforma",
      feito: false,
      icone: Rocket,
      nota: "Você recebe o e-mail de boas-vindas com o link de entrada.",
    },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: "var(--bg-primary)" }}>
      <div className="w-full max-w-md" data-aguardando-pagamento={c.numero}>
        <div className="text-center mb-8">
          <span className="font-semibold tracking-[-0.04em] text-xl lowercase" style={{ color: "var(--text-primary)" }}>
            demandou<span style={{ color: "var(--marca-laranja)" }}>.</span>
          </span>
        </div>
        <div
          className="rounded-2xl border p-6 sm:p-8 space-y-5"
          style={{
            background: "var(--bg-card)",
            borderColor: "var(--border)",
            boxShadow: "var(--shadow)",
          }}
        >
          <p className="rotulo">Contrato nº {n}</p>
          <div className="flex items-start gap-3">
            <Clock className="mt-1 h-6 w-6 shrink-0" style={{ color: "var(--marca-laranja)" }} aria-hidden />
            <h1 className="text-2xl font-semibold tracking-tight text-balance" style={{ color: "var(--text-primary)" }}>
              {assinado ? "Seu contrato está assinado. Falta o pagamento para liberar o acesso." : "Seu contrato está esperando a assinatura."}
            </h1>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Plano {nomeDoPlano(c.plano)}, {centavosEmReais(c.valorCentavos)} por ano{c.empresa ? `, para ${c.empresa}` : ""}. O contrato vale 12 meses, contados
            da confirmação do pagamento.
          </p>
          <ol className="space-y-3">
            {passos.map((p) => (
              <li key={p.nome} className="flex items-start gap-3">
                <span
                  className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border"
                  style={{
                    borderColor: p.feito ? "var(--painel-1)" : "var(--border)",
                    background: p.feito ? "var(--realce-2)" : "transparent",
                  }}
                >
                  {p.feito ? (
                    <Check className="h-4 w-4" style={{ color: "var(--text-primary)" }} aria-hidden />
                  ) : (
                    <p.icone className="h-4 w-4" style={{ color: "var(--text-muted)" }} aria-hidden />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {p.nome}
                  </span>
                  <span className="block text-xs" style={{ color: "var(--text-muted)" }}>
                    {p.nota}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          {parcelado && (
            <div className="rounded-xl border p-3 text-xs space-y-1.5" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)", color: "var(--text-muted)" }} data-condicao-parcelada>
              {parcelado.porExtenso && (
                <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
                  {parcelado.porExtenso}.
                </p>
              )}
              <p>
                Entrada: {parcelado.entradaOk ? "confirmada." : parcelado.formaDaEntrada === "cartao_stripe" ? "pague pelo link abaixo." : parcelado.formaDaEntrada === "pix" ? `pague pelo Pix${parcelado.chavePix ? ` na chave ${parcelado.chavePix}` : ""} e envie o comprovante respondendo ao e-mail do contrato.` : "pague por fora e envie o comprovante respondendo ao e-mail do contrato."}
              </p>
              <p>
                Restante: {parcelado.restanteOk ? (parcelado.formaDoRestante === "cartao_recorrente" ? "cartão das parcelas cadastrado." : "pago.") : parcelado.formaDoRestante === "cartao_recorrente" ? "cadastre o cartão das parcelas pelo link abaixo." : "pague pelo link abaixo."}
              </p>
            </div>
          )}
          <div className="flex flex-col gap-2.5">
            {assinado && parcelado && !parcelado.entradaOk && parcelado.links.entrada && (
              <a href={parcelado.links.entrada} className="inline-flex h-12 items-center justify-center rounded-lg bg-marca-600 px-6 text-base font-medium text-white hover:bg-marca-700">
                Pagar a entrada no cartão
              </a>
            )}
            {assinado && parcelado && !parcelado.restanteOk && (
              <a href={parcelado.links.restante} className="inline-flex h-12 items-center justify-center rounded-lg bg-marca-600 px-6 text-base font-medium text-white hover:bg-marca-700">
                {parcelado.formaDoRestante === "cartao_recorrente" ? "Cadastrar o cartão das parcelas" : "Pagar o restante no cartão"}
              </a>
            )}
            {assinado && !parcelado && c.linkDePagamento && !voltouDoStripe && (
              <a
                href={c.linkDePagamento}
                className="inline-flex h-12 items-center justify-center rounded-lg bg-marca-600 px-6 text-base font-medium text-white hover:bg-marca-700"
              >
                Pagar pelo link seguro do Stripe
              </a>
            )}
            <a
              href="/dashboard"
              className="inline-flex h-11 items-center justify-center rounded-lg border px-6 text-sm font-medium"
              style={{
                borderColor: "var(--border)",
                color: "var(--text-primary)",
              }}
            >
              Já pagou? Conferir o acesso
            </a>
            <SairDaConta />
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Pagou por Pix, boleto ou transferência? Envie o comprovante respondendo ao e-mail do contrato ou para contato@demandou.com, e a nossa equipe libera
            o acesso.
          </p>
        </div>
      </div>
    </div>
  );
}
