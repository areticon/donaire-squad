"use client";

import { motion } from "framer-motion";

const STEPS = [
  {
    number: "01",
    title: "Configure seu projeto",
    description:
      "O assistente de IA te guia em 7 etapas: define o nicho, voz, equipe de agentes, redes e agenda. Leva menos de 10 minutos.",
  },
  {
    number: "02",
    title: "Agentes trabalham automaticamente",
    description:
      "Na hora programada, seu squad de IA pesquisa tendências, escreve posts, cria infográficos e prepara tudo para publicação.",
  },
  {
    number: "03",
    title: "Você aprova com um clique",
    description:
      "Receba o rascunho completo (texto + imagem) para revisão. Aprove ou peça ajustes. O agente aprende com seu feedback.",
  },
  {
    number: "04",
    title: "Publicado em todas as redes",
    description:
      "Com sua aprovação, Paulo Publicador distribui o conteúdo em LinkedIn, X, Instagram e mais — com fontes no primeiro comentário.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="py-32 relative">
      {/* Subtle separator */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#2a2a2a] to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-20"
        >
          <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-full px-4 py-1.5 text-sm text-orange-400 mb-6">
            Como funciona
          </div>
          <h2 className="text-4xl lg:text-5xl font-black text-[#f5f5f5] mb-4">
            Da ideia ao post publicado{" "}
            <span className="text-orange-500">sem você digitar</span>
          </h2>
          <p className="text-xl text-[#9ca3af] max-w-2xl mx-auto">
            O Demandou faz o trabalho pesado. Você foca no que importa.
          </p>
        </motion.div>

        <div className="relative">
          {/* Connecting line */}
          <div className="absolute left-[28px] top-8 bottom-8 w-px bg-gradient-to-b from-orange-500/50 via-orange-500/20 to-transparent hidden md:block" />

          <div className="space-y-8">
            {STEPS.map((step, i) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="flex gap-8 items-start"
              >
                <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-orange-500 flex items-center justify-center font-black text-white text-lg z-10">
                  {step.number}
                </div>
                <div className="flex-1 bg-[#111] border border-[#2a2a2a] rounded-xl p-6">
                  <h3 className="text-xl font-bold text-[#f5f5f5] mb-2">
                    {step.title}
                  </h3>
                  <p className="text-[#9ca3af] leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
