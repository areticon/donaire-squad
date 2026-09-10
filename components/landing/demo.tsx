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
  const [rodadaId, setRodadaId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  // O nome sempre foi aceito pela rota e nunca era enviado, entao todo lead
  // nascia anonimo e todo e-mail saia com "Oi." seco.
  const [nome, setNome] = useState("");
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [emailEnviado, setEmailEnviado] = useState(false);
  const [erroEmail, setErroEmail] = useState<string | null>(null);
  // A SEGUNDA ETAPA, que so aparece depois de os textos irem embora.
  //
  // O telefone e para a venda, que e interesse nosso, e o e-mail e a troca
  // honesta da tela. Pedir os dois no mesmo instante poria o campo a mais em
  // cima da unica etapa que hoje converte; pedindo depois, quem so queria o
  // texto vai embora com ele sem nunca ver pedido de telefone.
  const [telefone, setTelefone] = useState("");
  const [autorizaWhats, setAutorizaWhats] = useState(false);
  const [enviandoTelefone, setEnviandoTelefone] = useState(false);
  const [telefoneEnviado, setTelefoneEnviado] = useState(false);
  const [erroTelefone, setErroTelefone] = useState<string | null>(null);

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
      if (!res.ok) {
        setErro(data.error ?? "Não consegui gerar agora.");
      } else {
        setPosts(data.posts);
        // O id da rodada e o que liga o e-mail ao texto certo depois.
        setRodadaId(data.rodadaId ?? null);
        setEmailEnviado(false);
        setErroEmail(null);
      }
    } catch {
      setErro("Não consegui gerar agora. Tente de novo em alguns segundos.");
    } finally {
      setCarregando(false);
    }
  }

  async function mandarPorEmail(e: React.FormEvent) {
    e.preventDefault();
    setEnviandoEmail(true);
    setErroEmail(null);
    try {
      const res = await fetch("/api/demo/contato", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rodadaId, email, nome: nome.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setErroEmail(data.error ?? "Não consegui enviar agora.");
      else setEmailEnviado(true);
    } catch {
      setErroEmail("Não consegui enviar agora.");
    } finally {
      setEnviandoEmail(false);
    }
  }

  /**
   * A segunda etapa: o telefone, na mesma rodada.
   *
   * Cai na mesma rota de proposito. Ela reconhece pelo banco que esta rodada ja
   * recebeu os textos e nao manda o e-mail de novo, entao a tela nao precisa
   * avisar em que etapa esta, o que seria mais um campo que o cliente escolhe.
   */
  async function mandarTelefone(e: React.FormEvent) {
    e.preventDefault();
    setEnviandoTelefone(true);
    setErroTelefone(null);
    try {
      const res = await fetch("/api/demo/contato", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rodadaId,
          email,
          nome: nome.trim() || undefined,
          telefone: telefone.trim(),
          consentimento: autorizaWhats,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setErroTelefone(data.error ?? "Não consegui guardar agora.");
      else setTelefoneEnviado(true);
    } catch {
      setErroTelefone("Não consegui guardar agora.");
    } finally {
      setEnviandoTelefone(false);
    }
  }

  return (
    <section id="demo" className="relative py-24 lg:py-32">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-full px-4 py-1.5 text-sm text-orange-400 mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Sem cadastro. Agora.</span>
          </div>
          <h2 className="text-4xl lg:text-5xl font-black text-[var(--text-primary)] mb-4">
            Não acredite em mim. Testa.
          </h2>
          <p className="text-xl text-[var(--text-muted)] max-w-2xl mx-auto">
            Escreva do jeito que você falaria para um cliente, sem se preocupar
            com forma. O squad devolve o post pronto para as três redes.
          </p>
        </motion.div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-6 lg:p-8">
          <label className="block text-sm font-medium text-[var(--text-muted)] mb-2">
            O que você diria para um cliente hoje?
          </label>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={5}
            maxLength={1200}
            placeholder={EXEMPLO}
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl p-4 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-orange-500 resize-none"
          />

          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            <input
              value={profissao}
              onChange={(e) => setProfissao(e.target.value)}
              maxLength={120}
              placeholder="O que você faz? (consultor industrial, advogado, nutricionista...)"
              className="flex-1 bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-orange-500"
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
            <p className="text-sm text-[var(--text-muted)] mt-3">
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
                className="mt-8 pt-8 border-t border-[var(--border)]"
              >
                <div className="flex gap-2 mb-4">
                  {REDES.map((r) => (
                    <button
                      key={r.chave}
                      onClick={() => setAba(r.chave)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        aba === r.chave
                          ? "bg-[var(--bg-elevated)] text-[var(--text-primary)]"
                          : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      {r.nome}
                    </button>
                  ))}
                </div>

                <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl p-5 whitespace-pre-wrap text-[var(--text-primary)] leading-relaxed">
                  {posts[aba]}
                </div>

                {posts.observacao && (
                  <p className="text-sm text-[var(--text-muted)] mt-4 italic">
                    {posts.observacao}
                  </p>
                )}

                {/* O e-mail vem ANTES do botao de plano e depois do texto
                    pronto: a pessoa acabou de ver o resultado, e a troca
                    oferecida e levar o texto embora, nao ver o que ja viu. */}
                {emailEnviado ? (
                  <>
                    <div className="mt-6 rounded-xl border border-green-500/25 bg-green-500/10 p-4 text-sm text-[var(--text-primary)]">
                      Pronto, os três textos estão indo para {email}.
                    </div>

                    {/* A SEGUNDA ETAPA. Ela aparece depois de a pessoa receber o
                        que veio buscar, e não junto: o e-mail é a troca honesta
                        da tela, o telefone é interesse nosso. Quem só queria o
                        texto vai embora com ele sem ver pedido de telefone. */}
                    {telefoneEnviado ? (
                      <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-4 text-sm text-[var(--text-primary)]">
                        Combinado. O Bruno te chama no WhatsApp.
                      </div>
                    ) : (
                      <form
                        onSubmit={mandarTelefone}
                        className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-5"
                      >
                        <p className="text-sm font-semibold text-[var(--text-primary)]">
                          Quer que o Bruno te chame no WhatsApp?
                        </p>
                        <p className="text-sm text-[var(--text-muted)] mt-1 mb-3">
                          Ele atende pessoalmente os dez primeiros, para entender o que você grava
                          e montar a primeira semana com você.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3">
                          <input
                            type="tel"
                            required
                            value={telefone}
                            onChange={(ev) => setTelefone(ev.target.value)}
                            placeholder="(11) 98765 4321"
                            className="flex-1 rounded-xl border px-4 py-2.5 text-sm outline-none"
                            style={{
                              background: "var(--bg-surface)",
                              borderColor: "var(--border)",
                              color: "var(--text-primary)",
                            }}
                          />
                          <Button
                            type="submit"
                            variant="secondary"
                            disabled={enviandoTelefone || !autorizaWhats}
                          >
                            {enviandoTelefone ? "Guardando..." : "Pode me chamar"}
                          </Button>
                        </div>
                        {/* Desmarcada por padrão, e o botão só liga com ela
                            marcada: consentimento pré-marcado não é
                            consentimento, é caixa que ninguém leu. */}
                        <label className="flex items-start gap-2.5 mt-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={autorizaWhats}
                            onChange={(ev) => setAutorizaWhats(ev.target.checked)}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-orange-500 cursor-pointer"
                          />
                          <span className="text-xs text-[var(--text-muted)] leading-relaxed">
                            Autorizo o contato por WhatsApp sobre a Demandou. Posso pedir para parar
                            a qualquer momento.
                          </span>
                        </label>
                        {erroTelefone && (
                          <p className="text-xs text-red-400 mt-2">{erroTelefone}</p>
                        )}
                      </form>
                    )}
                  </>
                ) : (
                  <form
                    onSubmit={mandarPorEmail}
                    className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-5"
                  >
                    <p className="text-sm text-[var(--text-primary)] mb-3">
                      Quer os três textos no seu e-mail, prontos para copiar e publicar?
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input
                        type="text"
                        value={nome}
                        onChange={(ev) => setNome(ev.target.value)}
                        placeholder="Seu nome"
                        className="sm:w-52 rounded-xl border px-4 py-2.5 text-sm outline-none"
                        style={{
                          background: "var(--bg-surface)",
                          borderColor: "var(--border)",
                          color: "var(--text-primary)",
                        }}
                      />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(ev) => setEmail(ev.target.value)}
                        placeholder="seu@email.com"
                        className="flex-1 rounded-xl border px-4 py-2.5 text-sm outline-none"
                        style={{
                          background: "var(--bg-surface)",
                          borderColor: "var(--border)",
                          color: "var(--text-primary)",
                        }}
                      />
                      <Button type="submit" variant="secondary" disabled={enviandoEmail}>
                        {enviandoEmail ? "Enviando..." : "Mandar para mim"}
                      </Button>
                    </div>
                    {erroEmail && (
                      <p className="text-xs text-red-400 mt-2">{erroEmail}</p>
                    )}
                    <p className="text-xs text-[var(--text-muted)] mt-2">
                      Só os textos e o convite do teste. Nada de lista de disparo.
                    </p>
                  </form>
                )}

                <div className="mt-4 bg-orange-500/10 border border-orange-500/20 rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <p className="text-[var(--text-primary)]">
                    Isso foi um post, sem saber nada sobre você.{" "}
                    <strong>
                      Imagina o squad depois de estudar o seu perfil inteiro.
                    </strong>
                  </p>
                  <Button asChild>
                    <Link href="/planos">
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
