"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, AlertTriangle, Inbox } from "lucide-react";
import { arteDoAgente, type EstadoDoAgente, type SituacaoDoSquad } from "@/lib/squad/estado-do-squad";
import type { CenaAtiva } from "@/components/escritorio/escritorio-do-squad";
import { MenuDoAgente, type Turno } from "@/components/escritorio/menu-do-agente";
import { cn } from "@/lib/utils";

/**
 * O escritório do squad, na arte de massinha (28/09/2026).
 *
 * ## Por que trocou
 *
 * O escritório 3D (escritorio-do-squad.tsx) usava um único robô recolorido
 * para os sete agentes. Na virada enterprise o Bruno pediu a arte 3D de
 * massinha das referências dele (fundo limpo, mesa branca e laranja), com um
 * rosto próprio por agente. Cada agente agora é uma imagem pronta, sentado na
 * mesa dele, e o movimento que conta a história é pouco e certeiro:
 *
 * - quem está com o bastão brilha na cor dele e "digita" (um leve balanço);
 * - a entrega corre pela ESTEIRA, a linha embaixo das mesas, de uma mesa para a
 *   seguinte, até a sua mesa no fim: é a metáfora da própria Demandou;
 * - a bronca da Vera sai em balão vermelho e a mesa de quem recebe treme.
 *
 * Sem WebGL: carrega em qualquer máquina, pesa uns 400 KB de imagem em vez do
 * three.js, e o tema claro e o escuro funcionam sem repintar cena.
 */

const ROTULO_DO_ESTADO: Record<EstadoDoAgente, string> = {
  trabalhando: "Trabalhando",
  pronto: "Pronto",
  esperando: "Na fila",
  aviso: "Precisa de você",
  ocioso: "Livre",
};

const COR_DO_ESTADO: Record<EstadoDoAgente, string> = {
  trabalhando: "var(--accent-orange)",
  pronto: "var(--badge-success-text)",
  esperando: "var(--text-muted)",
  aviso: "var(--badge-danger-text)",
  ocioso: "var(--text-muted)",
};

import { BotaoDescartar } from "@/components/ui/descartar";

export function EscritorioDeMassinha({
  situacao,
  cena,
  falaDaMesa,
  onAbrirAgente,
  conversas,
  pensando,
  onPerguntar,
  onComentarSobre,
  aoFecharFalaDaMesa,
}: {
  situacao: SituacaoDoSquad;
  cena: CenaAtiva | null;
  falaDaMesa: string | null;
  /** Fecha a fala da sua mesa (07/10): X só local, a fala some sozinha de qualquer jeito. */
  aoFecharFalaDaMesa?: () => void;
  onAbrirAgente: (agentId: string) => void;
  conversas: Record<string, Turno[]>;
  pensando: string | null;
  onPerguntar: (agentId: string, pergunta: string) => void;
  onComentarSobre: (agentId: string, outroId: string) => void;
}) {
  const reduzir = useReducedMotion();
  const [conversaCom, setConversaCom] = useState<string | null>(null);
  const trilho = useRef<HTMLDivElement>(null);
  const rolagem = useRef<HTMLDivElement>(null);
  const mesas = useRef<Record<string, HTMLDivElement | null>>({});
  // O centro de cada mesa na esteira, em pixels, medido depois de desenhar:
  // é por ele que o documento sabe de onde sai e onde chega.
  const [centros, setCentros] = useState<Record<string, number>>({});

  useLayoutEffect(() => {
    const medir = () => {
      const base = trilho.current?.getBoundingClientRect().left ?? 0;
      const novos: Record<string, number> = {};
      for (const [id, el] of Object.entries(mesas.current)) {
        if (!el) continue;
        const r = el.getBoundingClientRect();
        novos[id] = r.left - base + r.width / 2;
      }
      setCentros(novos);
    };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [situacao.agentes.length]);

  // A cena dura o tempo de ser vista e sai sozinha: a próxima entrega pode
  // chegar em segundos, e um balão velho na tela conta a história errada.
  const [cenaVisivel, setCenaVisivel] = useState<CenaAtiva | null>(null);
  useEffect(() => {
    if (!cena) return;
    setCenaVisivel(cena);
    const t = setTimeout(() => setCenaVisivel((c) => (c?.n === cena.n ? null : c)), cena.humor === "bronca" ? 7000 : 4500);
    return () => clearTimeout(t);
  }, [cena]);

  const de = cenaVisivel ? centros[cenaVisivel.de] : undefined;
  const para = cenaVisivel ? centros[cenaVisivel.para] : undefined;

  return (
    <div className="relative h-full w-full">
      {/* O chão: um brilho suave de cima e uma grade quase invisível, para as
          mesas não flutuarem no vazio. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(90% 70% at 50% 0%, color-mix(in srgb, var(--accent-orange) 7%, transparent), transparent 70%)",
        }}
      />
      <div ref={rolagem} className="relative h-full overflow-x-auto scrollbar-none">
        <div ref={trilho} className="relative flex min-w-[860px] items-end gap-1 px-4 pb-10 pt-14 sm:gap-2">
          {situacao.agentes.map((s, i) => {
            const arte = arteDoAgente(s.agente.id);
            const trabalhando = s.estado === "trabalhando";
            // Apagar só ajuda quando há contraste: com alguém trabalhando, os
            // outros recuam. Com o squad todo parado, todos ficam com a cor cheia.
            const apagado = Boolean(situacao.trabalhando) && (s.estado === "ocioso" || s.estado === "esperando");
            const levaBronca = cenaVisivel?.humor === "bronca" && cenaVisivel.para === s.agente.id;
            const falando =
              cenaVisivel && cenaVisivel.de === s.agente.id
                ? { texto: cenaVisivel.fala, bronca: cenaVisivel.humor === "bronca" }
                : trabalhando && situacao.falas[s.agente.id]
                  ? { texto: situacao.falas[s.agente.id], bronca: false }
                  : null;
            return (
              <div
                key={s.agente.id}
                ref={(el) => {
                  mesas.current[s.agente.id] = el;
                }}
                className="relative flex min-w-0 flex-1 flex-col items-center"
              >
                {/* Balão: o que o agente está fazendo agora, ou o que disse
                    na entrega. Fica acima da cabeça e some sozinho. */}
                <AnimatePresence>
                  {falando && (
                    <motion.div
                      key={falando.texto}
                      initial={{ opacity: 0, y: 6, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="absolute -top-12 z-20 w-[150%] max-w-[210px] rounded-xl border px-2.5 py-1.5 text-center text-[11px] leading-snug shadow-[var(--shadow)]"
                      style={{
                        background: falando.bronca ? "var(--badge-danger-bg)" : "var(--bg-surface)",
                        borderColor: falando.bronca ? "var(--badge-danger-border)" : "var(--border)",
                        color: falando.bronca ? "var(--badge-danger-text)" : "var(--text-primary)",
                      }}
                    >
                      <span className="line-clamp-2">{falando.texto}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.button
                  type="button"
                  onClick={() => setConversaCom((c) => (c === s.agente.id ? null : s.agente.id))}
                  aria-label={`${s.agente.nome}, ${ROTULO_DO_ESTADO[s.estado]}. Abrir conversa`}
                  className="group relative w-full rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                  animate={
                    reduzir
                      ? undefined
                      : levaBronca
                        ? { x: [0, -5, 5, -4, 4, 0] }
                        : trabalhando
                          ? { y: [0, -2, 0] }
                          : { y: 0 }
                  }
                  transition={
                    levaBronca
                      ? { duration: 0.5, delay: 0.6 }
                      : trabalhando
                        ? { duration: 1.1, repeat: Infinity, ease: "easeInOut" }
                        : undefined
                  }
                >
                  {/* Brilho atrás de quem está com o bastão, na cor dele. */}
                  {trabalhando && (
                    <span
                      aria-hidden
                      className="absolute inset-x-[8%] bottom-[6%] top-[20%] -z-10 rounded-full blur-2xl"
                      style={{ background: `${s.agente.cor}55` }}
                    />
                  )}
                  {arte && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={arte.mesa}
                      alt=""
                      draggable={false}
                      className={cn(
                        "mx-auto aspect-square w-full max-w-[170px] object-contain transition-[filter,opacity,transform] duration-300 group-hover:scale-[1.03]",
                        apagado && "opacity-70 saturate-[.6]"
                      )}
                    />
                  )}
                </motion.button>

                {/* A plaqueta: nome, função e o estado em palavras. */}
                <div className="mt-1 flex w-full flex-col items-center text-center">
                  <span className="truncate text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
                    {s.agente.primeiroNome}
                  </span>
                  <span className="truncate text-[10.5px]" style={{ color: "var(--text-muted)" }}>
                    {s.agente.papel}
                  </span>
                  <span
                    className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      color: COR_DO_ESTADO[s.estado],
                      background: `color-mix(in srgb, ${COR_DO_ESTADO[s.estado]} 12%, transparent)`,
                    }}
                    title={s.detalhe}
                  >
                    {s.estado === "trabalhando" && (
                      <span className="h-1.5 w-1.5 rounded-full lp-vivo" style={{ background: "currentColor" }} />
                    )}
                    {s.estado === "pronto" && <Check className="h-3 w-3" />}
                    {s.estado === "aviso" && <AlertTriangle className="h-3 w-3" />}
                    {ROTULO_DO_ESTADO[s.estado]}
                  </span>
                </div>

              </div>
            );
          })}

          {/* A sua mesa, no fim da esteira: é para onde a semana vai. */}
          <div
            ref={(el) => {
              mesas.current.voce = el;
            }}
            className="relative flex w-[92px] shrink-0 flex-col items-center self-center pb-6"
          >
            <AnimatePresence>
              {falaDaMesa && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="absolute -top-16 right-0 z-20 flex w-[200px] items-start gap-1 rounded-xl border py-1.5 pl-2.5 pr-1 text-[11px] leading-snug shadow-[var(--shadow)]"
                  style={{ background: "var(--bg-surface)", borderColor: "var(--accent-orange)", color: "var(--text-primary)" }}
                >
                  <span className="flex-1">{falaDaMesa}</span>
                  {aoFecharFalaDaMesa && <BotaoDescartar compacto aoDescartar={aoFecharFalaDaMesa} />}
                </motion.div>
              )}
            </AnimatePresence>
            <span
              className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-dashed"
              style={{ borderColor: "var(--accent-orange)", color: "var(--accent-orange)" }}
            >
              <Inbox className="h-6 w-6" />
            </span>
            <span className="mt-1.5 text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
              Você
            </span>
            <span className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>
              aprova e publica
            </span>
          </div>

          {/* A ESTEIRA: a linha que liga as mesas, por onde a entrega corre. */}
          <div aria-hidden className="pointer-events-none absolute inset-x-4 bottom-4 h-[3px] rounded-full" style={{ background: "var(--border)" }} />
          <AnimatePresence>
            {cenaVisivel && de !== undefined && para !== undefined && (
              <motion.span
                key={cenaVisivel.n}
                aria-hidden
                className="pointer-events-none absolute bottom-[9px] z-10 flex h-5 w-7 -translate-x-1/2 items-center justify-center rounded-md text-[9px] font-bold text-white shadow-md"
                style={{ background: cenaVisivel.humor === "bronca" ? "var(--badge-danger-text)" : "var(--accent-orange)" }}
                initial={{ left: de, opacity: 0 }}
                animate={{ left: para, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduzir ? 0 : 1.6, ease: "easeInOut" }}
              >
                {cenaVisivel.humor === "bronca" ? "!" : "✓"}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* O menu de conversa, o mesmo do escritório 3D. Mora FORA da área de
          rolagem: dentro dela, a rolagem lateral do celular cortava o menu,
          que desce abaixo das mesas (visto no print de 28/09). */}
      {conversaCom && (() => {
        const s = situacao.agentes.find((x) => x.agente.id === conversaCom);
        if (!s) return null;
        const i = situacao.agentes.indexOf(s);
        const x = (centros[s.agente.id] ?? 0) - (rolagem.current?.scrollLeft ?? 0);
        const alinhamento = i > situacao.agentes.length - 3 ? "-100%" : i < 2 ? "0%" : "-50%";
        return (
          <div className="absolute top-full z-30 -mt-4" style={{ left: x, transform: `translateX(${alinhamento})` }}>
            <MenuDoAgente
              key={s.agente.id}
              agente={s.agente}
              conversa={conversas[s.agente.id] ?? []}
              pensando={pensando === s.agente.id}
              onPerguntar={(p) => onPerguntar(s.agente.id, p)}
              onComentarSobre={(outro) => onComentarSobre(s.agente.id, outro)}
              onVerTrabalhos={() => {
                setConversaCom(null);
                onAbrirAgente(s.agente.id);
              }}
              onFechar={() => setConversaCom(null)}
            />
          </div>
        );
      })()}
    </div>
  );
}
