"use client";

import { motion } from "framer-motion";
import {
  LogoLinkedIn,
  LogoInstagram,
  LogoX,
  LogoFacebook,
  LogoYouTube,
} from "@/components/social/logos-redes";

/**
 * O fluxo real do produto, na mesma ordem do assistente.
 *
 * Reescrito em 22/08/2026 por três motivos que o Bruno apontou no teste:
 * a landing não mostrava o fluxo, não trazia os logos oficiais das redes, e
 * contava a história antiga ("agentes que escrevem posts") em vez da atual,
 * em que o vídeo gravado pelo cliente é o produto.
 *
 * A ordem aqui espelha o assistente de propósito: quem chega na plataforma
 * reconhece o caminho que leu no site. Voz antes de ideia, porque ideia sem
 * voz sai genérica.
 */
const ETAPAS = [
  {
    numero: "01",
    titulo: "Conecte suas redes",
    descricao:
      "Uma autorização por rede, sem senha, sem copiar e colar. É o que permite o squad publicar por você em vez de te devolver texto para postar na mão.",
    redes: true,
  },
  {
    numero: "02",
    titulo: "Ensine sua voz",
    descricao:
      "Seu tom, seus temas de domínio, os perfis que você admira. É esta etapa que separa conteúdo que soa como você de conteúdo que soa como robô, e ela vem antes de qualquer ideia.",
  },
  {
    numero: "03",
    titulo: "Grave um vídeo. Ou dê um tema.",
    descricao:
      "Fale um vídeo do jeito que você falaria numa conversa: o squad transcreve, escolhe os melhores trechos e transforma em cortes, reels e shorts. Sem vídeo para gravar hoje? Dê um tema e ele cria imagem, carrossel, artigo e texto.",
    destaque: true,
  },
  {
    numero: "04",
    titulo: "Aprove o que vai sair",
    descricao:
      "Nada é publicado sem você ver. Aprove, peça ajuste ou descarte. O squad aprende com o que você corrige e erra menos na semana seguinte.",
  },
  {
    numero: "05",
    titulo: "Publicado, com você no controle",
    descricao:
      "Na hora marcada, seu conteúdo sai nas redes conectadas. Você acompanha o que foi publicado, quanto custou em créditos e o que rendeu.",
  },
];

const REDES = [
  { Logo: LogoLinkedIn, nome: "LinkedIn" },
  { Logo: LogoInstagram, nome: "Instagram" },
  { Logo: LogoX, nome: "X" },
  { Logo: LogoFacebook, nome: "Facebook" },
  { Logo: LogoYouTube, nome: "YouTube" },
];

export function HowItWorks() {
  return (
    <section id="how" className="py-24 lg:py-32 relative">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 border-b border-[var(--fio)] pb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-primary)] mb-6">
            Como funciona
          </div>
          <h2 className="text-4xl lg:text-5xl font-black text-[var(--text-primary)] mb-4">
            Você <span className="text-orange-500">demandou</span>. Ele{" "}
            <span className="text-orange-500">postou</span>.
          </h2>
          <p className="text-xl text-[var(--text-muted)] max-w-2xl mx-auto">
            Cinco etapas, uma vez só. Depois disso é você falar e o conteúdo
            aparecer nas suas redes.
          </p>
        </motion.div>

        <div className="relative">
          <div className="absolute left-[28px] top-8 bottom-8 w-px bg-[var(--fio)] opacity-40 hidden md:block" />

          <div className="space-y-8">
            {ETAPAS.map((etapa, i) => (
              <motion.div
                key={etapa.numero}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12 }}
                className="flex gap-6 sm:gap-8 items-start"
              >
                <div className="flex-shrink-0 w-14 h-14 bg-[var(--marcador)] flex items-center justify-center font-black text-[#17171a] text-lg z-10">
                  {etapa.numero}
                </div>
                <div
                  className="flex-1 bg-[var(--bg-card)] border rounded-none p-6"
                  style={{
                    borderColor: etapa.destaque
                      ? "rgba(243,106,34,0.35)"
                      : "var(--border)",
                  }}
                >
                  <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">
                    {etapa.titulo}
                  </h3>
                  <p className="text-[var(--text-muted)] leading-relaxed">
                    {etapa.descricao}
                  </p>

                  {etapa.redes && (
                    <div className="flex flex-wrap items-center gap-3 mt-5">
                      {REDES.map(({ Logo, nome }) => (
                        <div key={nome} className="flex items-center gap-2">
                          <Logo className="!w-8 !h-8" />
                          <span className="text-xs text-[var(--text-muted)] hidden sm:inline">
                            {nome}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
