"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, ThumbsUp, CalendarClock } from "lucide-react";
import { AGENTES } from "@/lib/squad/estado-do-squad";
import { LogoLinkedIn, LogoX, LogoInstagram, LogoFacebook, LogoYouTube, LogoTikTok } from "@/components/social/logos-redes";

/**
 * O QUE ELES ESTÃO FAZENDO, com o clipe grande e os balões.
 *
 * Nasceu em 19/09 do pedido do Bruno: "deixe o vídeo maior em uma seção
 * abaixo, mostrando o que eles estão fazendo com balões com motions,
 * mostrando agentes trabalhando sozinhos, interagem entre si, embaixo veja os
 * posts, aprove, agende ou publique".
 *
 * O clipe estava na coluna direita da hero, com metade da largura da página, e
 * ali ele competia com o título: quem chega lê a manchete OU olha o vídeo, e
 * o vídeo perdia sempre. Numa seção própria ele ocupa a largura toda e vira o
 * que é, a prova de que a plataforma existe e roda.
 *
 * OS BALÕES SÃO A LEGENDA DO CLIPE. O escritório 3D mostra sete robôs andando,
 * e sem legenda ninguém sabe o que está vendo. Cada balão nomeia um agente, na
 * cor dele, e diz o que ele faz naquele instante. Dois deles são CONVERSA
 * entre agentes, porque é isso que separa um squad de sete botões: a Vera
 * devolve para o Lucas, e o Lucas refaz.
 *
 * Os balões somem no celular. Sobrepostos numa tela estreita eles cobririam o
 * próprio vídeo, e a seção existe para o vídeo ser visto.
 */

type Balao = {
  /** O id do agente em lib/squad/estado-do-squad, de onde sai a cor. */
  de: string;
  /** Quando é conversa, para quem. Sai escrito no balão. */
  para?: string;
  texto: string;
  /** Posição em porcentagem do quadro do vídeo, sempre numa borda escura. */
  x: string;
  y: string;
};

/**
 * As posicoes ficam nas BORDAS ESCURAS do quadro, nunca no miolo.
 *
 * Medido na foto de 19/09: no centro ficam os agentes, o calendario da semana
 * e os baloes do proprio escritório. Balao nosso ali cobre exatamente o que a
 * seção existe para mostrar.
 */
/**
 * Exportada para o teste de render poder conferi-la.
 *
 * Com um balao por vez, o HTML do servidor so tem o PRIMEIRO, entao procurar
 * "Vera" no render acusaria falta de um balao que existe e ainda nao chegou a
 * vez. O que se prova no render e o balao visivel; o elenco se prova aqui.
 */
export const BALOES: Balao[] = [
  // Posições refeitas para a gravação de 01/10 (barra lateral à esquerda,
  // abas no alto, escritório no meio): os balões ficam na barra lateral, na
  // faixa das abas e no chão vazio perto do sofá.
  { de: "roberto-radar", texto: "Achei o que está pegando no X esta semana.", x: "2%", y: "38%" },
  { de: "lucas-linkedin", texto: "Abertura reescrita, agora começa pela tese.", x: "62%", y: "5%" },
  { de: "igor-instagram", texto: "Legenda do Instagram com a primeira linha que para o polegar.", x: "30%", y: "5%" },
  { de: "vera-veredito", para: "Tiago", texto: "Devolvi: a legenda não conversa com o vídeo.", x: "2%", y: "60%" },
  { de: "diana-design", texto: "Carrossel pronto: lâmina 5 de 5.", x: "2%", y: "80%" },
  { de: "paulo-publicador", para: "todos", texto: "Terça, 9h, agendado nas seis redes.", x: "36%", y: "84%" },
];

const PASSOS = [
  { icone: Eye, titulo: "Veja os posts", texto: "A semana inteira pronta, peça por peça, no formato de cada rede." },
  { icone: ThumbsUp, titulo: "Aprove", texto: "Ou peça mudança por escrito, como você pediria para um redator." },
  { icone: CalendarClock, titulo: "Agende ou publique", texto: "No horário que você escolheu, ou agora, direto nas suas contas." },
];

function corDe(id: string): string {
  return AGENTES.find((a) => a.id === id)?.cor ?? "var(--accent-orange)";
}
function nomeDe(id: string): string {
  return AGENTES.find((a) => a.id === id)?.primeiroNome ?? "";
}

export function OQueElesFazem() {
  /**
   * UM BALAO DE CADA VEZ, em roda.
   *
   * 3,4 s e o tempo de ler uma frase curta sem pressa e sem esperar. Mais
   * longo vira cartaz parado; mais curto e legenda que some antes de ser lida.
   */
  const [balaoAtual, setBalaoAtual] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setBalaoAtual((i) => (i + 1) % BALOES.length), 3400);
    return () => clearInterval(t);
  }, []);

  // `scroll-mt-24` porque a navbar é fixa: sem isto, quem chega pelo link de
  // âncora cai com o título escondido atrás dela.
  return (
    <section id="ao-vivo" className="py-24 lg:py-32 relative scroll-mt-24">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl lg:text-5xl font-black mb-4" style={{ color: "var(--text-primary)" }}>
            Eles trabalham sozinhos. E conversam entre si.
          </h2>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: "var(--text-muted)" }}>
            Isto não é uma animação do que a plataforma faria. É a plataforma rodando, gravada de
            verdade: o escritório 3D da equipe, a semana no calendário e uma peça pronta esperando a sua aprovação.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative"
        >
          <div
            className="overflow-hidden rounded-2xl border shadow-[0_40px_100px_rgba(0,0,0,.5)]"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="ml-2 text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                demandou, ao vivo
              </span>
            </div>

            {/* Mudo e em laço, sem controles: é prova, não é filme para
                assistir. Vídeo com som que começa sozinho é o jeito mais
                rápido de a pessoa fechar a aba. O `poster` evita o retângulo
                preto no primeiro segundo. */}
            <div className="relative">
              <video
                className="block w-full h-auto"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                poster="/demo/escritorio-0110-capa.jpg"
                aria-label="A plataforma rodando: a equipe de agentes no escritório 3D, a semana no calendário e uma peça aberta para aprovar"
              >
                {/* Gravação de 01/10, do Gestor de hoje (tema escuro, marca de
                    volta ao logo laranja): capturada quadro a quadro em 2x
                    (3200x1800) com relógio virtual, então sai a 30 quadros por
                    segundo de verdade, e reduzida a 1920x1080 em H.264 leve
                    (2 MB, sem áudio). Roteiro: escritório vivo, a semana no
                    calendário, um carrossel aberto e de volta ao escritório,
                    para o laço emendar. Nome com a data de propósito: com o
                    nome antigo, quem já visitou continuaria vendo o vídeo
                    guardado. Gravador: scratchpad da sessão de 01/10,
                    escritorio/gravar2.mjs. */}
                <source src="/demo/escritorio-0110.mp4" type="video/mp4" />
              </video>

              {/* Os balões, por cima do quadro. `pointer-events-none` no
                  contêiner: eles legendam, não clicam, e não podem roubar o
                  clique de quem quiser pausar o vídeo. */}
              <div className="hidden lg:block absolute inset-0 pointer-events-none">
                <AnimatePresence mode="wait">
                  {BALOES.map((b, i) =>
                    i === balaoAtual ? (
                      <motion.div
                        key={i}
                        className="absolute max-w-[280px]"
                        style={{ left: b.x, top: b.y }}
                        initial={{ opacity: 0, y: 12, scale: 0.94 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.97 }}
                        transition={{ duration: 0.45, ease: [0.2, 0.9, 0.25, 1] }}
                      >
                        <div
                          className="rounded-2xl rounded-bl-sm border px-3.5 py-2.5 backdrop-blur-md shadow-2xl"
                          style={{
                            borderColor: `${corDe(b.de)}80`,
                            // Azul-noite da landing (era o grafite de antes do rebranding).
                            background: "rgba(6,17,31,.92)",
                          }}
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: corDe(b.de) }} />
                            <span className="text-[11px] font-bold" style={{ color: corDe(b.de) }}>
                              {nomeDe(b.de)}
                              {b.para && <span style={{ color: "var(--text-muted)" }}> para {b.para}</span>}
                            </span>
                          </div>
                          <p className="text-xs leading-snug" style={{ color: "var(--text-primary)" }}>
                            {b.texto}
                          </p>
                        </div>
                      </motion.div>
                    ) : null
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </motion.div>

        {/* A FAIXA DOS TRÊS PASSOS, logo abaixo do quadro.
            É a resposta para "e o que sobra para mim?": a equipe trabalha, e a
            decisão continua sua. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          {PASSOS.map((p, i) => (
            <motion.div
              key={p.titulo}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 * i, duration: 0.45 }}
              className="rounded-xl border p-5"
              style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
            >
              <div className="flex items-center gap-2.5 mb-2">
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "color-mix(in srgb, var(--acento) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--acento) 30%, transparent)" }}
                >
                  <p.icone className="w-4 h-4" style={{ color: "var(--accent-orange)" }} />
                </span>
                <span className="font-bold" style={{ color: "var(--text-primary)" }}>
                  {p.titulo}
                </span>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {p.texto}
              </p>
            </motion.div>
          ))}
        </div>

        <div className="flex items-center justify-center gap-2 mt-8">
          <span className="text-sm mr-1" style={{ color: "var(--text-muted)" }}>
            Nas suas contas de
          </span>
          <LogoLinkedIn className="!w-7 !h-7 !rounded-md" />
          <LogoInstagram className="!w-7 !h-7 !rounded-md" />
          <LogoFacebook className="!w-7 !h-7 !rounded-md" />
          <LogoX className="!w-7 !h-7 !rounded-md" />
          <LogoYouTube className="!w-7 !h-7 !rounded-md" />
          <LogoTikTok className="!w-7 !h-7 !rounded-md" />
        </div>
      </div>
    </section>
  );
}
