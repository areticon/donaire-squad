"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * O CARROSSEL DE EXEMPLOS: o mesmo corte, ofício por ofício.
 *
 * Existe porque a seção da entrega mostrava UMA gravação, e quem chega na
 * página precisa se ver nela. O ICP não é uma pessoa: é consultor, dentista,
 * advogado, dono de negócio e quem vive de tráfego, e cada um grava por um
 * motivo diferente. A legenda de cada cartão diz o que a pessoa JÁ GRAVAVA
 * antes de conhecer a Demandou, que é o filtro do ICP fechado em 25/08.
 *
 * As imagens são ILUSTRAÇÃO, e não saída da esteira: as pessoas não existem
 * (geradas no Nano Banana Pro) e a legenda foi queimada por código com a mesma
 * fonte, cor e contorno que o produto usa. Por isso esta seção não repete a
 * frase "saídas reais da plataforma", que a seção da entrega usa e cumpre.
 */

type Exemplo = {
  arquivo: string;
  oficio: string;
  gravou: string;
};

const EXEMPLOS: Exemplo[] = [
  {
    arquivo: "/exemplo/carrossel/consultora.jpg",
    oficio: "Consultoria",
    gravou: "Gravou a aula da mentoria",
  },
  {
    arquivo: "/exemplo/carrossel/dentista.jpg",
    oficio: "Odontologia",
    gravou: "Gravou a explicação que dá todo dia",
  },
  {
    arquivo: "/exemplo/carrossel/advogado.jpg",
    oficio: "Advocacia",
    gravou: "Gravou o parecer que já tinha dado",
  },
  {
    arquivo: "/exemplo/carrossel/empresaria.jpg",
    oficio: "Indústria",
    gravou: "Gravou a conversa com o time",
  },
  {
    arquivo: "/exemplo/carrossel/marketing.jpg",
    oficio: "Marketing digital",
    gravou: "Gravou a análise da campanha",
  },
];

export function Exemplos() {
  const trilho = useRef<HTMLDivElement>(null);
  const [noComeco, setNoComeco] = useState(true);
  const [noFim, setNoFim] = useState(false);

  function medir() {
    const el = trilho.current;
    if (!el) return;
    setNoComeco(el.scrollLeft < 8);
    setNoFim(el.scrollLeft + el.clientWidth >= el.scrollWidth - 8);
  }

  function andar(direcao: 1 | -1) {
    const el = trilho.current;
    if (!el) return;
    // Um cartão por clique: a largura do primeiro filho mais o vão.
    const passo = (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 300;
    el.scrollBy({ left: direcao * (passo + 20), behavior: "smooth" });
  }

  return (
    <section id="exemplos" className="py-24 lg:py-32 relative">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-full px-4 py-1.5 text-sm text-orange-400 mb-6">
            Exemplos
          </div>
          <h2 className="text-4xl lg:text-5xl font-black text-[var(--text-primary)] mb-4">
            O mesmo corte,
            <br />
            para o seu ofício.
          </h2>
          <p className="text-lg text-[var(--text-muted)] max-w-2xl mx-auto">
            Você já grava: aula, consulta explicada, parecer, reunião, análise de
            campanha. O squad assiste, escolhe o momento que presta e devolve o
            corte vertical legendado, pronto para Shorts e Reels.
          </p>
        </motion.div>

        <div className="relative">
          <div
            ref={trilho}
            onScroll={medir}
            className="flex gap-5 overflow-x-auto snap-x snap-mandatory pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {EXEMPLOS.map((e, i) => (
              <motion.figure
                key={e.arquivo}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ delay: Math.min(i, 3) * 0.08 }}
                className="snap-start shrink-0 w-[240px] sm:w-[270px]"
              >
                <div className="rounded-2xl overflow-hidden border border-[var(--border)] bg-[var(--bg-card)]">
                  {/* Sem `next/image` de propósito: o resto desta página usa
                      `img` direto, e misturar os dois muda o comportamento de
                      carregamento no meio da mesma tela. */}
                  <img
                    src={e.arquivo}
                    alt={`Corte vertical de um profissional de ${e.oficio.toLowerCase()}, com legenda queimada`}
                    className="w-full aspect-[9/16] object-cover"
                    loading="lazy"
                  />
                </div>
                <figcaption className="mt-3">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{e.oficio}</p>
                  <p className="text-sm text-[var(--text-muted)]">{e.gravou}</p>
                </figcaption>
              </motion.figure>
            ))}
          </div>

          {/* As setas só existem onde há o que rolar, e somem nas pontas: seta
              que não faz nada ensina a pessoa a ignorar as suas setas. */}
          <button
            type="button"
            onClick={() => andar(-1)}
            aria-label="Ver os exemplos anteriores"
            disabled={noComeco}
            className="hidden lg:flex absolute -left-4 top-1/2 -translate-y-1/2 h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)] transition-opacity disabled:opacity-0 hover:border-orange-500 hover:text-orange-500 cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => andar(1)}
            aria-label="Ver os próximos exemplos"
            disabled={noFim}
            className="hidden lg:flex absolute -right-4 top-1/2 -translate-y-1/2 h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)] transition-opacity disabled:opacity-0 hover:border-orange-500 hover:text-orange-500 cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </section>
  );
}
