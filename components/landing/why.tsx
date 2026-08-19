"use client";

import { motion } from "framer-motion";
import { Clock, Repeat, Radio } from "lucide-react";

/**
 * A conta que explica por que o produto existe.
 *
 * A regra 7-11-4 é de Daniel Priestley: para alguém confiar em você a ponto de
 * comprar, precisa de cerca de 7 horas de conteúdo seu, 11 pontos de contato e
 * 4 canais diferentes. O número serve de munição narrativa porque transforma
 * "publique mais" em uma quantidade concreta, e a quantidade concreta é
 * impossível de manter sozinho. Daí o squad.
 */

const REGRA = [
  {
    numero: "7",
    icon: Clock,
    titulo: "horas de conteúdo",
    texto:
      "É quanto alguém precisa consumir de você antes de confiar a ponto de comprar. Sete horas. Não sete minutos.",
  },
  {
    numero: "11",
    icon: Repeat,
    titulo: "pontos de contato",
    texto:
      "Ninguém decide no primeiro post. Decide no décimo primeiro, quando o seu nome já virou referência no assunto.",
  },
  {
    numero: "4",
    icon: Radio,
    titulo: "canais diferentes",
    texto:
      "Ver você em um lugar é coincidência. Ver em quatro é autoridade. E manter quatro canais sozinho é inviável.",
  },
];

export function Why() {
  return (
    <section id="por-que" className="relative py-24 lg:py-32">
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
            <span>A regra 7-11-4</span>
          </div>
          <h2 className="text-4xl lg:text-5xl font-black text-[var(--text-primary)] mb-4">
            Autoridade tem uma conta. E ela não fecha no braço.
          </h2>
          <p className="text-xl text-[var(--text-muted)] max-w-2xl mx-auto">
            Daniel Priestley mediu o que separa quem é lembrado de quem é
            ignorado. Não é talento, é volume.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {REGRA.map((item, i) => (
            <motion.div
              key={item.numero}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-8"
            >
              <div className="flex items-baseline gap-3 mb-4">
                <span className="text-5xl font-black text-orange-500">
                  {item.numero}
                </span>
                <span className="text-lg font-bold text-[var(--text-primary)]">
                  {item.titulo}
                </span>
              </div>
              <p className="text-[var(--text-muted)] leading-relaxed">{item.texto}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="max-w-3xl mx-auto text-center"
        >
          <p className="text-2xl lg:text-3xl font-bold text-[var(--text-primary)] leading-snug mb-4">
            Essa conta é impossível de fechar sozinho. Por isso 99% desiste no
            terceiro post.
          </p>
          <p className="text-lg text-[var(--text-muted)] leading-relaxed">
            E é por isso que o 1% que mantém a consistência cobra mais caro,
            recebe indicação sem pedir e não disputa preço. Eles não são
            melhores no ofício. Eles são os únicos que o mercado enxerga.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
