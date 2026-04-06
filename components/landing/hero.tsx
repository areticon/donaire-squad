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

const AGENT_NAMES = [
  { name: "Roberto Radar", role: "Pesquisa", color: "bg-blue-500" },
  { name: "Lucas LinkedIn", role: "LinkedIn", color: "bg-blue-600" },
  { name: "Tiago Twitter", role: "X/Twitter", color: "bg-sky-500" },
  { name: "Daniela Design", role: "Visual", color: "bg-purple-500" },
  { name: "Paulo Publicador", role: "Publicação", color: "bg-green-500" },
];

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1a1a1a_1px,transparent_1px),linear-gradient(to_bottom,#1a1a1a_1px,transparent_1px)] bg-[size:48px_48px] opacity-40" />

      {/* Orange glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-orange-500/5 rounded-full blur-3xl" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-full px-4 py-1.5 text-sm text-orange-400 mb-6">
              <Zap className="w-3.5 h-3.5" />
              <span>Multi-agentes de IA para redes sociais</span>
            </div>

            <h1 className="text-5xl lg:text-6xl font-black text-[#f5f5f5] leading-[1.05] mb-6">
              Seus agentes de IA{" "}
              <span className="text-orange-500">trabalhando</span> por você
            </h1>

            <p className="text-xl text-[#9ca3af] leading-relaxed mb-8 max-w-lg">
              Uma equipe de agentes autônomos pesquisa, escreve, cria imagens e
              publica nas suas redes sociais. Você só aprova.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 mb-12">
              <Button size="xl" asChild>
                <Link href="/sign-up">
                  Começar grátis
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </Button>
              <Button size="xl" variant="outline" asChild>
                <a href="#how">Ver como funciona</a>
              </Button>
            </div>

            <div className="flex items-center gap-6 text-sm text-[#9ca3af]">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-orange-400" />
                <span>Sem cartão de crédito</span>
              </div>
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-orange-400" />
                <span>Setup em 5 minutos</span>
              </div>
            </div>
          </motion.div>

          {/* Right — Agent visualization */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative"
          >
            <div className="bg-[#111] border border-[#2a2a2a] rounded-2xl p-6 space-y-3">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="ml-2 text-xs text-[#9ca3af] font-mono">demandou — ao vivo</span>
              </div>

              {AGENT_NAMES.map((agent, i) => (
                <motion.div
                  key={agent.name}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.15 }}
                  className="flex items-center gap-3 bg-[#1a1a1a] rounded-lg p-3 border border-[#2a2a2a]"
                >
                  <div className={`w-8 h-8 ${agent.color} rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                    {agent.name.split(" ").map(n => n[0]).join("")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#f5f5f5]">{agent.name}</div>
                    <div className="text-xs text-[#9ca3af]">{agent.role}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-xs text-green-400">ativo</span>
                  </div>
                </motion.div>
              ))}

              <div className="mt-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                <div className="text-xs text-orange-400 font-mono">
                  ✓ Post LinkedIn publicado com 4 fontes verificadas
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
