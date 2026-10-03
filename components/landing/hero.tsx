"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BotaoDeCaptura } from "@/components/landing/botao-de-captura";
import { SquadNaHero } from "@/components/landing/squad-na-hero";
import { VIDEO_PITCH_PRONTO } from "@/components/landing/video-pitch";
import {
  ArrowRight,
  Zap,
  PlayCircle,
} from "lucide-react";


export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      {/* A grade desliza devagar e o brilho respira: são os dois movimentos que
          continuam vivos depois que a coreografia de chegada termina. Movimento
          contínuo tem que ser lento, senão a página fica inquieta em vez de
          viva. */}
      <div className="lp-grade absolute inset-0 bg-[linear-gradient(to_right,var(--bg-elevated)_1px,transparent_1px),linear-gradient(to_bottom,var(--bg-elevated)_1px,transparent_1px)] bg-[size:48px_48px] opacity-40" />

      <div className="lp-brilho absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-orange-500/5 rounded-full blur-3xl" />

      {/* pt-36 desde 02/10: as frases novas alongaram a coluna, e com pt-24 o
          selo do topo passava por baixo da barra fixa numa tela de 900 px. */}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-36 pb-16">
        {/* minmax(0,1fr) no celular (01/10): a coluna implícita do grid crescia
            até o conteúdo mais largo (475px numa tela de 390) e cortava o
            título pela borda. */}
        <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-2 gap-16 items-center">
          {/* Left */}
          <div>
            {/* RODADA DO MATHEUS (02/10, noite): linguagem de empresário,
                frase curta, uma por vez. "Squad" virou "equipe"; o título é a
                frase dele; o selo diz que a equipe é de IA, para ninguém achar
                que os retratos são funcionários. */}
            <div
              className="lp-sobe selo mb-6"
              style={{ animationDelay: "0.05s" }}
            >
              <Zap className="w-3.5 h-3.5 shrink-0" />
              {/* A frase de plataforma no selo (02/10, noite): "IA" no topo
                  assustava, e o empresário lia "conteúdo genérico". */}
              <span>A plataforma que gera 30 dias de conteúdo em 3 horas</span>
            </div>

            <h1
              className="lp-sobe text-5xl lg:text-6xl font-semibold tracking-tight text-[var(--text-primary)] leading-[1.04] mb-6"
              style={{ animationDelay: "0.16s" }}
            >
              {/* "marketing", e não "equipe" (02/10, noite, pedido do Matheus):
                  quem compra é o empresário, e ele compra marketing. */}
              Já pensou o seu marketing trabalhando{" "}
              {/* nowrap: o traço é um ::after do span inteiro, e quebrado em duas
                  linhas ele riscava só o pedaço final. */}
              <span className="lp-risca whitespace-nowrap" style={{ animationDelay: "0.95s" }}>
                24 horas
              </span>{" "}
              por dia?{" "}
              <span className="destaque-prata">Sem férias.</span>
            </h1>

            {/* A frase das 3 horas mora no selo, acima do título (02/10, noite);
                a linha que ficava aqui saiu para não repetir. A conta: 4
                gravações de até 30 minutos no Starter mais a aprovação. */}
            <div className="lp-sobe space-y-1.5 mb-6 max-w-lg" style={{ animationDelay: "0.32s" }}>
              <p className="text-xl font-semibold text-[var(--text-primary)]">O mais visto sempre vence o melhor.</p>
              <p className="text-xl text-[var(--text-muted)]">Quantas vezes o seu cliente te viu nos últimos 7 dias?</p>
            </div>

            <p
              className="lp-sobe text-lg text-[var(--text-primary)] leading-relaxed mb-8 max-w-lg"
              style={{ animationDelay: "0.42s" }}
            >
              <strong className="font-semibold">Você fala e aprova.</strong> A equipe edita, corta, escreve,
              desenha, agenda e publica nas 6 redes.
            </p>

            <div
              className="lp-sobe flex flex-col sm:flex-row gap-4 mb-4"
              style={{ animationDelay: "0.54s" }}
            >
              {/* O laranja cheio da hero é este botão e só ele (01/10). */}
              <BotaoDeCaptura origem="hero" size="xl" variant="conversao" className="lp-anel">
                Agendar reunião
                <ArrowRight className="w-5 h-5" />
              </BotaoDeCaptura>
              {/* "Contratar" (02/10, pedido do Matheus): leva a /planos, onde
                  existe o caminho de contratação (cadastro com o plano e o
                  checkout anual no Stripe). */}
              <Button size="xl" variant="outline" asChild>
                <Link href="/planos">Contratar</Link>
              </Button>
            </div>
            {VIDEO_PITCH_PRONTO && (
              <a href="#video" className="lp-sobe inline-flex items-center gap-1.5 text-sm font-semibold text-orange-400 hover:text-orange-300 mb-8" style={{ animationDelay: "0.58s" }}>
                <PlayCircle className="w-4 h-4" /> Assistir ao vídeo de 90 segundos
              </a>
            )}

            {/* A ESTATÍSTICA (02/10): saiu "73% dos decisores confiam mais no
                conteúdo que no folder", difícil de ler. Entrou a fatia da
                compra decidida antes do vendedor, com fonte: 6sense, B2B Buyer
                Experience Report 2024 ("nearly 70% through their purchasing
                process before engaging with sellers"; 81% já têm um fornecedor
                preferido no primeiro contato). */}
            <div className="lp-sobe mb-8 max-w-lg rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]/60 px-4 py-3" style={{ animationDelay: "0.6s" }}>
              <p className="text-base text-[var(--text-primary)]">
                <strong className="text-orange-400">70% da decisão de compra</strong> acontece antes de o cliente falar com você.
              </p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">Fonte: 6sense, B2B Buyer Experience Report, 2024.</p>
            </div>

            {/* Saíram daqui (02/10, noite, pedido do Matheus) "Para empresas
                acima de R$ 100 mil por mês", que assustava quem nem clicava, e
                "Contrato anual". O contrato anual segue escrito nos cartões de
                preço, que é onde se decide pagar. */}
          </div>

          {/* Right — O CARTÃO DO SQUAD.

              Ele saiu daqui em 19/09 para o clipe da plataforma entrar, e
              voltou no mesmo dia. O motivo da troca continuava certo (uma
              ilustração do produto não prova nada) e o custo estava errado: a
              hero passou a mostrar O PRODUTO e deixou de apresentar QUEM
              trabalha, que é o que separa a Demandou de um gerador de post.

              As duas coisas convivem agora: aqui ficam as pessoas, e o clipe
              desce para uma seção própria, em largura quase total, onde ele
              tem espaço para ser visto em vez de disputar atenção com o
              título. Ver components/landing/o-que-eles-fazem.tsx. */}
          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative isolate"
          >
            <SquadNaHero />

            {/* A arte entra como CAMADA, nunca como estrutura: se ela sumir, a
                página continua de pé. Some abaixo de 1280 px, onde não sobra
                espaço. Desde 01/10 ela sai menos para a esquerda (era -left-28):
                avançava 112 px sobre o vão entre as colunas e encostava no
                botão "Assistir ao vídeo". */}
            <motion.img
              src="/artes/setas.png"
              alt=""
              aria-hidden
              initial={{ opacity: 0, x: -40, rotate: -5 }}
              animate={{ opacity: 1, x: 0, rotate: -3 }}
              transition={{ delay: 1.7, duration: 0.7, ease: [0.2, 0.9, 0.25, 1] }}
              className="hidden xl:block pointer-events-none absolute -z-10 -left-8 -bottom-24 w-[400px]"
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
