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
    color: "text-blue-400",
    bg: "bg-blue-400/10",
  },
  {
    icon: Sparkles,
    title: "Infográficos com IA",
    description:
      "Gemini gera imagens e infográficos profissionais baseados nos dados do post. Visual de agência, sem agência.",
    color: "text-purple-400",
    bg: "bg-purple-400/10",
  },
  {
    icon: Share2,
    title: "Publicação automática",
    description:
      "LinkedIn, X, Instagram, TikTok, WhatsApp. Conecte uma vez e publique em todas as redes de forma autônoma.",
    color: "text-green-400",
    bg: "bg-green-400/10",
  },
  {
    icon: Eye,
    title: "Visualização em tempo real",
    description:
      "Veja seus agentes trabalhando ao vivo. Cada pensamento, cada rascunho, cada decisão visível no painel.",
    color: "text-orange-400",
    bg: "bg-orange-400/10",
  },
  {
    icon: Calendar,
    title: "Agenda inteligente",
    description:
      "Defina frequência e horários. Os agentes criam e publicam automaticamente, mantendo consistência sem esforço.",
    color: "text-yellow-400",
    bg: "bg-yellow-400/10",
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
    color: "text-red-400",
    bg: "bg-red-400/10",
  },
  {
    icon: Zap,
    title: "Memória persistente",
    description:
      "Os agentes aprendem com cada run. Tom de voz, preferências, feedback — tudo guardado e evoluído.",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
  },
];

export function Features() {
  return (
    <section id="features" className="py-32 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-20"
        >
          <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-full px-4 py-1.5 text-sm text-orange-400 mb-6">
            Funcionalidades
          </div>
          <h2 className="text-4xl lg:text-5xl font-black text-[#f5f5f5] mb-4">
            Tudo que você precisa para{" "}
            <span className="text-orange-500">dominar</span> as redes
          </h2>
          <p className="text-xl text-[#9ca3af] max-w-2xl mx-auto">
            Uma plataforma completa. Sem ferramentas dispersas, sem integração
            manual, sem perda de tempo.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07 }}
                className="bg-[#111] border border-[#2a2a2a] rounded-xl p-6 hover:border-orange-500/30 transition-all duration-300 group"
              >
                <div className={`${feature.bg} w-10 h-10 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <Icon className={`w-5 h-5 ${feature.color}`} />
                </div>
                <h3 className="font-semibold text-[#f5f5f5] mb-2 text-sm leading-snug">
                  {feature.title}
                </h3>
                <p className="text-xs text-[#9ca3af] leading-relaxed">
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
