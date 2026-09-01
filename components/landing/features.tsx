"use client";

import { motion } from "framer-motion";
import {
  Bot,
  Sparkles,
  Share2,
  BarChart3,
  Calendar,
  Shield,
  Eye,
  Zap,
} from "lucide-react";

const FEATURES = [
  {
    icon: Bot,
    title: "Time de agentes autônomos",
    description:
      "Cada agente tem persona, estilo e especialidade. Roberto pesquisa, Lucas escreve para LinkedIn, Daniela cria infográficos.",
    color: "text-[#17171a]",
    bg: "bg-[var(--marcador)]",
  },
  {
    icon: Sparkles,
    title: "Infográficos com IA",
    description:
      "Gemini gera imagens e infográficos profissionais baseados nos dados do post. Visual de agência, sem agência.",
    color: "text-[#17171a]",
    bg: "bg-[var(--marcador)]",
  },
  {
    icon: Share2,
    title: "Publicação automática",
    description:
      "LinkedIn (texto, imagem e carrossel) e X/Twitter (texto). Conecte uma vez e publique automaticamente.",
    color: "text-[#17171a]",
    bg: "bg-[var(--marcador)]",
  },
  {
    icon: Eye,
    title: "Visualização em tempo real",
    description:
      "Veja seus agentes trabalhando ao vivo. Cada pensamento, cada rascunho, cada decisão visível no painel.",
    color: "text-[#17171a]",
    bg: "bg-[var(--marcador)]",
  },
  {
    icon: Calendar,
    title: "Agenda inteligente",
    description:
      "Defina frequência e horários. Os agentes criam e publicam automaticamente, mantendo consistência sem esforço.",
    color: "text-[#17171a]",
    bg: "bg-[var(--marcador)]",
  },
  {
    icon: BarChart3,
    title: "Dashboard com métricas",
    description:
      "Acompanhe posts publicados, alcance e performance. Tudo em um painel centralizado e intuitivo.",
    color: "text-cyan-400",
    bg: "bg-cyan-400/10",
  },
  {
    icon: Shield,
    title: "Você aprova antes de publicar",
    description:
      "Checkpoint de aprovação antes de cada publicação. Autonomia total dos agentes, controle total seu.",
    color: "text-[#17171a]",
    bg: "bg-[var(--marcador)]",
  },
  {
    icon: Zap,
    title: "Memória persistente",
    description:
      "Os agentes aprendem com cada run. Tom de voz, preferências, feedback: tudo guardado e evoluído.",
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
          <div className="inline-flex items-center gap-2 border-b border-[var(--fio)] pb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-primary)] mb-6">
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
                className="bg-[var(--bg-card)] border border-[var(--border)] rounded-none p-6 hover:border-orange-500/30 transition-all duration-300 group"
              >
                <div className={`${feature.bg} w-10 h-10 rounded-none flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
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
