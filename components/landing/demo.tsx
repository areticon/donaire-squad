"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";

/**
 * Demonstração pública: a pessoa escreve cru, recebe o post pronto.
 *
 * Por que isto existe e por que fica acima de tudo: a conversão da landing é a
 * variável de maior alavancagem do CAC, e a objeção central do ICP não é preço,
 * é desconfiança de que a IA escreve como ele. Argumento não resolve
 * desconfiança, prova resolve. O produto é a própria demonstração.
 *
 * Não pede a URL do LinkedIn de propósito: nosso escopo OAuth só lê o perfil de
 * quem já autorizou, e ler o de um visitante exigiria raspar o LinkedIn, que é
 * bloqueado e viola os termos. Pedir texto cru também demonstra melhor o
 * produto novo, onde matéria-prima crua entra e conteúdo sai.
 */

const EXEMPLO =
  "Essa semana três clientes me perguntaram a mesma coisa: como justificar investimento em eficiência se o payback é de quatro anos e o conselho só olha dezoito meses. Eu acho que a pergunta está errada. Conselho não decide por payback, decide por risco.";

type Posts = {
  linkedin: string;
  x: string;
  instagram: string;
  observacao?: string;
};

const REDES = [
  { chave: "linkedin" as const, nome: "LinkedIn" },
  { chave: "x" as const, nome: "X" },
  { chave: "instagram" as const, nome: "Instagram" },
];

export function Demo() {
  const [texto, setTexto] = useState("");
  const [profissao, setProfissao] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [posts, setPosts] = useState<Posts | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<"linkedin" | "x" | "instagram">("linkedin");

  async function gerar() {
    setCarregando(true);
    setErro(null);
    setPosts(null);
    try {
      const res = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto, profissao }),
      });
      const data = await res.json();
      if (!res.ok) setErro(data.error ?? "Não consegui gerar agora.");
      else setPosts(data.posts);
    } catch {
      setErro("Não consegui gerar agora. Tente de novo em alguns segundos.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <section id="demo" className="relative py-24">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#3f4147] to-transparent" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10"
        >
          <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-full px-4 py-1.5 text-sm text-orange-400 mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Sem cadastro. Agora.</span>
          </div>
          <h2 className="text-4xl lg:text-5xl font-black text-[#dbdee1] mb-4">
            Não acredite em mim. Testa.
          </h2>
          <p className="text-xl text-[#949ba4] max-w-2xl mx-auto">
            Escreva do jeito que você falaria para um cliente, sem se preocupar
            com forma. O squad devolve o post pronto para as três redes.
          </p>
        </motion.div>

        <div className="bg-[#2b2d31] border border-[#3f4147] rounded-2xl p-6 lg:p-8">
          <label className="block text-sm font-medium text-[#949ba4] mb-2">
            O que você diria para um cliente hoje?
          </label>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={5}
            maxLength={1200}
            placeholder={EXEMPLO}
            className="w-full bg-[#1e1f22] border border-[#3f4147] rounded-xl p-4 text-[#dbdee1] placeholder:text-[#6b6f76] focus:outline-none focus:border-orange-500 resize-none"
          />

          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            <input
              value={profissao}
              onChange={(e) => setProfissao(e.target.value)}
              maxLength={120}
              placeholder="O que você faz? (consultor industrial, advogado, nutricionista...)"
              className="flex-1 bg-[#1e1f22] border border-[#3f4147] rounded-xl px-4 py-3 text-[#dbdee1] placeholder:text-[#6b6f76] focus:outline-none focus:border-orange-500"
            />
            <Button
              size="lg"
              onClick={gerar}
              disabled={carregando || texto.trim().length < 40}
            >
              {carregando ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  O squad está escrevendo
                </>
              ) : (
                <>
                  Ver o meu post
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>

          {texto.trim().length > 0 && texto.trim().length < 40 && (
            <p className="text-sm text-[#949ba4] mt-3">
              Escreva mais um pouco, umas duas frases. Quanto mais cru, melhor.
            </p>
          )}

          {erro && (
            <p className="text-sm text-orange-400 mt-4 bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
              {erro}
            </p>
          )}

          <AnimatePresence>
            {posts && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="mt-8 pt-8 border-t border-[#3f4147]"
              >
                <div className="flex gap-2 mb-4">
                  {REDES.map((r) => (
                    <button
                      key={r.chave}
                      onClick={() => setAba(r.chave)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        aba === r.chave
                          ? "bg-[#313338] text-[#dbdee1]"
                          : "text-[#949ba4] hover:text-[#dbdee1]"
                      }`}
                    >
                      {r.nome}
                    </button>
                  ))}
                </div>

                <div className="bg-[#1e1f22] border border-[#3f4147] rounded-xl p-5 whitespace-pre-wrap text-[#dbdee1] leading-relaxed">
                  {posts[aba]}
                </div>

                {posts.observacao && (
                  <p className="text-sm text-[#949ba4] mt-4 italic">
                    {posts.observacao}
                  </p>
                )}

                <div className="mt-6 bg-orange-500/10 border border-orange-500/20 rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <p className="text-[#dbdee1]">
                    Isso foi um post, sem saber nada sobre você.{" "}
                    <strong>
                      Imagina o squad depois de estudar o seu perfil inteiro.
                    </strong>
                  </p>
                  <Button asChild>
                    <Link href="/sign-up">
                      Começar os 7 dias grátis
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
