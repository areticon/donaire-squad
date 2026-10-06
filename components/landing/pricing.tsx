"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Check, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GARANTIA_DIAS, PLANOS_PUBLICOS, reais } from "@/lib/planos";
import { ExtrasDoPlano } from "@/components/planos/extras-do-plano";
import { ComoContamos, EntregasDoPlano } from "@/components/planos/entregas-do-plano";
import { fraseDoAcessoExtra, listaDoCartao } from "@/lib/entregas-do-plano";

/**
 * A tabela de preço da landing, na tabela de 27/09/2026 (com o Matheus
 * Gaberlini como sócio): Starter, Pro e Enterprise, só contrato anual pago à
 * vista, para empresas que faturam acima de R$ 100 mil por mês.
 *
 * Por que acabou o seletor mensal e anual: o resultado de conteúdo só aparece
 * com tempo, e quem pagava mês a mês desistia no terceiro mês. Um ciclo só,
 * dito por extenso em cada cartão.
 *
 * O botão leva à demonstração, e não ao cadastro: venda desse tamanho passa por
 * conversa com os sócios. Os planos vêm de lib/planos, a mesma fonte de
 * /planos e da tela de cobrança.
 *
 * `vagasDeFundador` continua na assinatura para app/page.tsx não quebrar, mas
 * a oferta de fundador acabou com a tabela nova e não aparece mais.
 */
export function Pricing(_: { vagasDeFundador?: number }) {
  return (
    <section id="pricing" className="py-24 lg:py-32 relative">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          {/* Saiu o selo "Para empresas que faturam acima de R$ 100 mil por mês"
              (02/10, noite, pedido do Matheus): assustava antes do preço. */}
          <div className="selo mb-6">
            <Zap className="w-3.5 h-3.5" />
            Planos
          </div>
          <h2 className="text-4xl lg:text-5xl font-black text-[var(--text-primary)] mb-4">
            Um marketing completo,{" "}
            <span className="text-orange-500">pelo preço de um profissional.</span>
          </h2>
          <p className="text-xl text-[var(--text-muted)] max-w-2xl mx-auto">
            Pesquisa, redação, arte, vídeo e publicação em todas as redes, toda semana. Contrato anual, porque
            autoridade se constrói com constância, e é a partir do terceiro mês que ela começa a trazer cliente.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-6 items-start md:grid-cols-2 lg:grid-cols-3">
          {PLANOS_PUBLICOS.map((plan, i) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className={cn(
                "relative rounded-2xl p-8 border bg-[var(--bg-card)]",
                plan.destaque ? "border-orange-500 shadow-[0_12px_40px_-12px_rgba(10,31,59,0.28)]" : "border-[var(--border)]"
              )}
            >
              {plan.destaque && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="bg-orange-500 text-white text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap">
                    MAIS ESCOLHIDO
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-bold text-[var(--text-primary)] mb-1">{plan.nome}</h3>
                <p className="text-sm text-[var(--text-muted)]">{plan.descricao}</p>
              </div>

              {/* O número grande é por mês, que é como se compara; o total do
                  ano vem logo abaixo, dito por extenso, porque é ele que se paga. */}
              <div className="mb-8">
                <div className="flex items-baseline gap-1">
                  <span className="text-[var(--text-muted)] text-lg">R$</span>
                  <span className="text-5xl font-black text-[var(--text-primary)]">{reais(plan.mensal)}</span>
                  <span className="text-[var(--text-muted)] text-sm">/mês</span>
                </div>
                {/* Menor e discreta desde 02/10, mas SEMPRE visível: é a condição
                    de cobrança, e esconder de quem vai pagar seria enganoso. */}
                <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                  Contrato anual: R$ {reais(plan.anual)} pagos à vista
                </p>
              </div>

              <Button className="w-full mb-3" variant={plan.destaque ? "default" : "outline"} asChild>
                <Link href={`/demonstracao?plano=${plan.id}`}>Agendar reunião</Link>
              </Button>
              {/* "Contratar" (02/10, pedido do Matheus): /planos tem o caminho
                  de contratação (cadastro com o plano e checkout anual). */}
              <Link
                href="/planos"
                className="mb-8 block text-center text-sm font-semibold text-orange-400 hover:text-orange-300"
              >
                Contratar o {plan.nome}
              </Link>

              {/* Os números do plano (06/10): minutos, vídeos, peças, vídeo por
                  IA, armazenamento e marcas, de lib/entregas-do-plano.ts. */}
              <EntregasDoPlano plano={plan} />

              <ExtrasDoPlano plano={plan} />

              <ul className="space-y-3">
                {listaDoCartao(plan).map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm">
                    <Check className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                    <span className="text-[var(--text-primary)]">{feature}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        {/* O acesso extra (01/10, noite): quem tem mais vendedores que o plano
            pergunta logo "e se eu tiver 11?". Desde 06/10 a frase não fala em
            crédito; sai de lib/entregas-do-plano.ts, que lê lib/equipe/regras. */}
        <p className="mt-8 text-center text-sm text-[var(--text-muted)] max-w-3xl mx-auto">{fraseDoAcessoExtra()}</p>

        <ComoContamos className="mt-6" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-10 max-w-3xl mx-auto flex items-start gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-6"
        >
          <ShieldCheck className="w-6 h-6 text-orange-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-[var(--text-primary)]">Garantia de {GARANTIA_DIAS} dias, sem letra miúda</p>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Nos primeiros {GARANTIA_DIAS} dias, se a sua empresa não publicar nada que aprovou, devolvemos tudo o que
              foi pago.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
