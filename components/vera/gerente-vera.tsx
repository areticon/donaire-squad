"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, History, Loader2, MessageSquare, Send, Undo2, X } from "lucide-react";
import { AvatarDoAgente } from "@/components/escritorio/avatar-do-agente";
import {
  EVENTO_ABRIR_VERA,
  EVENTO_PROJETO_MUDOU,
  ID_DA_VERA,
  type ItemDoPedido,
  type PedidoNaTela,
  type TurnoDaVera,
} from "@/lib/vera/tipos";

/**
 * A CONVERSA COM A VERA, A GERENTE (04/10/2026).
 *
 * Pedido do Bruno: "eu posso pedir o que eu quiser e ela aplica, ela é a
 * gerente". Abre pelo botão flutuante de qualquer tela do projeto e pela mesa
 * da Vera no escritório (evento EVENTO_ABRIR_VERA).
 *
 * O que a tela garante, e é o pedido inteiro:
 *   - o que vai mudar aparece ANTES, item por item, com o antes, o depois e o
 *     link de onde ver (cor vem com a amostra);
 *   - mudança ampla espera o toque em "Aplicar" (com o custo no botão, quando
 *     há custo); pequena já vem gravada, com "Desfazer" do lado;
 *   - o histórico mostra quem pediu o quê, e desfaz.
 *
 * Não importa nada que toque o banco: fala só com /api/projects/[id]/vera.
 */

const SUGESTOES = [
  "Pare de usar \"minha preta\" nos textos",
  "Mude o tom para mais direto",
  "Tira o LinkedIn de sexta",
  "Como eu edito uma regra?",
];

const ROTULO_DO_ESTADO: Record<PedidoNaTela["status"], { texto: string; cor: string }> = {
  proposto: { texto: "Esperando o seu ok", cor: "#b45309" },
  aplicando: { texto: "Aplicando", cor: "#2563eb" },
  aplicado: { texto: "Feito", cor: "#15803d" },
  desfeito: { texto: "Desfeito", cor: "#64748b" },
  descartado: { texto: "Deixado de lado", cor: "#64748b" },
  falhou: { texto: "Não saiu", cor: "#b91c1c" },
};

const chave = (projectId: string) => `demandou:vera:${projectId}`;

function lerGuardado(projectId: string): TurnoDaVera[] {
  try {
    const bruto = sessionStorage.getItem(chave(projectId));
    const lista = bruto ? (JSON.parse(bruto) as TurnoDaVera[]) : [];
    return Array.isArray(lista) ? lista.slice(-30) : [];
  } catch {
    return [];
  }
}

/**
 * Texto da Vera com os links clicáveis: [texto](/caminho) e o caminho solto
 * (/projects/...), que ela às vezes escreve entre parênteses. Só caminho
 * interno vira link.
 */
function TextoComLinks({ texto }: { texto: string }) {
  const partes: React.ReactNode[] = [];
  const re = /\[([^\]]{1,80})\]\((\/[^\s)]+)\)|(\/projects\/[^\s),]+)/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index));
    partes.push(
      <Link key={i++} href={m[2] ?? m[3]} className="font-semibold underline underline-offset-2" style={{ color: "var(--marca-laranja-botao, #ea580c)" }}>
        {m[1] ?? "abrir aqui"}
      </Link>
    );
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return <span className="whitespace-pre-wrap">{partes}</span>;
}

function Amostras({ cores }: { cores: string[] }) {
  return (
    <span className="inline-flex gap-1 align-middle">
      {cores.map((c) => (
        <span key={c} title={c} className="inline-block h-5 w-5 rounded-md border" style={{ background: c, borderColor: "var(--border)" }} />
      ))}
    </span>
  );
}

function Item({ item }: { item: ItemDoPedido }) {
  return (
    <li className="rounded-lg border p-2.5" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
          {item.titulo}
        </span>
        {item.link && (
          <Link href={item.link} className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium" style={{ color: "var(--marca-laranja-botao, #ea580c)" }}>
            Ver <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      {item.cores ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
          {item.cores.antes.length > 0 && <Amostras cores={item.cores.antes} />}
          <ArrowRight className="h-3.5 w-3.5" />
          <Amostras cores={item.cores.depois} />
          <span className="font-mono">{item.cores.depois.join(", ")}</span>
        </div>
      ) : (
        <div className="mt-1.5 flex flex-col gap-1 text-xs leading-relaxed">
          {item.antes != null && item.antes !== "" && (
            <p className="max-h-28 overflow-auto whitespace-pre-wrap rounded-md px-2 py-1 line-through decoration-1" style={{ background: "rgb(220 38 38 / 0.08)", color: "var(--text-muted)" }}>
              {item.antes}
            </p>
          )}
          {item.depois != null && item.depois !== "" && (
            <p className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md px-2 py-1" style={{ background: "rgb(22 163 74 / 0.10)", color: "var(--text-primary)" }}>
              {item.depois}
            </p>
          )}
        </div>
      )}
      {item.aviso && (
        <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
          {item.aviso}
        </p>
      )}
    </li>
  );
}

function CartaoDoPedido({
  pedido,
  ocupado,
  onAcao,
  compacto = false,
}: {
  pedido: PedidoNaTela;
  ocupado: boolean;
  onAcao: (acao: "aplicar" | "desfazer" | "descartar") => void;
  compacto?: boolean;
}) {
  const estado = ROTULO_DO_ESTADO[pedido.status];
  const [aberto, setAberto] = useState(!compacto);
  return (
    <div data-pedido-da-vera={pedido.status} className="mt-2 rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: estado.cor }}>
          {pedido.status === "aplicando" && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
          {estado.texto}
        </span>
        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          {pedido.itens.length} {pedido.itens.length === 1 ? "item" : "itens"}
          {pedido.custoCreditos > 0 ? ` · ${pedido.custoCreditos} créditos` : ""}
        </span>
        {compacto && (
          <button type="button" onClick={() => setAberto((v) => !v)} className="ml-auto text-xs underline" style={{ color: "var(--text-muted)" }}>
            {aberto ? "esconder" : "ver o que mudou"}
          </button>
        )}
      </div>
      {compacto && (
        <p className="mt-1.5 text-[13px]" style={{ color: "var(--text-primary)" }}>
          <b>{pedido.pedidoPor}</b> pediu: “{pedido.pedido}”
          <span className="block text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            {new Date(pedido.aplicadoEm ?? pedido.criadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            {" · "}
            {pedido.resumo}
          </span>
        </p>
      )}
      {aberto && (
        <ul className="mt-2 flex flex-col gap-2">
          {pedido.itens.map((it, i) => (
            <Item key={i} item={it} />
          ))}
        </ul>
      )}
      {pedido.resultado && (
        <p className="mt-2 text-[12.5px]" style={{ color: "var(--text-primary)" }}>
          {pedido.resultado}
        </p>
      )}
      {pedido.status === "proposto" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={ocupado}
            onClick={() => onAcao("aplicar")}
            data-vera-aplicar
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-marca-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-marca-700 disabled:opacity-60"
          >
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Aplicar{pedido.custoCreditos > 0 ? ` · ${pedido.custoCreditos} créditos` : ""}
          </button>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => onAcao("descartar")}
            className="min-h-10 rounded-lg border px-3.5 py-2 text-sm"
            style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
          >
            Agora não
          </button>
        </div>
      )}
      {pedido.status === "aplicado" && pedido.podeDesfazer && (
        <div className="mt-3">
          <button
            type="button"
            disabled={ocupado}
            onClick={() => onAcao("desfazer")}
            data-vera-desfazer
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-medium"
            style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
          >
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
            Desfazer
          </button>
        </div>
      )}
    </div>
  );
}

export function GerenteVera({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [aberta, setAberta] = useState(false);
  const [aba, setAba] = useState<"conversa" | "historico">("conversa");
  const [turnos, setTurnos] = useState<TurnoDaVera[]>([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [historico, setHistorico] = useState<PedidoNaTela[] | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setTurnos(lerGuardado(projectId)), [projectId]);
  useEffect(() => {
    try {
      sessionStorage.setItem(chave(projectId), JSON.stringify(turnos.slice(-30)));
    } catch {
      // sem armazenamento, a conversa vive só nesta aba
    }
  }, [projectId, turnos]);

  useEffect(() => {
    const abrir = (e: Event) => {
      const d = (e as CustomEvent<{ texto?: string }>).detail;
      setAberta(true);
      setAba("conversa");
      if (d?.texto) setTexto(d.texto);
    };
    window.addEventListener(EVENTO_ABRIR_VERA, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_VERA, abrir);
  }, []);

  useEffect(() => {
    if (!aberta) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAberta(false);
    window.addEventListener("keydown", tecla);
    const t = setTimeout(() => campo.current?.focus(), 60);
    return () => {
      window.removeEventListener("keydown", tecla);
      clearTimeout(t);
    };
  }, [aberta]);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [turnos, pensando, aba]);

  const carregarHistorico = useCallback(() => {
    fetch(`/api/projects/${projectId}/vera`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setHistorico(Array.isArray(d?.pedidos) ? d.pedidos : []))
      .catch(() => setHistorico([]));
  }, [projectId]);
  useEffect(() => {
    if (aberta && aba === "historico") carregarHistorico();
  }, [aberta, aba, carregarHistorico]);

  const trocarPedido = useCallback((p: PedidoNaTela) => {
    setTurnos((antes) => antes.map((t) => (t.pedido?.id === p.id ? { ...t, pedido: p } : t)));
    setHistorico((antes) => (antes ? antes.map((x) => (x.id === p.id ? p : x)) : antes));
  }, []);

  const avisarMudanca = useCallback(() => {
    window.dispatchEvent(new CustomEvent(EVENTO_PROJETO_MUDOU));
    router.refresh();
  }, [router]);

  // Pedido "aplicando" (ação com custo, roda no servidor depois da resposta): relê até sair.
  const aplicando = turnos.filter((t) => t.pedido?.status === "aplicando").map((t) => t.pedido!.id).join(",");
  useEffect(() => {
    if (!aplicando) return;
    const t = setInterval(async () => {
      for (const id of aplicando.split(",")) {
        const r = await fetch(`/api/projects/${projectId}/vera/pedidos/${id}`).catch(() => null);
        const d = r?.ok ? ((await r.json()) as { pedido?: PedidoNaTela }) : null;
        if (d?.pedido && d.pedido.status !== "aplicando") {
          trocarPedido(d.pedido);
          avisarMudanca();
        }
      }
    }, 4000);
    return () => clearInterval(t);
  }, [aplicando, projectId, trocarPedido, avisarMudanca]);

  async function enviar(mensagem: string) {
    const m = mensagem.trim();
    if (!m || pensando) return;
    const conversa = turnos.slice(-8).map((t) => ({ de: t.de, texto: t.texto, pedido: t.pedido ? { resumo: t.pedido.resumo, status: t.pedido.status } : undefined }));
    setTurnos((antes) => [...antes, { de: "voce", texto: m }]);
    setTexto("");
    setPensando(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/vera`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem: m, conversa }),
      });
      const d = (await r.json().catch(() => ({}))) as { resposta?: string; pedido?: PedidoNaTela; error?: string };
      setTurnos((antes) => [...antes, { de: "vera", texto: r.ok ? (d.resposta ?? "") : (d.error ?? "Não consegui responder agora."), pedido: d.pedido }]);
      if (d.pedido?.status === "aplicado") avisarMudanca();
    } catch {
      setTurnos((antes) => [...antes, { de: "vera", texto: "A conexão caiu no meio. Pode mandar de novo?" }]);
    } finally {
      setPensando(false);
    }
  }

  async function agir(pedido: PedidoNaTela, acao: "aplicar" | "desfazer" | "descartar") {
    setOcupado(pedido.id);
    try {
      const r = await fetch(`/api/projects/${projectId}/vera/pedidos/${pedido.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao }),
      });
      const d = (await r.json().catch(() => ({}))) as { pedido?: PedidoNaTela; error?: string };
      if (d.pedido) {
        trocarPedido(d.pedido);
        if (acao !== "descartar" && d.pedido.status !== "aplicando") avisarMudanca();
      } else if (d.error) {
        setTurnos((antes) => [...antes, { de: "vera", texto: d.error! }]);
      }
    } finally {
      setOcupado(null);
    }
  }

  return (
    <>
      {!aberta && (
        <button
          type="button"
          onClick={() => setAberta(true)}
          data-vera-flutuante
          aria-label="Falar com a Vera, gerente do time"
          title="Peça à Vera: ela muda regras, setup e peças do quadro"
          className="fixed bottom-[4.25rem] right-4 z-30 inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs font-semibold shadow-lg transition-colors hover:bg-[var(--realce-2)] print:hidden"
          style={{ background: "var(--bg-elevated)", borderColor: "#eab308", color: "var(--text-primary)" }}
        >
          <AvatarDoAgente agenteId={ID_DA_VERA} tamanho={28} />
          <span>Falar com a Vera</span>
        </button>
      )}

      {aberta && (
        <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
          <button type="button" aria-label="Fechar" className="absolute inset-0 bg-[#02162a]/40" onClick={() => setAberta(false)} />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Conversa com a Vera, gerente do time"
            className="relative flex h-full w-full flex-col border-l shadow-2xl sm:max-w-[460px]"
            style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}
          >
            <header className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
              <AvatarDoAgente agenteId={ID_DA_VERA} tamanho={40} anel />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                  Vera, gerente do time
                </p>
                <p className="text-xs leading-snug" style={{ color: "var(--text-muted)" }}>
                  Peça e ela aplica. O que for grande espera o seu ok.
                </p>
              </div>
              <button type="button" onClick={() => setAberta(false)} aria-label="Fechar" className="rounded-lg p-2 hover:bg-[var(--realce-2)]" style={{ color: "var(--text-muted)" }}>
                <X className="h-4 w-4" />
              </button>
            </header>

            <nav className="flex gap-1 border-b px-3 pt-2" style={{ borderColor: "var(--border)" }}>
              {(
                [
                  ["conversa", "Conversa", MessageSquare],
                  ["historico", "Histórico", History],
                ] as const
              ).map(([id, rotulo, Icone]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setAba(id)}
                  className="inline-flex min-h-10 items-center gap-1.5 border-b-2 px-3 text-sm font-medium"
                  style={{ borderColor: aba === id ? "#eab308" : "transparent", color: aba === id ? "var(--text-primary)" : "var(--text-muted)" }}
                >
                  <Icone className="h-4 w-4" /> {rotulo}
                </button>
              ))}
            </nav>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {aba === "conversa" ? (
                <div className="flex flex-col gap-3">
                  {turnos.length === 0 && (
                    <div className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text-primary)" }}>
                      <p>
                        Oi! Sou a Vera, gerente do seu time. Me diga o que mudar e eu aplico: regras, tom de voz, cores, agenda, links, estilo de edição,
                        modelos de arte e as peças do quadro. Se for dúvida, eu mostro onde fica.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {SUGESTOES.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => void enviar(s)}
                            className="min-h-9 rounded-full border px-3 py-1.5 text-left text-xs"
                            style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--bg-surface)" }}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {turnos.map((t, i) =>
                    t.de === "voce" ? (
                      <p key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md px-3 py-2 text-sm text-white" style={{ background: "#334155" }}>
                        {t.texto}
                      </p>
                    ) : (
                      <div key={i} className="flex gap-2">
                        <AvatarDoAgente agenteId={ID_DA_VERA} tamanho={28} className="mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="rounded-2xl rounded-tl-md border px-3 py-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text-primary)" }}>
                            <TextoComLinks texto={t.texto} />
                          </p>
                          {t.pedido && <CartaoDoPedido pedido={t.pedido} ocupado={ocupado === t.pedido.id} onAcao={(a) => void agir(t.pedido!, a)} />}
                        </div>
                      </div>
                    )
                  )}
                  {pensando && (
                    <p className="flex items-center gap-2 text-sm italic" style={{ color: "var(--text-muted)" }}>
                      <Loader2 className="h-4 w-4 animate-spin" /> A Vera está olhando o projeto…
                    </p>
                  )}
                  <div ref={fim} />
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Tudo o que a Vera mudou neste projeto, quem pediu e quando. Dá para desfazer por até 7 dias.
                  </p>
                  {historico === null ? (
                    <p className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
                      <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                    </p>
                  ) : historico.length === 0 ? (
                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                      Nenhum pedido ainda.
                    </p>
                  ) : (
                    historico.map((p) => <CartaoDoPedido key={p.id} pedido={p} compacto ocupado={ocupado === p.id} onAcao={(a) => void agir(p, a)} />)
                  )}
                </div>
              )}
            </div>

            {aba === "conversa" && (
              <form
                className="flex items-end gap-2 border-t p-3"
                style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}
                onSubmit={(e) => {
                  e.preventDefault();
                  void enviar(texto);
                }}
              >
                <textarea
                  ref={campo}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void enviar(texto);
                    }
                  }}
                  rows={2}
                  maxLength={1500}
                  placeholder="Peça à Vera… ex.: tira o LinkedIn de sexta"
                  aria-label="Mensagem para a Vera"
                  className="min-h-[44px] flex-1 resize-none rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"
                  style={{ borderColor: "var(--border)", background: "var(--bg-input)", color: "var(--text-primary)" }}
                />
                <button
                  type="submit"
                  disabled={pensando || !texto.trim()}
                  aria-label="Enviar"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-marca-600 text-white hover:bg-marca-700 disabled:opacity-50"
                >
                  {pensando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}
