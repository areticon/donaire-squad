"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Check, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  FUNDADOR,
  GARANTIA_DIAS,
  PLANOS_PUBLICOS,
  mensalDoAnual,
  reais,
} from "@/lib/planos";

/**
 * A tabela de preço da landing. Os planos vêm de lib/planos, a mesma fonte de
 * /planos e da tela de billing, para as três telas nunca mais divergirem.
 *
 * Duas coisas que não são decoração:
 * - A oferta de fundador só aparece enquanto o Stripe disser que há vaga
 *   (vagasDeFundador vem do servidor, em app/page.tsx). Sumir com a oferta
 *   quando acaba é o que a torna verdadeira.
 * - A garantia de 30 dias fica embaixo do preço, e não em rodapé: é ela que
 *   sustenta preço alto para quem ainda não viu caso nenhum.
 */
export function Pricing({ vagasDeFundador = 0 }: { vagasDeFundador?: number }) {
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
          <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-full px-4 py-1.5 text-sm text-orange-400 mb-6">
            <Zap className="w-3.5 h-3.5" />
            Você paga por gravação, não por crédito
          </div>
          <h2 className="text-4xl lg:text-5xl font-black text-[var(--text-primary)] mb-4">
            Menos que um social media.{" "}
            <span className="text-orange-500">Mais que uma agência entrega.</span>
          </h2>
          <p className="text-xl text-[var(--text-muted)] max-w-2xl mx-auto">
            Um social media cobra de R$ 1.200 a R$ 3.500 por mês e não edita vídeo.
            Aqui, cada gravação sua vira a semana inteira publicada. Cancele quando quiser.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
          {PLANOS_PUBLICOS.map((plan, i) => {
            const fundador = plan.id === FUNDADOR.plano && vagasDeFundador > 0;
            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={cn(
                  "relative rounded-2xl p-8 border",
                  plan.destaque
                    ? "bg-[var(--bg-card)] border-orange-500 shadow-[0_0_40px_rgba(249,115,22,0.15)]"
                    : "bg-[var(--bg-card)] border-[var(--border)]"
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
                  <h3 className="text-xl font-bold text-[var(--text-primary)] mb-1">
                    {plan.nome}
                  </h3>
                  <p className="text-sm text-[var(--text-muted)]">{plan.descricao}</p>
                </div>

                <div className="mb-8">
                  {fundador ? (
                    <>
                      <div className="flex items-baseline gap-2">
                        <span className="text-[var(--text-muted)] text-lg line-through">
                          R$ {reais(plan.mensal)}
                        </span>
                        <span className="text-5xl font-black text-[var(--text-primary)]">
                          {reais(FUNDADOR.mensal)}
                        </span>
                        <span className="text-[var(--text-muted)] text-sm">/mês</span>
                      </div>
                      <p className="mt-1.5 text-sm text-orange-400">
                        Fundador: {vagasDeFundador} de {FUNDADOR.vagas} vagas. Esse preço fica para sempre.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-1">
                        <span className="text-[var(--text-muted)] text-lg">R$</span>
                        <span className="text-5xl font-black text-[var(--text-primary)]">
                          {reais(plan.mensal)}
                        </span>
                        <span className="text-[var(--text-muted)] text-sm">/mês</span>
                      </div>
                      <Link
                        href={`/sign-up?plan=${plan.id}&ciclo=anual`}
                        className="inline-block mt-1.5 text-sm text-orange-400 hover:text-orange-300"
                      >
                        ou R$ {reais(mensalDoAnual(plan))}/mês no anual, dois meses grátis
                      </Link>
                    </>
                  )}
                </div>

                <Button
                  className="w-full mb-8"
                  variant={plan.destaque ? "default" : "outline"}
                  asChild
                >
                  <Link href={`/sign-up?plan=${plan.id}`}>
                    {fundador ? "Garantir vaga de fundador" : `Começar no ${plan.nome}`}
                  </Link>
                </Button>

                <ul className="space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm">
                      <Check className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                      <span className="text-[var(--text-primary)]">{feature}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-10 max-w-3xl mx-auto flex items-start gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-6"
        >
          <ShieldCheck className="w-6 h-6 text-orange-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-[var(--text-primary)]">
              Garantia de {GARANTIA_DIAS} dias, sem letra miúda
            </p>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Nos primeiros {GARANTIA_DIAS} dias, se você não publicar nada que aprovou,
              devolvemos tudo. Você só fica se o que saiu das suas gravações valeu a pena.
            </p>
          </div>
        </motion.div>

        <p className="text-center text-sm text-[var(--text-muted)] mt-8 max-w-2xl mx-auto">
          Peças por mês são a média de uma gravação de 20 a 30 minutos: 1 vídeo completo,
          cerca de 5 cortes e 5 textos por gravação. Imagens no X dependem do plano API pago
          da própria plataforma X; por ora, posts no X saem em texto.
        </p>
      </div>
    </section>
  );
}
