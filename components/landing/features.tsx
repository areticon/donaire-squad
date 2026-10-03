"use client";

import { motion } from "framer-motion";
import {
  Bot,
  Sparkles,
  Share2,
  BarChart3,
  Upload,
  Shield,
  Eye,
  Zap,
} from "lucide-react";

const FEATURES = [
  {
    icon: Bot,
    title: "Um especialista por rede, e uma gerente",
    description:
      "Roberto pesquisa. Lucas cuida do LinkedIn, Xavier do X, Igor do Instagram, Fernanda do Facebook, Tiago do TikTok e Yan do YouTube. Diana cria artes e carrosséis, Vitor edita os seus vídeos e Paulo publica. A Vera, gerente do time, confere cada peça final e retreina quem erra. Você acompanha tudo no escritório 3D, com o seu próprio avatar.",
    color: "text-blue-400",
    bg: "bg-blue-400/10",
  },
  {
    icon: Sparkles,
    title: "Pauta nova toda semana",
    description:
      "Antes de escrever, a equipe olha o que aconteceu nos últimos dias no seu mercado: notícias, números novos, quem ganhou atenção e o que está pegando no X. E não repete o que você já publicou.",
    color: "text-purple-400",
    bg: "bg-purple-400/10",
  },
  {
    icon: Share2,
    title: "Publicação automática",
    description:
      "LinkedIn, Instagram, Facebook, X, YouTube e TikTok. Texto, imagem, carrossel e vídeo no formato de cada rede, e no Instagram e no Facebook você escolhe feed, reels e stories, até os três juntos.",
    color: "text-green-400",
    bg: "bg-green-400/10",
  },
  {
    icon: Eye,
    title: "Você vê cada passo",
    description:
      "O calendário mostra o que está sendo feito em cada dia enquanto acontece: na fila, criando a arte, lâmina 3 de 5, vídeo no trecho 2 de 4. Nada de ficar olhando uma tela parada sem saber se travou.",
    color: "text-orange-400",
    bg: "bg-orange-400/10",
  },
  {
    icon: Upload,
    title: "O seu material ou o da IA",
    description:
      "Em cada dia da semana você escolhe: gerar por IA ou subir a sua imagem, as suas lâminas, o seu vídeo ou o seu texto. A equipe escreve em volta do seu material e adapta para cada rede.",
    color: "text-yellow-400",
    bg: "bg-yellow-400/10",
  },
  {
    icon: BarChart3,
    title: "Os números de verdade",
    description:
      "O painel traz o que as redes medem: posts por semana, qual rede rende mais, os posts que mais engajaram e o que cada agente fez no mês, comparado com o mês anterior.",
    color: "text-cyan-400",
    bg: "bg-cyan-400/10",
  },
  {
    icon: Shield,
    title: "Você aprova e edita antes de sair",
    description:
      "Nada é publicado sem você ver. Mude uma palavra direto no texto, peça ajuste no chat do agente ou refaça a peça inteira.",
    color: "text-red-400",
    bg: "bg-red-400/10",
  },
  {
    icon: Zap,
    title: "Memória persistente",
    description:
      "Os agentes aprendem com cada campanha: o seu tom de voz, o que você corrige, o que você recusa. Tudo guardado, e a semana seguinte sai melhor.",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
  },
];

export function Features() {
  return (
    <section id="features" className="py-24 lg:py-32 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <div className="selo mb-6">
            Funcionalidades
          </div>
          <h2 className="text-4xl lg:text-5xl font-black text-[var(--text-primary)] mb-4">
            Tudo que você precisa para{" "}
            <span className="text-orange-500">dominar</span> as redes
          </h2>
          <p className="text-xl text-[var(--text-muted)] max-w-2xl mx-auto">
            Uma plataforma completa. Sem ferramentas dispersas, sem integração
            manual, sem perda de tempo.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07 }}
                className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 hover:border-orange-500/30 transition-all duration-300 group"
              >
                <div className={`${feature.bg} w-10 h-10 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <Icon className={`w-5 h-5 ${feature.color}`} />
                </div>
                <h3 className="font-semibold text-[var(--text-primary)] mb-2 leading-snug">
                  {feature.title}
                </h3>
                <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
