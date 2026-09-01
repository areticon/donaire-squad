"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";

/**
 * O que o squad entrega, com prova em imagem.
 *
 * A landing contava a história do vídeo em prosa, e prosa não vende
 * transformação: quem lê "o squad edita e distribui" imagina qualquer coisa.
 * Aqui as imagens são SAÍDAS REAIS do produto, geradas a partir de uma gravação
 * de verdade, mostradas lado a lado com o material cru de onde vieram.
 *
 * O antes é o argumento. Sozinho, o depois parece só uma imagem bonita que
 * qualquer um poderia ter feito no Canva; com o antes ao lado, fica claro que o
 * trabalho foi feito por alguém.
 *
 * As imagens vivem em `public/exemplo/` com nome descritivo, para trocar sem
 * caçar referência no código quando houver material de cliente melhor.
 */

const ENTREGAS = [
  {
    titulo: "A gravação inteira, editada",
    descricao:
      "Sai completa, do jeito que você gravou, sem as pausas longas e com os melhores momentos marcados na tela. Vai para o seu canal com capítulos, título e descrição prontos.",
    itens: [
      "Pausas longas removidas",
      "Momentos em destaque na tela",
      "Capítulos no YouTube",
    ],
    // Capítulos reais gerados pela plataforma a partir de uma gravação de 27
    // minutos. Mostrar o artefato vale mais que descrevê-lo.
    capitulos: [
      ["0:00", "Abertura"],
      ["3:21", "A armadilha de vender consultoria em vez de assinatura"],
      ["6:44", "Por que saí do corporativo: não foi dinheiro, foi política"],
      ["12:01", "Mesmo sendo CLT, você precisa gerar conteúdo"],
      ["20:39", "Como eu uso IA pra nunca perder o fio da meada"],
      ["26:17", "Os nãos são mais comuns que os sins, mas o sim muda tudo"],
    ],
  },
  {
    titulo: "Os cortes, enquadrados para cada rede",
    descricao:
      "O squad olha a sua gravação quadro a quadro e decide o enquadramento. Gravou compartilhando a tela? O conteúdo vai grande em cima e você embaixo, em vez de virar um slide ilegível no meio do vídeo.",
    itens: [
      "Vertical para Shorts e Reels",
      "Enquadramento decidido por quem olhou",
      "Um corte por momento que presta",
    ],
    antes: {
      src: "/exemplo/corte-antes.jpg",
      alt: "Quadro original da gravação, em formato horizontal, com o slide pequeno e a webcam no canto",
      rotulo: "Sua gravação",
    },
    depois: {
      src: "/exemplo/corte-depois.jpg",
      alt: "O mesmo momento em formato vertical, com o slide grande em cima e a pessoa embaixo",
      rotulo: "O corte pronto",
    },
    vertical: true,
  },
  {
    titulo: "A capa, feita para dar vontade de clicar",
    descricao:
      "O squad procura no vídeo inteiro um quadro com o seu rosto, corrige a expressão, recorta você do fundo da sua sala e monta uma capa com fundo alinhado ao seu nicho.",
    itens: [
      "Boca fechada, olhar na câmera",
      "Fundo novo, coerente com o seu tema",
      "Frase de impacto, legível no celular",
    ],
    antes: {
      src: "/exemplo/capa-antes.jpg",
      alt: "Quadro cru da gravação, com a pessoa falando e o fundo da sala",
      rotulo: "Um quadro qualquer",
    },
    depois: {
      src: "/exemplo/capa-depois.jpg",
      alt: "Capa de vídeo com a pessoa recortada, fundo de escritório e o texto Consultoria não escala",
      rotulo: "A capa entregue",
    },
  },
  {
    titulo: "Os textos, um por rede",
    descricao:
      "O mesmo momento vira um texto para o LinkedIn, um para o X e uma legenda para o Instagram. Cada um escrito para como as pessoas leem naquela rede, e todos na sua voz.",
    itens: [
      "Escritos a partir do que você falou",
      "Nada inventado, nada de promessa vazia",
      "Você aprova antes de qualquer coisa sair",
    ],
    textos: [
      {
        rede: "LinkedIn",
        trecho:
          "Passei dois anos vendendo consultoria e trocando meu tempo por dinheiro. Dava certo, e não escalava. Assinatura vende resultado que continua acontecendo sem você na sala.",
      },
      {
        rede: "X",
        trecho:
          "Consultoria escala até o limite das suas horas. Assinatura escala até o limite do seu produto. Não é o mesmo negócio.",
      },
      {
        rede: "Instagram",
        trecho:
          "Eu queria vender assinatura pra escalar sem esforço. Levei dois anos vendendo hora pra entender a diferença.",
      },
    ],
  },
];

export function Entrega() {
  return (
    <section id="entrega" className="py-24 lg:py-32 relative">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 border-b border-[var(--fio)] pb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-primary)] mb-6">
            A entrega
          </div>
          <h2 className="text-4xl lg:text-5xl font-black text-[var(--text-primary)] mb-4">
            Você grava uma vez.
            <br />
            Sai conteúdo para a semana inteira.
          </h2>
          <p className="text-lg text-[var(--text-muted)] max-w-2xl mx-auto">
            As imagens abaixo são saídas reais da plataforma, a partir de uma
            gravação de verdade. Nenhuma delas foi feita à mão.
          </p>
        </motion.div>

        <div className="space-y-20">
          {ENTREGAS.map((entrega, i) => (
            <motion.div
              key={entrega.titulo}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5 }}
              className={`grid lg:grid-cols-2 gap-10 items-center ${
                // Alterna o lado da imagem para a página não virar uma coluna
                // só de texto seguida de uma coluna só de imagem.
                i % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""
              }`}
            >
              <div>
                <h3 className="text-2xl lg:text-3xl font-bold text-[var(--text-primary)] mb-3">
                  {entrega.titulo}
                </h3>
                <p className="text-[var(--text-muted)] leading-relaxed mb-6">
                  {entrega.descricao}
                </p>
                <ul className="space-y-2.5">
                  {entrega.itens.map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <Check className="w-4 h-4 text-orange-500 shrink-0 mt-1" />
                      <span className="text-[var(--text-primary)]">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {entrega.antes && entrega.depois ? (
                <div
                  className={`grid gap-4 items-center ${
                    entrega.vertical ? "grid-cols-[1.5fr_1fr]" : "grid-cols-2"
                  }`}
                >
                  {[entrega.antes, entrega.depois].map((img, idx) => (
                    <figure key={img.src} className="space-y-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.src}
                        alt={img.alt}
                        loading="lazy"
                        // O corte vertical tem 9:16 e o quadro original 16:9. Sem
                        // teto de altura, a linha inteira cresce para caber o
                        // vertical e o horizontal fica perdido num mar de vazio.
                        className={`w-full rounded-none border object-contain ${
                          entrega.vertical && idx === 1 ? "max-h-[420px] w-auto mx-auto" : ""
                        } ${
                          // A logica da referencia de colagem aplicada a prova:
                          // o ANTES e a gravacao crua, e vai em preto e branco;
                          // o DEPOIS e o que a plataforma entrega, e e o unico
                          // que tem cor. A comparacao passa a se explicar
                          // sozinha, sem legenda dizendo qual e qual.
                          idx === 1
                            ? "border-[var(--fio)] shadow-[0_8px_24px_rgba(23,23,26,0.16)]"
                            : "border-[var(--border)] recorte-pb opacity-80"
                        }`}
                      />
                      <figcaption
                        className={`text-xs text-center ${
                          idx === 1 ? "text-orange-400" : "text-[var(--text-muted)]"
                        }`}
                      >
                        {img.rotulo}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ) : entrega.capitulos ? (
                <div
                  className="rounded-none border p-6"
                  style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
                >
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-4">
                    Descrição gerada, com os capítulos
                  </p>
                  <ul className="space-y-2.5">
                    {entrega.capitulos.map(([tempo, titulo]) => (
                      <li key={tempo} className="flex gap-3 text-sm">
                        <span className="text-orange-400 tabular-nums shrink-0 font-medium">
                          {tempo}
                        </span>
                        <span className="text-[var(--text-primary)]">{titulo}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : entrega.textos ? (
                <div className="space-y-3">
                  {entrega.textos.map((t) => (
                    <div
                      key={t.rede}
                      className="rounded-none border p-4"
                      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
                    >
                      <p className="text-xs font-semibold text-orange-400 mb-1.5">{t.rede}</p>
                      <p className="text-sm text-[var(--text-primary)] leading-relaxed">
                        {t.trecho}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
