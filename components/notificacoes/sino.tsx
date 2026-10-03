"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bell, CheckCircle2, ClipboardCheck, Coins, LifeBuoy, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { EVENTO_DO_SINO, haQuanto, type NotificacaoNaTela } from "@/lib/notificacoes/tipos";
import { abrirChamado } from "@/lib/suporte/abrir-chamado";

/**
 * O SINO DA PLATAFORMA (02/10/2026).
 *
 * O pedido do Bruno: a edição de um vídeo leva meia hora, e o cliente precisa
 * fechar a tela sabendo que vai ser chamado de volta. O sino junta os avisos
 * (roteiro para aprovar, peças prontas, vídeo pronto, etapa que parou,
 * créditos devolvidos), com contador do que não foi lido e o clique levando à
 * tela certa.
 *
 * TEMPO REAL POR CONSULTA CURTA, e não Pusher: `lib/pusher` existe, mas o
 * projeto não tem as chaves no ambiente (a faixa do vídeo já registrou isso em
 * 02/09), e ligar seria conta e infra novas. O sino pergunta a cada 30 s, ao
 * voltar para a aba e quando a faixa do vídeo vê um estado mudar (evento
 * EVENTO_DO_SINO), o que na prática é "na hora" para quem está olhando.
 *
 * Componente de cliente puro: não importa nada que toque o banco.
 */

const INTERVALO_MS = 30_000;

function IconeDoTipo({ tipo }: { tipo: string }) {
  if (tipo === "falha") return <AlertTriangle className="w-4 h-4 text-orange-400" />;
  if (tipo === "completo") return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  if (tipo === "estorno") return <Coins className="w-4 h-4 text-amber-500" />;
  return <ClipboardCheck className="w-4 h-4 text-orange-400" />;
}

export function SinoDeNotificacoes({ collapsed = false, variante = "barra" }: { collapsed?: boolean; variante?: "barra" | "topo" }) {
  const router = useRouter();
  const [itens, setItens] = useState<NotificacaoNaTela[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [aberto, setAberto] = useState(false);
  const [posicao, setPosicao] = useState<{ top: number; left?: number; right?: number } | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const botao = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLDivElement>(null);

  const ler = useCallback(async () => {
    try {
      const r = await fetch("/api/notificacoes", { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as { itens?: NotificacaoNaTela[]; naoLidas?: number };
      setItens(d.itens ?? []);
      setNaoLidas(d.naoLidas ?? 0);
      setAgora(Date.now());
    } catch {
      /* rede oscilando: a próxima consulta tenta de novo */
    }
  }, []);

  useEffect(() => {
    // A primeira leitura sai no próximo tique, fora do corpo do efeito.
    const primeira = setTimeout(() => void ler(), 0);
    const t = setInterval(() => void ler(), INTERVALO_MS);
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void ler();
    };
    const aoPedir = () => void ler();
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener(EVENTO_DO_SINO, aoPedir);
    return () => {
      clearTimeout(primeira);
      clearInterval(t);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener(EVENTO_DO_SINO, aoPedir);
    };
  }, [ler]);

  // Fecha no Esc e no clique fora.
  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (painel.current?.contains(alvo) || botao.current?.contains(alvo)) return;
      setAberto(false);
    };
    window.addEventListener("keydown", tecla);
    window.addEventListener("mousedown", fora);
    return () => {
      window.removeEventListener("keydown", tecla);
      window.removeEventListener("mousedown", fora);
    };
  }, [aberto]);

  function abrir() {
    if (aberto) return setAberto(false);
    const r = botao.current?.getBoundingClientRect();
    if (r) {
      const largura = window.innerWidth;
      // Na barra lateral do computador o painel abre ao lado; no topo do
      // celular (e em tela estreita), abre embaixo, colado à direita.
      if (variante === "barra" && largura >= 1024) setPosicao({ top: Math.max(12, Math.min(r.top - 8, window.innerHeight - 520)), left: r.right + 10 });
      else setPosicao({ top: r.bottom + 8, right: 12 });
    }
    setAberto(true);
    void ler();
  }

  async function marcar(ids?: string[]) {
    setItens((a) => a.map((n) => (!ids || ids.includes(n.id) ? { ...n, lida: true } : n)));
    setNaoLidas((n) => (ids ? Math.max(0, n - ids.filter((id) => itens.some((i) => i.id === id && !i.lida)).length) : 0));
    await fetch("/api/notificacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ids ? { ids } : { todas: true }),
    }).catch(() => {});
  }

  function abrirNotificacao(n: NotificacaoNaTela) {
    if (!n.lida) void marcar([n.id]);
    setAberto(false);
    if (n.link) router.push(n.link);
  }

  const contador = naoLidas > 9 ? "9+" : String(naoLidas);
  const rotulo = naoLidas ? `Notificações, ${naoLidas} não ${naoLidas === 1 ? "lida" : "lidas"}` : "Notificações";

  return (
    <>
      {variante === "topo" ? (
        <button
          ref={botao}
          type="button"
          onClick={abrir}
          aria-label={rotulo}
          aria-expanded={aberto}
          data-sino="topo"
          className="relative p-2.5 rounded-lg transition-colors active:bg-[var(--realce-2)]"
          style={{ color: "var(--text-primary)" }}
        >
          <Bell className="w-5 h-5" />
          {naoLidas > 0 && (
            <span
              className="absolute top-1 right-1 min-w-[1.1rem] h-[1.1rem] rounded-full px-1 text-[10px] font-bold leading-[1.1rem] text-center tabular-nums"
              style={{ background: "var(--marca-laranja-botao)", color: "#ffffff" }}
            >
              {contador}
            </span>
          )}
        </button>
      ) : (
        <button
          ref={botao}
          type="button"
          onClick={abrir}
          aria-label={rotulo}
          aria-expanded={aberto}
          data-sino="barra"
          title={collapsed ? rotulo : undefined}
          className={cn(
            "w-full flex items-center rounded-lg text-sm transition-all text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--realce-2)]",
            collapsed ? "gap-2 px-3 py-2 lg:justify-center lg:gap-0 lg:px-2" : "gap-2 px-3 py-2"
          )}
        >
          <span className="relative shrink-0">
            <Bell className="w-4 h-4" />
            {naoLidas > 0 && (
              <span
                className={cn("absolute -top-1 -right-1 h-2 w-2 rounded-full hidden", collapsed ? "lg:block" : "")}
                style={{ background: "var(--marca-laranja)" }}
              />
            )}
          </span>
          <span className={cn("flex-1 text-left", collapsed ? "lg:hidden" : undefined)}>Notificações</span>
          {naoLidas > 0 && (
            <span
              className={cn("ml-auto min-w-[1.25rem] rounded-full px-1.5 text-center text-[11px] font-bold leading-5 tabular-nums", collapsed ? "lg:hidden" : "")}
              style={{ background: "var(--marca-laranja-botao)", color: "#ffffff" }}
            >
              {contador}
            </span>
          )}
        </button>
      )}

      {aberto && posicao
        ? createPortal(
            <div
              ref={painel}
              role="dialog"
              aria-label="Notificações"
              data-painel="notificacoes"
              className="fixed z-[60] w-[min(380px,calc(100vw-24px))] max-h-[min(520px,75vh)] flex flex-col rounded-2xl border shadow-2xl"
              style={{ top: posicao.top, left: posicao.left, right: posicao.right, background: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  Notificações
                </p>
                <div className="flex items-center gap-1">
                  {naoLidas > 0 && (
                    <button type="button" onClick={() => void marcar()} className="text-xs font-medium px-2 py-1 rounded-md text-orange-400 hover:bg-[var(--realce-2)]">
                      Marcar todas como lidas
                    </button>
                  )}
                  <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" className="p-1 rounded-md hover:bg-[var(--realce-2)]" style={{ color: "var(--text-muted)" }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <ul className="overflow-y-auto">
                {itens.length === 0 && (
                  <li className="px-4 py-6 text-sm text-center" style={{ color: "var(--text-muted)" }}>
                    Nada por aqui ainda. Avisamos quando o roteiro pedir a sua aprovação e quando o vídeo ficar pronto.
                  </li>
                )}
                {itens.map((n) => (
                  <li key={n.id} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => abrirNotificacao(n)}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && abrirNotificacao(n)}
                      className="flex gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-[var(--realce-1)]"
                      style={{ background: n.lida ? undefined : "var(--realce-1)" }}
                      data-lida={n.lida ? "1" : "0"}
                    >
                      <span className="mt-0.5 shrink-0">
                        <IconeDoTipo tipo={n.tipo} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn("text-sm leading-snug", n.lida ? "font-medium" : "font-semibold")} style={{ color: "var(--text-primary)" }}>
                            {n.titulo}
                          </p>
                          {!n.lida && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--marca-laranja)" }} aria-label="não lida" />}
                        </div>
                        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                          {n.texto}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <span className="text-[11px]" style={{ color: "var(--text-muted)" }} suppressHydrationWarning>
                            {haQuanto(n.criadaEm, agora)}
                          </span>
                          {n.tipo === "completo" && n.link?.includes("aproveitar=") && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-md px-2 py-0.5 border border-orange-500/40 text-orange-400">
                              <Sparkles className="w-3 h-3" />
                              Aproveitar o roteiro
                            </span>
                          )}
                          {n.codigo && (
                            <>
                              <span className="font-mono text-[11px] rounded px-1.5 py-0.5 border" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
                                Código {n.codigo}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!n.lida) void marcar([n.id]);
                                  setAberto(false);
                                  abrirChamado({ categoria: "problema", codigo: n.codigo ?? undefined, texto: `${n.titulo}. ${n.texto}` });
                                }}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-md px-2 py-0.5 border border-orange-500/40 text-orange-400 hover:bg-orange-500/10"
                              >
                                <LifeBuoy className="w-3 h-3" />
                                Abrir chamado
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
