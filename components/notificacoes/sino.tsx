"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bell, CheckCircle2, ClipboardCheck, Coins, LifeBuoy, ShieldCheck, Sparkles, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { EVENTO_DO_SINO, haQuanto, type NotificacaoNaTela } from "@/lib/notificacoes/tipos";
import { abrirChamado } from "@/lib/suporte/abrir-chamado";
import toast from "react-hot-toast";
import { BotaoDescartar, FRASE_SO_NESTA_TELA, mostrarToastDoDescarte, useDescartes } from "@/components/ui/descartar";

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
 *
 * DESCARTAR (07/10, pedido do Bruno: "toda notificação precisa ter a opção de
 * descartar"): cada item tem o X, irmão do item e não dentro dele. O item sai
 * na hora e entra no conjunto `escondidos`, aplicado a TODA leitura enquanto
 * durar a visita (sem a tabela dos descartes, o servidor ainda o devolveria).
 * A linha no banco nunca é apagada: ela é a trava do e-mail. A rota devolve as
 * chaves do fato, e a faixa do mesmo fato (a montagem, a campanha) some da
 * tela sem recarregar. Cada leitura leva um número de geração: a resposta de
 * uma leitura que começou antes da última mudança é ignorada, para o item
 * descartado não piscar de volta. Os itens de aprovação também descartam: a
 * ação continua no Gestor e no selo do gêmeo, e o e-mail deles já saiu.
 */

const INTERVALO_MS = 30_000;

function IconeDoTipo({ tipo }: { tipo: string }) {
  if (tipo === "falha") return <AlertTriangle className="w-4 h-4 text-orange-400" />;
  if (tipo === "completo") return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  if (tipo === "estorno") return <Coins className="w-4 h-4 text-amber-500" />;
  // O gêmeo digital (03/10): pedir a confirmação, e o pronto ou recusado.
  if (tipo === "gemeo") return <ShieldCheck className="w-4 h-4 text-orange-400" />;
  if (tipo === "gemeo-aviso") return <Sparkles className="w-4 h-4 text-orange-400" />;
  // O vídeo cancelado pelo cliente (05/10): registro, sem ação.
  if (tipo === "cancelado") return <XCircle className="w-4 h-4" style={{ color: "var(--text-muted)" }} />;
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
  const descartes = useDescartes();
  /** Os ids descartados nesta visita: saem de toda resposta do servidor. */
  const escondidos = useRef<Set<string>>(new Set());
  /** Sobe a cada mudança feita aqui (descartar, restaurar, marcar). */
  const mutacoes = useRef(0);
  /** A geração da última leitura pedida e da última aplicada. */
  const geracoes = useRef({ ultima: 0, aplicada: 0 });

  const ler = useCallback(async () => {
    const geracao = ++geracoes.current.ultima;
    const mutacoesNoInicio = mutacoes.current;
    try {
      const r = await fetch("/api/notificacoes", { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as { itens?: NotificacaoNaTela[]; naoLidas?: number };
      // A leitura que saiu antes de uma mudança chega com o mundo de antes:
      // aplicá-la faria o item descartado piscar de volta.
      if (mutacoes.current !== mutacoesNoInicio || geracao < geracoes.current.aplicada) return;
      geracoes.current.aplicada = geracao;
      const lista = d.itens ?? [];
      const fora = lista.filter((n) => escondidos.current.has(n.id));
      setItens(lista.filter((n) => !escondidos.current.has(n.id)));
      setNaoLidas(Math.max(0, (d.naoLidas ?? 0) - fora.filter((n) => !n.lida).length));
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
    mutacoes.current++;
    setItens((a) => a.map((n) => (!ids || ids.includes(n.id) ? { ...n, lida: true } : n)));
    setNaoLidas((n) => (ids ? Math.max(0, n - ids.filter((id) => itens.some((i) => i.id === id && !i.lida)).length) : 0));
    await fetch("/api/notificacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ids ? { ids } : { todas: true }),
    }).catch(() => {});
  }

  /** Tira o item do sino (a linha fica no banco) e devolve as chaves do fato para a tela. */
  async function descartarItem(n: NotificacaoNaTela) {
    mutacoes.current++;
    escondidos.current.add(n.id);
    setItens((a) => a.filter((x) => x.id !== n.id));
    if (!n.lida) setNaoLidas((c) => Math.max(0, c - 1));
    descartes.anunciar("Aviso descartado.");
    const idDoToast = mostrarToastDoDescarte({ aoDesfazer: () => void restaurarItem(n) });
    try {
      const r = await fetch("/api/notificacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descartar: [n.id] }),
      });
      const d = (await r.json().catch(() => ({}))) as { chaves?: string[]; lembrado?: boolean };
      // A faixa do mesmo fato (a montagem, a campanha) sai da tela agora.
      if (d.chaves?.length) descartes.registrar(d.chaves);
      if (!r.ok || d.lembrado === false) toast(FRASE_SO_NESTA_TELA, { id: idDoToast, duration: 6000 });
    } catch {
      toast(FRASE_SO_NESTA_TELA, { id: idDoToast, duration: 6000 });
    }
  }

  /** O Desfazer do item: pelo id, sem passar pela rota das telas. */
  async function restaurarItem(n: NotificacaoNaTela) {
    mutacoes.current++;
    escondidos.current.delete(n.id);
    descartes.anunciar("Aviso de volta.");
    try {
      const r = await fetch("/api/notificacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurar: [n.id] }),
      });
      const d = (await r.json().catch(() => ({}))) as { chaves?: string[] };
      if (d.chaves?.length) descartes.desfazer(d.chaves, { soNaTela: true });
    } catch {
      /* a próxima leitura conta a verdade */
    }
    void ler();
  }

  /** "Limpar as lidas": as lidas saem do sino (as 500 mais recentes, no servidor). */
  async function limparLidas() {
    mutacoes.current++;
    for (const n of itens) if (n.lida) escondidos.current.add(n.id);
    setItens((a) => a.filter((n) => !n.lida));
    descartes.anunciar("Notificações lidas descartadas.");
    try {
      const r = await fetch("/api/notificacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descartarLidas: true }),
      });
      const d = (await r.json().catch(() => ({}))) as { lembrado?: boolean };
      if (!r.ok || d.lembrado === false) toast(FRASE_SO_NESTA_TELA, { duration: 6000 });
    } catch {
      toast(FRASE_SO_NESTA_TELA, { duration: 6000 });
    }
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
              <ul className="overflow-y-auto" data-lista-de-avisos>
                {itens.length === 0 && (
                  <li className="px-4 py-6 text-sm text-center" style={{ color: "var(--text-muted)" }}>
                    Nada novo por aqui.
                  </li>
                )}
                {itens.map((n) => (
                  <li key={n.id} className="flex items-start border-b last:border-b-0" style={{ borderColor: "var(--border)", background: n.lida ? undefined : "var(--realce-1)" }}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => abrirNotificacao(n)}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && abrirNotificacao(n)}
                      className="flex flex-1 min-w-0 gap-3 pl-4 pr-1 py-3 cursor-pointer transition-colors hover:bg-[var(--realce-1)]"
                      data-lida={n.lida ? "1" : "0"}
                    >
                      <span className="mt-0.5 shrink-0">
                        <IconeDoTipo tipo={n.tipo} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn("text-sm leading-snug", n.lida ? "font-medium" : "font-semibold")} style={{ color: "var(--text-primary)" }} id={`notificacao-${n.id}`}>
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
                    {/* O X, IRMÃO do item (07/10): dentro do role=button ele seria um
                        botão aninhado e o clique navegaria. */}
                    <BotaoDescartar compacto aoDescartar={() => void descartarItem(n)} descricaoId={`notificacao-${n.id}`} className="mt-2.5 mr-2" />
                  </li>
                ))}
              </ul>
              {itens.some((n) => n.lida) && (
                <div className="flex justify-end border-t px-3 py-2" style={{ borderColor: "var(--border)" }}>
                  <button type="button" onClick={() => void limparLidas()} className="text-xs font-medium px-2 py-1 rounded-md hover:bg-[var(--realce-2)]" style={{ color: "var(--text-muted)" }} data-limpar-lidas>
                    Limpar as lidas
                  </button>
                </div>
              )}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
