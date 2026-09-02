"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Zap,
  Users,
  BarChart3,
} from "lucide-react";

/**
 * O squad, na ordem em que ele trabalha.
 *
 * O Vitor Vídeo entrou em 02/09 e entrou PRIMEIRO, a pedido do Bruno: a lista
 * antiga não tinha o agente que hoje começa tudo. O produto é gravar e o resto
 * sair feito, então quem corta a gravação abre a fila, e o avatar dele é o
 * único no laranja da marca.
 */
const AGENT_NAMES = [
  { name: "Vitor Vídeo", role: "Corta a gravação", color: "bg-orange-500" },
  { name: "Daniela Design", role: "Capa e carrossel", color: "bg-purple-500" },
  { name: "Lucas LinkedIn", role: "LinkedIn", color: "bg-blue-600" },
  { name: "Tiago Twitter", role: "X/Twitter", color: "bg-sky-500" },
  { name: "Paulo Publicador", role: "Publicação", color: "bg-green-500" },
];

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      {/* A grade desliza devagar e o brilho respira: são os dois movimentos que
          continuam vivos depois que a coreografia de chegada termina. Movimento
          contínuo tem que ser lento, senão a página fica inquieta em vez de
          viva. */}
      <div className="lp-grade absolute inset-0 bg-[linear-gradient(to_right,var(--bg-elevated)_1px,transparent_1px),linear-gradient(to_bottom,var(--bg-elevated)_1px,transparent_1px)] bg-[size:48px_48px] opacity-40" />

      <div className="lp-brilho absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-orange-500/5 rounded-full blur-3xl" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left */}
          <div>
            <div
              className="lp-sobe inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-full px-4 py-1.5 text-sm text-orange-400 mb-6"
              style={{ animationDelay: "0.05s" }}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Apenas 1% publica toda semana. Esse 1% leva os clientes.</span>
            </div>

            {/*
              O trocadilho é o nome do produto e a promessa inteira: você
              demandou (falou o que precisa), ele postou (o conteúdo saiu
              pronto). O traço laranja é DESENHADO sob as duas palavras, uma
              depois da outra, e é o gesto que o Bruno aprovou no canvas antes
              de isto virar código.
            */}
            <h1
              className="lp-sobe text-5xl lg:text-6xl font-black text-[var(--text-primary)] leading-[1.05] mb-6"
              style={{ animationDelay: "0.16s" }}
            >
              Você falou.{" "}
              <span className="lp-risca text-orange-500" style={{ animationDelay: "0.95s" }}>
                demandou
              </span>
              .{" "}
              <span className="lp-risca text-orange-500" style={{ animationDelay: "1.3s" }}>
                postou
              </span>
              .
            </h1>

            <p
              className="lp-sobe text-xl text-[var(--text-muted)] leading-relaxed mb-6 max-w-lg"
              style={{ animationDelay: "0.3s" }}
            >
              Quem não publica não existe para o mercado. E autoridade é o que
              faz você cobrar mais caro, ser lembrado na hora da indicação e
              receber a proposta sem disputar preço. Ela vem de publicar com
              consistência, que é exatamente o que 99% não conseguem manter.
            </p>

            <p
              className="lp-sobe text-xl text-[var(--text-primary)] leading-relaxed mb-8 max-w-lg"
              style={{ animationDelay: "0.42s" }}
            >
              Grave um vídeo falando do jeito que você fala. Seu squad de
              agentes transcreve, corta, escreve, desenha e publica em todas as
              suas redes.{" "}
              <span className="text-orange-400">E soa como você</span>, porque
              eles estudam o seu tom, os seus temas e as suas referências.
            </p>

            <div
              className="lp-sobe flex flex-col sm:flex-row gap-4 mb-12"
              style={{ animationDelay: "0.54s" }}
            >
              <Button size="xl" className="lp-anel" asChild>
                <Link href="/planos">
                  Começar os 7 dias grátis
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </Button>
              <Button size="xl" variant="outline" asChild>
                <a href="#how">Ver como funciona</a>
              </Button>
            </div>

            <div
              className="lp-sobe flex items-center gap-6 text-sm text-[var(--text-muted)]"
              style={{ animationDelay: "0.64s" }}
            >
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-orange-400" />
                <span>7 dias grátis</span>
              </div>
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-orange-400" />
                <span>Cancele quando quiser</span>
              </div>
            </div>
          </div>

          {/* Right — o squad montando, um agente por vez */}
          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            // `isolate` cria o contexto de empilhamento do cartão. Sem ele o
            // -z-10 da arte cai atrás do FUNDO da seção e ela some; com ele o
            // -z-10 vale só aqui dentro, e a arte fica atrás do cartão e na
            // frente do fundo, que é onde a colagem quer que ela esteja.
            className="relative isolate"
          >
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 space-y-3">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="ml-2 text-xs text-[var(--text-muted)] font-mono">demandou, ao vivo</span>
              </div>

              {AGENT_NAMES.map((agent, i) => (
                <motion.div
                  key={agent.name}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.55 + i * 0.14 }}
                  className="flex items-center gap-3 bg-[var(--bg-elevated)] rounded-lg p-3 border border-[var(--border)]"
                >
                  <div className={`w-8 h-8 ${agent.color} rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                    {agent.name.split(" ").map(n => n[0]).join("")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[var(--text-primary)]">{agent.name}</div>
                    <div className="text-xs text-[var(--text-muted)]">{agent.role}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {/* Fora de fase de propósito: cinco pontos piscando no
                        mesmo compasso leem como enfeite, e não como coisa
                        viva. */}
                    <div
                      className="lp-vivo w-1.5 h-1.5 rounded-full bg-green-400"
                      style={{ animationDelay: `${i * 0.4}s` }}
                    />
                    <span className="text-xs text-green-400">ativo</span>
                  </div>
                </motion.div>
              ))}

              {/* O resultado chega por ÚLTIMO, depois de todo o squad: é a
                  ordem que conta a história certa. */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.35 }}
                className="mt-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg"
              >
                <div className="text-xs text-orange-400 font-mono">
                  ✓ Post no LinkedIn publicado com 4 fontes verificadas
                </div>
              </motion.div>
            </div>

            {/* A arte entra como CAMADA, nunca como estrutura: se ela sumir, a
                página continua de pé. Nasceu no Nano Banana com as referências
                da bíblia de estilo, recortada com transparência e no traço da
                própria página (branco quente e o laranja da marca), que foi
                exatamente a correção que o Bruno pediu em 02/09. Some no
                celular, onde não sobra espaço para camada nenhuma. */}
            <motion.img
              src="/artes/setas.png"
              alt=""
              aria-hidden
              initial={{ opacity: 0, x: -40, rotate: -5 }}
              animate={{ opacity: 1, x: 0, rotate: -3 }}
              transition={{ delay: 1.7, duration: 0.7, ease: [0.2, 0.9, 0.25, 1] }}
              // -z-10 e não z acima: a arte passa POR TRÁS do cartão, e só o
              // que sobra dele aparece. Na primeira tentativa ela ficou por
              // cima e comeu o texto do aviso de publicado, que é justamente a
              // frase que fecha a história do squad.
              className="hidden lg:block pointer-events-none absolute -z-10 -left-28 -bottom-24 w-[430px]"
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
