"use client";

import { motion } from "framer-motion";
import { Clock, Film, PenLine, Scissors, Search, Send } from "lucide-react";

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
    texto: "Texto, imagem, carrossel, thread e enquete, no seu tom, para LinkedIn, Instagram, X, Facebook e YouTube.",
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

const MERCADO = [
  { quem: "Ferramenta que só faz cortes", quanto: "R$ 150", o_que: "sem texto, sem completo, sem publicar" },
  { quem: "Ferramenta que só escreve LinkedIn", quanto: "R$ 1.100", o_que: "sem vídeo nenhum" },
  { quem: "Social media freelancer", quanto: "R$ 1.200 a R$ 3.500", o_que: "não edita vídeo" },
  { quem: "Gestão completa com editor", quanto: "R$ 5.000 a R$ 10.000", o_que: "o que você compra aqui" },
];

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
          <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-full px-4 py-1.5 text-sm text-orange-400 mb-6">
            <Clock className="w-3.5 h-3.5" />
            <span>A conta do mês</span>
          </div>
          <h2 className="text-4xl lg:text-5xl font-black text-[var(--text-primary)] mb-4">
            Uma gravação por semana.{" "}
            <span className="text-orange-500">30 horas de trabalho devolvidas.</span>
          </h2>
          <p className="text-xl text-[var(--text-muted)] max-w-2xl mx-auto">
            É o que um cliente que grava 20 a 30 minutos por semana recebe de volta,
            medido no que a plataforma entrega, com o tempo que um editor e um redator
            levariam para fazer o mesmo.
          </p>
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
            <p className="text-3xl font-black text-[var(--text-primary)] mb-2">R$ 3.050 a R$ 6.070</p>
            <p className="text-[var(--text-muted)] text-sm">
              por mês, em preço de mercado brasileiro de 2026: corte vertical avulso,
              hora de edição, pacote de redação, pesquisa de pauta e agendamento.
            </p>
          </div>

          <div className="lg:col-span-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-8">
            <p className="text-sm text-orange-400 font-semibold mb-4">
              O que o mesmo dinheiro compra fora daqui
            </p>
            <div className="divide-y divide-[var(--border)]">
              {MERCADO.map((linha) => (
                <div
                  key={linha.quem}
                  className="py-3 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1"
                >
                  <div>
                    <p className="font-semibold text-[var(--text-primary)]">{linha.quem}</p>
                    <p className="text-sm text-[var(--text-muted)]">{linha.o_que}</p>
                  </div>
                  <p className="text-[var(--text-primary)] font-bold whitespace-nowrap">
                    {linha.quanto}
                    <span className="text-[var(--text-muted)] font-normal text-sm">/mês</span>
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-sm text-[var(--text-muted)]">
              45% dos decisores B2B dizem que o conteúdo de autoridade de uma empresa
              levou diretamente a fechar negócio com ela, e 60% aceitam pagar mais caro
              a quem publica bem (Edelman e LinkedIn, 2024). A R$ 697 por mês, um único
              cliente novo a cada cinco anos já paga a conta.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
