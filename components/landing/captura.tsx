"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCaptura } from "@/lib/captura/store";
import { useAntiRobo } from "@/components/anti-robo/use-anti-robo";

/**
 * A CAPTURA DE LEAD, EM JANELA, aberta por qualquer CTA da landing.
 *
 * Nasce da decisão de 19/09: o tráfego pago virou o plano, com meta de 5.000
 * leads na primeira semana.
 *
 * AS PERGUNTAS MUDARAM NA MESMA SESSÃO, e a correção do Bruno vale registrar
 * porque ela é sobre PREMISSA e não sobre texto. A primeira versão perguntava
 * "o que você vende?", e isso pressupõe que a pessoa vende alguma coisa. Um
 * pastor não vende. Um professor não vende. Um líder de associação não vende.
 * Nenhum dos três botões cabia neles, e formulário em que a pessoa não se
 * encontra na primeira pergunta é formulário que ela fecha.
 *
 * AS TRÊS PERGUNTAS, e por que cada uma existe:
 *
 *   1. **O que você faz** (texto livre). É o único campo aberto, e ele não é
 *      desperdício de conversão: é exatamente o que o produto pergunta no setup
 *      do projeto para os agentes saberem sobre o que escrever. Perguntar aqui
 *      adianta trabalho em vez de criar trabalho;
 *   2. **Você já cria conteúdo** (toque). É a segmentação que mais vale, porque
 *      separa os dois perfis de comprador que o produto tem: quem já publica e
 *      quer parar de sofrer, e quem nunca publicou e quer que saia sozinho. E
 *      "já tentei e parei" é a dor exata que a landing nomeia lá em cima;
 *   3. **O que você quer das redes** (toque). Levantado em 19/09 contra o que a
 *      indústria mede (reconhecimento, geração de lead, venda direta,
 *      comunidade), traduzido para a língua de quem responde, e com uma opção
 *      que serve a quem não vende nada.
 *
 * NENHUMA OPÇÃO VEM MARCADA. É a mesma lição do planejador de campanha: opção
 * pré-marcada é o sistema escolhendo e apresentando como escolha da pessoa.
 * Aqui doeria duas vezes, porque o dado errado vira segmentação errada e
 * decisão de orçamento errada.
 *
 * SÓ O E-MAIL É OBRIGATÓRIO. Um lead com e-mail e sem ficha vale muito mais
 * que nenhum lead.
 */

const PERGUNTAS = [
  {
    campo: "cria" as const,
    titulo: "Você já cria conteúdo?",
    opcoes: [
      { id: "toda_semana", rotulo: "Publico toda semana" },
      { id: "as_vezes", rotulo: "De vez em quando" },
      { id: "parei", rotulo: "Já tentei e parei" },
      { id: "nunca", rotulo: "Nunca publiquei" },
    ],
  },
  {
    campo: "objetivo" as const,
    titulo: "O que você quer das redes?",
    opcoes: [
      { id: "clientes", rotulo: "Clientes" },
      { id: "autoridade", rotulo: "Autoridade no meu assunto" },
      { id: "alcance", rotulo: "Alcançar mais gente" },
      { id: "constancia", rotulo: "Publicar com constância" },
    ],
  },
];

type Campo = (typeof PERGUNTAS)[number]["campo"];

/**
 * O FORMULÁRIO, separado do envelope animado.
 *
 * A separação não é organização: é a única forma de este formulário ser
 * conferido antes de ir ao ar. O `AnimatePresence` do framer-motion NÃO DESENHA
 * NADA NO SERVIDOR, medido em 19/09: `renderToString` do modal com a janela
 * aberta devolve HTML de tamanho ZERO. Nenhum script alcança o que está lá
 * dentro, e o que não se alcança vai ao ar sem ninguém ter visto.
 *
 * É a terceira vez na mesma semana que a resposta é a mesma: o bloco do horário
 * vencido saiu do modal na parte 140, o planejador saiu hoje de manhã, e agora
 * este. O padrão já dá para nomear: conteúdo que só existe depois de uma
 * interação vive em componente próprio, e o envelope fica de fora.
 */
export function FormularioDeCaptura({
  origem,
  onFechar,
}: {
  origem?: string | null;
  onFechar?: () => void;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [faz, setFaz] = useState("");
  const [respostas, setRespostas] = useState<Partial<Record<Campo, string>>>({});
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // A defesa contra robô (01/10): isca invisível, tempo mínimo e Turnstile.
  const antiRobo = useAntiRobo();

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setErro(null);
    setEnviando(true);
    try {
      const prova = await antiRobo.prova();
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, faz, ...respostas, cta: origem ?? null, antiRobo: prova }),
      });
      const dados = await res.json();
      if (!res.ok) {
        setErro(dados?.error ?? "Não consegui guardar agora. Tente de novo.");
        setEnviando(false);
        return;
      }
      /**
       * O LEAD ESTÁ GUARDADO ANTES DE A PESSOA SAIR DAQUI.
       *
       * O cadastro é a próxima tela, e o e-mail vai junto pela URL para ela não
       * digitar duas vezes. Se desistir no cadastro, o lead continua nosso, que
       * é a razão inteira de capturar aqui em vez de mandar direto para o
       * /sign-up: quem abandona o cadastro é o grupo grande numa campanha fria,
       * e era dele que não sobrava nada.
       */
      router.push(`/sign-up?email=${encodeURIComponent(email)}`);
    } catch {
      setErro("Não consegui guardar agora. Confira a conexão e tente de novo.");
      setEnviando(false);
    }
  }

  return (
    <form
      onSubmit={enviar}
      data-theme="dark"
      className="relative w-full max-w-lg rounded-2xl border p-6 sm:p-7 space-y-5 my-auto"
      style={{
        borderColor: "var(--border)",
        background: "var(--bg-card)",
        boxShadow: "0 30px 80px rgba(0,0,0,.5)",
      }}
    >
      {antiRobo.campos}
      {onFechar && (
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className="absolute right-4 top-4 rounded-lg p-1.5 transition-colors hover:bg-[var(--bg-elevated)]"
          style={{ color: "var(--text-muted)" }}
        >
          <X className="h-4 w-4" />
        </button>
      )}

      <div className="space-y-1.5 pr-8">
        <h2 className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--text-primary)" }}>
          7 dias grátis, com a equipe inteira
        </h2>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Sem cartão agora. A primeira campanha sai hoje.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="lead-email" className="block text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
          Seu melhor e-mail
        </label>
        <input
          id="lead-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nome@empresa.com.br"
          className="w-full rounded-xl border px-4 py-3.5 text-[15px] outline-none transition-colors focus:border-[var(--border-accent)]"
          style={{ borderColor: "var(--border)", background: "var(--bg-input)", color: "var(--text-primary)" }}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="lead-faz" className="block text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
          O que você faz?
        </label>
        <input
          id="lead-faz"
          type="text"
          maxLength={120}
          value={faz}
          onChange={(e) => setFaz(e.target.value)}
          // Os exemplos são deliberadamente diversos, e o pastor está lá de
          // propósito: a pergunta antiga pressupunha venda, e o placeholder é
          // onde a pessoa descobre que a pergunta cabe nela.
          placeholder="consultor de gestão, pastor, advogada, dona de loja…"
          className="w-full rounded-xl border px-4 py-3.5 text-[15px] outline-none transition-colors focus:border-[var(--border-accent)]"
          style={{ borderColor: "var(--border)", background: "var(--bg-input)", color: "var(--text-primary)" }}
        />
      </div>

      {PERGUNTAS.map((p) => (
        <div key={p.campo} className="space-y-2.5">
          <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
            {p.titulo}
          </p>
          <div className="flex flex-wrap gap-2">
            {p.opcoes.map((o) => {
              const marcada = respostas[p.campo] === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={marcada}
                  onClick={() => setRespostas((r) => ({ ...r, [p.campo]: marcada ? undefined : o.id }))}
                  className={cn(
                    "rounded-xl border px-3.5 py-2.5 text-[13px] transition-all",
                    marcada
                      ? "border-orange-500 bg-orange-500/10 font-semibold text-[var(--text-primary)]"
                      : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-accent)]"
                  )}
                >
                  {o.rotulo}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {erro && (
        <p className="text-xs" style={{ color: "var(--badge-danger-text)" }} role="alert">
          {erro}
        </p>
      )}

      <div className="space-y-3 pt-0.5">
        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded-xl py-4 text-[15px] font-bold text-white transition-opacity disabled:opacity-60"
          style={{ background: "var(--accent-orange)" }}
        >
          {enviando ? "Guardando…" : "Começar os 7 dias grátis"}
        </button>
        <p className="text-center text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Ao continuar você aceita os{" "}
          <a href="/terms" className="underline">
            termos
          </a>{" "}
          e a{" "}
          <a href="/privacy" className="underline">
            política de privacidade
          </a>
          .
          <br />
          Cancele quando quiser, em dois cliques.
        </p>
      </div>
    </form>
  );
}

/** O envelope: o fundo escuro, a animação e o que fecha a janela. */
export function CapturaModal() {
  const { aberta, origem, fechar } = useCaptura();

  // Esc fecha, e o fundo da página para de rolar enquanto a janela está aberta.
  // Sem isso, rolar o fundo atrás de um modal é o jeito mais rápido de a pessoa
  // perder de vista o que estava fazendo.
  useEffect(() => {
    if (!aberta) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
    };
    document.addEventListener("keydown", aoTeclar);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = antes;
    };
  }, [aberta, fechar]);

  return (
    <AnimatePresence>
      {aberta && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center overflow-y-auto p-4 sm:p-6"
          style={{ background: "rgba(0,0,0,.66)", backdropFilter: "blur(3px)" }}
          onClick={fechar}
          role="dialog"
          aria-modal="true"
          aria-label="Começar o teste grátis"
        >
          {/* O clique no formulário NÃO pode virar clique no fundo, senão a
              janela fecha quando a pessoa marca uma opção. É a mesma família de
              defeito do menu do agente na parte 141, em que o clique no botão
              vazava para o chão do escritório 3D. */}
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg my-auto">
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.2, 0.9, 0.25, 1] }}
            >
              <FormularioDeCaptura origem={origem} onFechar={fechar} />
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
