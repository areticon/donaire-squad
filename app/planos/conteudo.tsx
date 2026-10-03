"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, ShieldCheck, Zap } from "lucide-react";
import { IdentificacaoCurta } from "@/components/identificacao-legal";
import { Button } from "@/components/ui/button";
import { BrandMarkAnimated } from "@/components/brand-mark-animated";
import { cn } from "@/lib/utils";
import { GARANTIA_DIAS, PLANOS_PUBLICOS, reais } from "@/lib/planos";
import { Rastro } from "@/components/landing/rastro";
import { ExtrasDoPlano } from "@/components/planos/extras-do-plano";
import { authClient } from "@/lib/auth/client";

/**
 * A ESCOLHA DE PLANO, na tabela de 27/09/2026 (Starter, Pro e Enterprise, só
 * anual e pago à vista, para empresas que faturam acima de R$ 100 mil por mês).
 *
 * Duas plateias na mesma página:
 *  - o VISITANTE vê o preço e vai para a demonstração, que é a entrada da
 *    Demandou desde que o teste grátis acabou;
 *  - quem JÁ TEM CONTA (criada pelos sócios depois da demonstração, pelo painel
 *    de clientes) contrata daqui mesmo: o botão abre o checkout anual.
 *
 * Os valores vêm de lib/planos, módulo sem Stripe, porque página de cliente não
 * pode importar o SDK do Stripe (armadilha já paga, ver PROJETO.md).
 */
export function PlanosConteudo({ vitrine }: { vitrine: boolean }) {
  // Quem tem conta mas ainda não tem plano é mandado para cá pelo portão do app
  // (lib/onboarding/portao.ts). Sem explicar por que, a pessoa acha que o login
  // falhou.
  const veioDoPortao = useSearchParams().get("assinar") === "1";
  const { data: sessao } = authClient.useSession();
  const logado = Boolean(sessao?.user);

  return (
    // Duas caras, conforme quem chega (01/10):
    // - o VISITANTE vem da landing, que é travada no escuro; com a página
    //   clara ele tinha a sensação de ter saído do site. Para ele a página é
    //   vitrine e fica no escuro, igual à landing;
    // - o CLIENTE vem do app (portão de assinatura, upgrade) e segue o tema
    //   dele, claro por padrão, que é o que o dono lê numa sala de reunião.
    // Quem decide é o servidor (page.tsx), pelo cookie de sessão, para a
    // página já nascer na cor certa, sem piscar.
    <main data-theme={vitrine ? "dark" : undefined} className="min-h-screen bg-[var(--bg-primary)]">
      <Rastro />
      <header className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <BrandMarkAnimated size={30} />
          <span className="flex flex-col justify-center">
            <span className="font-mont font-bold text-[var(--text-primary)] text-lg lowercase leading-none">demandou.</span>
            {/* O "postou." saiu do lockup no rebranding de 01/10: o slogan falava
                com quem quer postar, e o comprador agora é o dono da empresa. */}
          </span>
        </Link>
        {!logado && (
          <Link href="/sign-in" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            Já sou cliente
          </Link>
        )}
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 lg:py-16">
        {veioDoPortao && (
          <div className="max-w-xl mx-auto mb-8 p-4 rounded-xl border border-orange-500/25 bg-orange-500/5 text-sm text-orange-300 text-center">
            Sua conta está pronta. Falta contratar o plano combinado na demonstração para a equipe começar a trabalhar.
          </div>
        )}
        <div className="text-center mb-12">
          {/* Selo em vidro cinza e destaque em degradê laranja (01/10): o título fala da conta que o dono faz
              (analista e agência), não do produto. */}
          <p className="selo mb-5">
            <Zap className="w-3.5 h-3.5 shrink-0" /> Planos
          </p>
          <h1 className="text-4xl lg:text-5xl font-semibold tracking-tight text-[var(--text-primary)] mb-3">
            Menos que um analista. <span className="destaque">Constância de agência.</span>
          </h1>
          <p className="text-lg text-[var(--text-muted)] max-w-2xl mx-auto">
            Contrato anual, pago à vista: autoridade se constrói com constância, e é a partir do terceiro mês que ela
            começa a trazer cliente. Nos primeiros {GARANTIA_DIAS} dias, se a empresa não publicar nada que aprovou,
            devolvemos tudo.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 items-start md:grid-cols-2 lg:grid-cols-3">
          {PLANOS_PUBLICOS.map((plano) => (
            <div
              key={plano.id}
              className={cn(
                "relative rounded-2xl p-8 border bg-[var(--bg-card)]",
                plano.destaque ? "border-orange-500 shadow-[0_12px_40px_-12px_rgba(10,31,59,0.28)]" : "border-[var(--border)]"
              )}
            >
              {plano.destaque && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="bg-orange-500 text-white text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap">
                    MAIS ESCOLHIDO
                  </span>
                </div>
              )}
              <div className="mb-6">
                <h2 className="text-xl font-bold text-[var(--text-primary)] mb-1">{plano.nome}</h2>
                <p className="text-sm text-[var(--text-muted)]">{plano.descricao}</p>
              </div>
              <div className="mb-8">
                <div className="flex items-baseline gap-1">
                  <span className="text-[var(--text-muted)] text-lg">R$</span>
                  <span className="text-5xl font-black text-[var(--text-primary)]">{reais(plano.mensal)}</span>
                  <span className="text-[var(--text-muted)] text-sm">/mês</span>
                </div>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  Contrato anual: R$ {reais(plano.anual)} pagos à vista
                </p>
              </div>
              {/* O plano em destaque leva o botão de conversão laranja (01/10):
                  é o único laranja cheio da página; os outros ficam em contorno. */}
              <Button className={cn("w-full", logado ? "mb-8" : "mb-3")} variant={plano.destaque ? "conversao" : "outline"} asChild>
                <Link href={logado ? `/billing/start?plan=${plano.id}&ciclo=anual` : `/demonstracao?plano=${plano.id}`}>
                  {logado ? `Contratar o ${plano.nome}` : "Agendar reunião"}
                </Link>
              </Button>
              {/* CONTRATAR SEM REUNIÃO (02/10, pedido do Matheus): o visitante
                  cria a conta com o plano na URL, e o formulário de cadastro o
                  leva a /billing/start, que abre o checkout anual do Stripe.
                  É o mesmo caminho de quem já tem conta; a reunião segue
                  como o botão principal. */}
              {!logado && (
                <Link
                  href={`/sign-up?plan=${plano.id}&ciclo=anual`}
                  className="mb-8 block text-center text-sm font-semibold text-orange-400 hover:text-orange-300"
                >
                  Contratar agora
                </Link>
              )}
              <ExtrasDoPlano plano={plano} />
              <ul className="space-y-3">
                {plano.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <Check className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                    <span className="text-[var(--text-primary)]">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 max-w-2xl mx-auto flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
          <ShieldCheck className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
          <p className="text-sm text-[var(--text-muted)]">
            <span className="font-semibold text-[var(--text-primary)]">Garantia de {GARANTIA_DIAS} dias.</span> Se nos
            primeiros {GARANTIA_DIAS} dias a empresa não publicar nada que aprovou, devolvemos tudo. Além dela vale o
            arrependimento de 7 dias, como manda a lei.
          </p>
        </div>

        <IdentificacaoCurta className="mt-12" />
      </div>
    </main>
  );
}
