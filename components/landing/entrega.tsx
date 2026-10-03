"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";

/**
 * O que a equipe entrega, com prova em imagem.
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

import { LogoLinkedIn, LogoX, LogoInstagram, LogoYouTube, LogoTikTok } from "@/components/social/logos-redes";

/**
 * O logo da rede ao lado do nome dela.
 *
 * Regra do Bruno (19/09): a pessoa reconhece a rede pelo logo antes de ler o
 * nome, entao etiqueta de rede sem logo custa um tempo de leitura que ninguem
 * precisa gastar.
 */
const LOGO_DA_REDE: Record<string, React.ComponentType<{ className?: string }>> = {
  LinkedIn: LogoLinkedIn,
  X: LogoX,
  Instagram: LogoInstagram,
  YouTube: LogoYouTube,
  TikTok: LogoTikTok,
};

function LogoDaRede({ nome }: { nome: string }) {
  const Logo = LOGO_DA_REDE[nome];
  return Logo ? <Logo className="!w-4 !h-4 !rounded" /> : null;
}

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
    titulo: "A capa, feita para dar vontade de clicar",
    descricao:
      "A equipe procura no vídeo inteiro um quadro com o seu rosto, recorta você do fundo da sua sala e monta a capa no estilo da edição que você escolheu, com a frase que dá vontade de clicar.",
    itens: [
      "Boca fechada, olhar na câmera",
      "Fundo no estilo da sua edição",
      "Frase de impacto, legível no celular",
    ],
    // REAIS desde 01/10 (pedido do Bruno): o quadro que a esteira escolheu da
    // gravação de 29/09 (capaFonteUrl) e a capa que ela entregou para o vídeo
    // completo, do projeto Empreendedorismo Cristão. A versão anterior usava
    // uma pessoa gerada por IA, que era ilustração.
    // REFEITAS em 02/10: a capa anterior dizia "SUA IA AINDA E ESTAGIARIA",
    // sem acento (o modelo largou o acento na frase; conserto em
    // lib/media/acentuacao.ts), e o quadro era fraco. Agora o quadro é o que
    // worker/src/quadro-da-capa.py escolheu na mesma gravação de 29/09 (olho
    // aberto, boca quase fechada) e a capa saiu de montarCapa com a frase
    // gravada passada pelo corretor. Script: scripts/tmp/capa-landing-acento-0210.mts.
    antes: {
      src: "/pitch/capa-antes-0210.jpg",
      alt: "Quadro da gravação escolhido pela plataforma, com o Bruno falando para a câmera",
      rotulo: "O quadro escolhido na gravação",
    },
    depois: {
      src: "/pitch/capa-depois-0210.jpg",
      alt: "Capa real entregue pela plataforma, em colagem, com o texto Sua IA ainda é estagiária",
      rotulo: "A capa entregue, sem retoque",
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
          <div className="selo mb-6">
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
              className={`grid grid-cols-1 lg:grid-cols-2 gap-10 items-center ${
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

              {/* Duas colunas iguais: o unico par que sobrou aqui e o da capa,
                  e os dois lados dele sao 16:9. A coluna desigual existia para
                  o par do corte, que saiu em 10/09 e virou a secao de
                  exemplos. */}
              {entrega.antes && entrega.depois ? (
                <div className="grid grid-cols-2 gap-4 items-center">
                  {[entrega.antes, entrega.depois].map((img, idx) => (
                    <figure key={img.src} className="space-y-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.src}
                        alt={img.alt}
                        loading="lazy"
                        className={`w-full rounded-xl border object-contain ${
                          idx === 1
                            ? "border-orange-500/40 shadow-lg shadow-orange-500/10"
                            : "border-[var(--border)] opacity-70"
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
                  className="rounded-xl border p-6"
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
                      className="rounded-xl border p-4"
                      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
                    >
                      <p className="text-xs font-semibold text-orange-400 mb-1.5 flex items-center gap-1.5">
                        <LogoDaRede nome={t.rede} />
                        {t.rede}
                      </p>
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
