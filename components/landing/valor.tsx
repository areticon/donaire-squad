"use client";

import { motion } from "framer-motion";
import { Clock, Film, PenLine, Scissors, Search, Send } from "lucide-react";
import { contaDoStarter, emReais } from "@/lib/calculadora/custos";
import { CtaDupla } from "@/components/landing/cta-dupla";

/**
 * A conta do que a plataforma entrega por mês, em horas e em reais, logo
 * antes do preço. Existe porque o preço de 02/09 (R$ 397 a R$ 1.997) só faz
 * sentido para quem compara com gente, e não com outro SaaS: o comprador
 * precisa ver, antes do número, que está comprando 30 horas de trabalho.
 *
 * Todos os números vêm da conversa "Demandou estratégia" de 02/09, que mediu
 * a saída real do código para um cliente que grava uma vez por semana, de 20 a
 * 30 minutos, e cruzou com preço de mercado brasileiro de 2026 (edição de
 * vídeo por hora, corte vertical avulso, pacote de social media). O tempo de
 * edição usa o piso praticado por estúdio, 3 minutos de trabalho por minuto de
 * vídeo, de propósito: número conservador aguenta pergunta de cliente.
 */

const ENTREGAS = [
  {
    icon: Film,
    quantidade: "4",
    titulo: "vídeos completos editados",
    texto: "Fala limpa, legenda, capa com o seu rosto e a camada de design da sua marca.",
    horas: "5 h",
  },
  {
    icon: Scissors,
    quantidade: "20",
    titulo: "cortes verticais",
    texto: "Os melhores trechos em 9:16, com legenda queimada e capa própria, prontos para Reels, Shorts e TikTok.",
    horas: "8 a 13 h",
  },
  {
    icon: PenLine,
    quantidade: "20",
    titulo: "peças escritas",
    texto: "Texto, imagem, carrossel, thread e enquete, no seu tom, para LinkedIn, Instagram, X, Facebook, YouTube e TikTok.",
    horas: "7 a 10 h",
  },
  {
    icon: Search,
    quantidade: "4",
    titulo: "briefings de pesquisa",
    texto: "Fontes, dados e ângulo do dia, levantados na web antes de qualquer texto ser escrito.",
    horas: "4 h",
  },
  {
    icon: Send,
    quantidade: "44",
    titulo: "publicações agendadas",
    texto: "Cada peça na rede certa, na hora certa, depois de você aprovar.",
    horas: "2 a 4 h",
  },
];

// OS REAIS SAEM DA CALCULADORA (01/10, noite). Até aqui esta seção tinha a
// conta própria de 02/09 (R$ 3.050 a R$ 6.070, "gestão completa por R$ 5.000"),
// e a calculadora, logo acima na mesma página, dava R$ 12.000 para a agência.
// Duas contas na mesma página, o comprador acredita na menor e desconfia do
// resto. Agora as duas leem lib/calculadora/custos.ts, no volume do Starter.
const CONTA = contaDoStarter();
const MAIS_BARATO = Math.min(...CONTA.cenarios.map((c) => c.mensal));
const MAIS_CARO = Math.max(...CONTA.cenarios.map((c) => c.mensal));
const AGENCIA = CONTA.cenarios.find((c) => c.id === "agencia")?.mensal ?? MAIS_BARATO;

export function Valor() {
  return (
    <section id="valor" className="relative py-24 lg:py-32">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <div className="selo mb-6">
            <Clock className="w-3.5 h-3.5" />
            <span>A conta do mês</span>
          </div>
          <h2 className="text-4xl lg:text-5xl font-black text-[var(--text-primary)] mb-4">
            {/* 3 horas desde 02/10, noite: a mesma conta da hero e da faixa. */}
            3 horas suas no mês.{" "}
            <span className="text-orange-500">30 horas de trabalho devolvidas.</span>
          </h2>
          {/* A ECONOMIA (02/10, noite, pedido do Matheus), em frases curtas e
              com os números da calculadora no volume do Starter. Ele propôs
              "R$ 10 mil por mês com marketing": o número que temos com fonte é
              o da conta abaixo (de R$ 10.900 a R$ 31.140 feito por gente). Os
              "estudos que triplicam a empresa" e as receitas de "+1 milhão"
              ficaram de fora: não há fonte nem caso. */}
          <div className="max-w-2xl mx-auto space-y-1.5 text-xl">
            <p className="text-[var(--text-muted)]">
              Fazer esse volume com gente custa de {emReais(MAIS_BARATO)} a {emReais(MAIS_CARO)} por mês.
            </p>
            <p className="text-[var(--text-muted)]">
              Uma agência: {emReais(AGENCIA)} por mês, {emReais(AGENCIA * 12)} por ano.
            </p>
            <p className="font-semibold text-[var(--text-primary)]">
              Com a Demandou, {emReais(CONTA.plano.mensal)}. O custo cai, no mínimo, pela metade.
            </p>
          </div>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-12">
          {ENTREGAS.map((item, i) => (
            <motion.div
              key={item.titulo}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-6 flex flex-col"
            >
              <item.icon className="w-5 h-5 text-orange-400 mb-4" />
              <div className="flex items-baseline gap-1.5 mb-1">
                <span className="text-4xl font-black text-[var(--text-primary)]">
                  {item.quantidade}
                </span>
                <span className="text-sm text-[var(--text-muted)]">/mês</span>
              </div>
              <p className="font-bold text-[var(--text-primary)] mb-2">{item.titulo}</p>
              <p className="text-sm text-[var(--text-muted)] flex-1">{item.texto}</p>
              <p className="mt-4 pt-4 border-t border-[var(--border)] text-sm">
                <span className="text-orange-400 font-semibold">{item.horas}</span>
                <span className="text-[var(--text-muted)]"> suas, por mês</span>
              </p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="grid lg:grid-cols-3 gap-6"
        >
          <div className="lg:col-span-1 bg-[var(--bg-surface)] border border-orange-500/40 rounded-xl p-8">
            <p className="text-sm text-orange-400 font-semibold mb-2">Somando</p>
            <p className="text-5xl font-black text-[var(--text-primary)] mb-2">26 a 36 h</p>
            <p className="text-[var(--text-muted)] mb-6">
              por mês, quase uma semana inteira de trabalho de uma pessoa, feita
              enquanto você atende cliente.
            </p>
            <p className="text-sm text-orange-400 font-semibold mb-2">Comprar isso de gente</p>
            <p className="text-3xl font-black text-[var(--text-primary)] mb-2 tabular-nums">
              <span className="whitespace-nowrap">{emReais(MAIS_BARATO)}</span> a{" "}
              <span className="whitespace-nowrap">{emReais(MAIS_CARO)}</span>
            </p>
            <p className="text-[var(--text-muted)] text-sm">
              por mês, na mesma conta da calculadora acima, do freelancer por peça ao
              time próprio de carteira assinada.
            </p>
          </div>

          <div className="lg:col-span-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-8">
            <p className="text-sm text-orange-400 font-semibold mb-4">
              O mesmo volume, feito por gente
            </p>
            <div className="divide-y divide-[var(--border)]">
              {CONTA.cenarios.map((c) => (
                <div
                  key={c.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1"
                >
                  <div>
                    <p className="font-semibold text-[var(--text-primary)]">{c.nome}</p>
                    <p className="text-sm text-[var(--text-muted)]">{c.linhas.map((l) => l.rotulo).join(", ")}</p>
                  </div>
                  <p className="text-[var(--text-primary)] font-bold whitespace-nowrap tabular-nums">
                    {emReais(c.mensal)}
                    <span className="text-[var(--text-muted)] font-normal text-sm">/mês</span>
                  </p>
                </div>
              ))}
              <div className="py-3 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
                <div>
                  <p className="font-semibold text-orange-400">Demandou, plano {CONTA.plano.nome}</p>
                  <p className="text-sm text-[var(--text-muted)]">
                    {Math.round((1 - CONTA.plano.mensal / MAIS_BARATO) * 100)}% menos que a opção mais barata feita por gente
                  </p>
                </div>
                <p className="text-orange-400 font-black whitespace-nowrap tabular-nums">
                  {emReais(CONTA.plano.mensal)}
                  <span className="text-[var(--text-muted)] font-normal text-sm">/mês</span>
                </p>
              </div>
            </div>
            <p className="mt-6 text-sm text-[var(--text-muted)]">
              45% dos decisores B2B dizem que o conteúdo de autoridade de uma empresa
              levou diretamente a fechar negócio com ela, e 60% aceitam pagar mais caro
              a quem publica bem (Edelman e LinkedIn, 2024). A partir de {emReais(CONTA.plano.mensal)} por mês,
              menos do que contratar uma única pessoa para fazer só uma parte disso.
            </p>
          </div>
        </motion.div>
        <CtaDupla origem="valor" className="mt-10" />
      </div>
    </section>
  );
}
