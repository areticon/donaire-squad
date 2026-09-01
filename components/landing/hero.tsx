"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BlocoMarcador, Fio, Marcador, Recorte, Rotulo } from "@/components/landing/papel";

/**
 * A esteira que o cliente compra, escrita como índice de revista.
 *
 * Era um cartão de "agentes ao vivo" imitando janela de programa, com bolinha
 * vermelha, amarela e verde. Saiu em 01/09 com a direção de colagem do Bruno:
 * a promessa não é "temos um software rodando", é "o trabalho sai feito", e
 * lista numerada com fio embaixo conta isso sem fingir uma tela.
 */
const ESTEIRA = [
  { n: "01", agente: "Vitor Vídeo", faz: "acha os melhores momentos e corta" },
  { n: "02", agente: "Daniela Design", faz: "monta capa, cartela e carrossel" },
  { n: "03", agente: "Lucas LinkedIn", faz: "escreve no seu tom" },
  { n: "04", agente: "Tiago Twitter", faz: "corta a ideia em fio" },
  { n: "05", agente: "Vera Revisora", faz: "revisa antes de você ver" },
  { n: "06", agente: "Paulo Publicador", faz: "publica em todas as redes" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-28 pb-20 sm:pt-32">
      <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
        {/* Os fios que costuram a composição, como na referência: começam fora
            do conteúdo e terminam por cima dele. */}
        {/* O fio passa por ESPACO VAZIO, nunca por cima de texto corrido: no
            primeiro screenshot ele cortou uma linha do paragrafo e leu como
            texto riscado. Aqui ele costura a base da composicao. */}
        <Fio className="bottom-2 hidden sm:block" />
        <Fio className="bottom-[3px] hidden sm:block" alcance="-left-[8%] w-[38%]" />

        <div className="grid items-start gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="relative z-10"
          >
            <Rotulo>Conteúdo com agentes de IA</Rotulo>

            {/*
              O trocadilho é o nome do produto e a promessa inteira: você
              demandou (falou o que precisa), ele postou (o conteúdo saiu
              pronto). O marcador cai em "postou", que é a parte que o cliente
              não faz hoje.
            */}
            <h1 className="mt-7 font-mont text-[2.7rem] font-black leading-[0.98] tracking-[-0.02em] text-[var(--text-primary)] sm:text-6xl">
              Você falou.
              <br />
              demandou.{" "}
              <Marcador cheio>postou.</Marcador>
            </h1>

            <p className="mt-8 max-w-md text-lg leading-relaxed text-[var(--text-muted)]">
              Quem não publica não existe para o mercado. Autoridade é o que faz
              você cobrar mais caro, ser lembrado na indicação e receber a
              proposta sem disputar preço, e ela vem de publicar com
              consistência, que é o que 99% não conseguem manter.
            </p>

            <p className="mt-6 max-w-md text-lg leading-relaxed text-[var(--text-primary)]">
              Grave um vídeo falando do jeito que você fala. Seu squad
              transcreve, corta, escreve, desenha e publica em todas as suas
              redes. <Marcador>E soa como você</Marcador>, porque estuda o seu
              tom, os seus temas e as suas referências.
            </p>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Button size="xl" asChild>
                <Link href="/planos">
                  Começar os 7 dias grátis
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>
              <Button size="xl" variant="outline" asChild>
                <a href="#how">Ver como funciona</a>
              </Button>
            </div>

            <p className="mt-6 text-sm text-[var(--text-muted)]">
              7 dias grátis, cancele quando quiser.
            </p>
          </motion.div>

          {/* A colagem: um recorte de papel por cima do bloco de marcador, com
              o fio passando por baixo. */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.12 }}
            className="relative"
          >
            <BlocoMarcador className="-left-10 top-24 h-44 w-[72%] sm:h-52" />

            <Recorte className="relative z-10 ml-auto w-full max-w-md p-7" rasgado>
              <div className="flex items-baseline justify-between border-b border-[var(--fio)] pb-3">
                <span className="font-mont text-sm font-bold uppercase tracking-[0.16em]">
                  A esteira
                </span>
                <span className="text-xs text-[var(--text-muted)]">um vídeo, uma semana</span>
              </div>

              <ul className="mt-1">
                {ESTEIRA.map((e) => (
                  <li
                    key={e.n}
                    className="flex items-baseline gap-4 border-b border-[var(--border)] py-3.5 last:border-b-0"
                  >
                    <span className="font-mono text-xs text-[var(--text-muted)]">{e.n}</span>
                    <span className="flex-1">
                      <span className="block font-semibold text-[var(--text-primary)]">
                        {e.agente}
                      </span>
                      <span className="block text-sm text-[var(--text-muted)]">{e.faz}</span>
                    </span>
                  </li>
                ))}
              </ul>

              <div className="pb-6" />
            </Recorte>

            {/* O carimbo de resultado, colado torto por cima do recorte. */}
            <div className="relative z-20 -mt-6 ml-4 inline-block rotate-[-1.6deg] bg-[var(--marcador)] px-4 py-2 shadow-[0_4px_14px_rgba(23,23,26,0.14)]">
              <span className="font-mont text-sm font-black uppercase tracking-wide text-[#17171a]">
                Cortes prontos em 2 minutos
              </span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
