"use client";

import { useEffect, useState } from "react";
import { Ban, Captions, Check, Loader2, Sparkles, Type } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ESTILOS_DE_LEGENDA,
  nomeDoEstiloDeLegenda,
  normalizarLegenda,
  type EscolhaDaLegenda,
  type EstiloDeLegenda,
} from "@/lib/media/legenda-escolhida";

/**
 * A ESCOLHA DA LEGENDA NA TELA (30/09/2026).
 *
 * Pedido do Bruno: o cliente decide se quer legenda e, querendo, escolhe o
 * estilo ou deixa a IA escolher pelo contexto. Três cartões (sem, automática,
 * escolher), e no terceiro a lista curta com uma prévia desenhada de cada
 * estilo, sempre nas cores da marca do projeto: quem escolhe vê a própria cor,
 * e não um exemplo laranja que nunca vai sair no vídeo dele.
 *
 * Aparece em dois lugares: no catálogo de estilo (a tela de sempre) e, em modo
 * `compacto`, na tela de roteiro, como atalho para mudar antes de aprovar. Os
 * dois gravam pelo MESMO caminho (PATCH em /estilo-de-edicao, que muda só a
 * legenda), então um nunca desfaz o outro.
 *
 * A prévia é CSS, não o vídeo: as fontes da edição moram no worker, e aqui
 * entram as mais próximas que o navegador tem. É uma aproximação do desenho.
 */

type Marca = { acento: string; escuro: string; claro: string };
const MARCA_PADRAO: Marca = { acento: "#F97316", escuro: "#15171a", claro: "#f2efe8" };

export function EscolhaDaLegenda({
  projectId,
  automatica: automaticaDeFora,
  compacto = false,
  aoMudar,
}: {
  projectId: string;
  /** O estilo que o modo automático usa agora (o catálogo manda o novo quando a linguagem muda). */
  automatica?: EstiloDeLegenda | null;
  /** Na tela de roteiro: uma linha com a escolha atual e o botão de mudar. */
  compacto?: boolean;
  /** Avisa quem mostra o resumo (o catálogo) a cada leitura e troca. */
  aoMudar?: (legenda: EscolhaDaLegenda, automatica: EstiloDeLegenda | null) => void;
}) {
  const [legenda, setLegenda] = useState<EscolhaDaLegenda | null>(null);
  const [automatica, setAutomatica] = useState<EstiloDeLegenda | null>(null);
  const [marca, setMarca] = useState<Marca>(MARCA_PADRAO);
  const [abrindoEstilos, setAbrindoEstilos] = useState(false);
  const [aberto, setAberto] = useState(!compacto);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/projects/${projectId}/estilo-de-edicao`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { escolha?: { legenda?: unknown }; legendaAutomatica?: EstiloDeLegenda; marca?: Marca } | null) => {
        if (!vivo) return;
        setLegenda(normalizarLegenda(d?.escolha?.legenda));
        setAutomatica(d?.legendaAutomatica ?? null);
        if (d?.marca) setMarca(d.marca);
      })
      .catch(() => vivo && setLegenda({ modo: "auto" }));
    return () => {
      vivo = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (automaticaDeFora) setAutomatica(automaticaDeFora);
  }, [automaticaDeFora]);

  useEffect(() => {
    if (legenda) aoMudar?.(legenda, automatica);
  }, [legenda, automatica, aoMudar]);

  async function guardar(nova: EscolhaDaLegenda) {
    const antes = legenda;
    setLegenda(nova);
    setSalvando(true);
    setSalvo(false);
    setErro(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/estilo-de-edicao`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legenda: nova }),
      });
      if (!r.ok) throw new Error();
      const d = (await r.json()) as { legenda?: unknown; legendaAutomatica?: EstiloDeLegenda };
      setLegenda(normalizarLegenda(d.legenda ?? nova));
      if (d.legendaAutomatica) setAutomatica(d.legendaAutomatica);
      setSalvo(true);
    } catch {
      setLegenda(antes);
      setErro("Não consegui guardar a legenda. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  if (!legenda) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm" style={{ color: "var(--text-muted)" }}>
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando a legenda
      </div>
    );
  }

  const escolhendoEstilo = legenda.modo === "estilo" || abrindoEstilos;
  const estiloAtual: EstiloDeLegenda | null = legenda.modo === "estilo" ? legenda.estilo ?? null : legenda.modo === "auto" ? automatica : null;
  const resumo =
    legenda.modo === "sem"
      ? "Sem legenda"
      : legenda.modo === "estilo"
        ? nomeDoEstiloDeLegenda(legenda.estilo)
        : `Automática${automatica ? `: ${nomeDoEstiloDeLegenda(automatica).toLowerCase()}` : ""}`;

  const estado = (
    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
      {salvando ? "Guardando..." : erro ? <span className="text-orange-400">{erro}</span> : salvo ? "Guardado no projeto." : ""}
    </span>
  );

  // ── Compacto (tela de roteiro): a escolha atual numa linha, e o atalho. ──
  if (compacto && !aberto) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-16 w-28 shrink-0 overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
          {estiloAtual && legenda.modo !== "sem" ? (
            <PreviaDaLegenda estilo={estiloAtual} marca={marca} pequena />
          ) : (
            <FundoDaPrevia pequena>
              <Ban className="h-5 w-5 text-white/70" />
            </FundoDaPrevia>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {resumo}
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {legenda.modo === "sem"
              ? "Nenhum dos vídeos (cortes e completo) vai ter legenda."
              : legenda.modo === "auto"
                ? "Escolhida pela linguagem do vídeo, nas cores da sua marca. Vale para os cortes e o completo."
                : "Este estilo vale para os cortes e o completo, nas cores da sua marca."}
          </p>
          {estado}
        </div>
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="rounded-lg border px-3 py-1.5 text-sm font-semibold"
          style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
        >
          Mudar a legenda
        </button>
      </div>
    );
  }

  const modos: Array<{ id: "sem" | "auto" | "estilo"; titulo: string; texto: string; Icone: typeof Ban }> = [
    { id: "sem", titulo: "Sem legenda", texto: "O vídeo sai limpo, sem texto da fala em nenhum corte nem no completo.", Icone: Ban },
    {
      id: "auto",
      titulo: "Legenda automática",
      texto: `A IA escolhe o estilo pela linguagem do vídeo e pela sua marca${automatica ? `. Hoje sairia: ${nomeDoEstiloDeLegenda(automatica).toLowerCase()}` : ""}.`,
      Icone: Sparkles,
    },
    { id: "estilo", titulo: "Escolher o estilo", texto: "Você fixa um estilo, e ele vale para todos os vídeos do projeto.", Icone: Type },
  ];
  const ativoNoModo = (id: "sem" | "auto" | "estilo") => (id === "estilo" ? escolhendoEstilo : legenda.modo === id && !abrindoEstilos);

  return (
    <div className="space-y-3">
      {!compacto && (
        <div className="flex items-center gap-2">
          <Captions className="h-4 w-4 text-orange-400" />
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Legenda
          </p>
          {estado}
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Legenda">
        {modos.map(({ id, titulo, texto, Icone }) => {
          const ativo = ativoNoModo(id);
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={ativo}
              disabled={salvando}
              onClick={() => {
                if (id === "estilo") {
                  setAbrindoEstilos(true);
                  // Quem abre a lista já sai com um estilo: o que o automático usava.
                  if (legenda.modo !== "estilo") void guardar({ modo: "estilo", estilo: automatica ?? "palavra" });
                  return;
                }
                setAbrindoEstilos(false);
                void guardar({ modo: id });
              }}
              className={cn("rounded-lg border p-3 text-left transition", ativo ? "border-orange-500 bg-orange-500/10" : "hover:border-orange-500/40")}
              style={ativo ? undefined : { borderColor: "var(--border)", background: "var(--bg-surface)" }}
            >
              <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {ativo ? <Check className="h-3.5 w-3.5 text-orange-500" /> : <Icone className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />}
                {titulo}
                {id === "auto" && <span className="ml-1 rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-orange-400">Padrão</span>}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                {texto}
              </p>
            </button>
          );
        })}
      </div>

      {escolhendoEstilo && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {ESTILOS_DE_LEGENDA.map((e) => {
            const ativo = legenda.modo === "estilo" && legenda.estilo === e.id;
            return (
              <button
                key={e.id}
                type="button"
                aria-pressed={ativo}
                disabled={salvando}
                onClick={() => void guardar({ modo: "estilo", estilo: e.id })}
                className={cn("overflow-hidden rounded-xl border text-left transition", ativo ? "ring-2 ring-orange-500" : "hover:border-orange-500/50")}
                style={{ borderColor: ativo ? "var(--brand)" : "var(--border)", background: "var(--bg-surface)" }}
              >
                <div className="relative aspect-[4/5]">
                  <PreviaDaLegenda estilo={e.id} marca={marca} />
                  {ativo && (
                    <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-white">
                      <Check className="h-4 w-4" />
                    </span>
                  )}
                </div>
                <div className="p-2.5">
                  <p className="text-sm font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
                    {e.nome}
                  </p>
                  <p className="mt-1 line-clamp-3 text-xs" style={{ color: "var(--text-muted)" }}>
                    {e.resumo}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {compacto && (
        <div className="flex items-center justify-between gap-2">
          {estado}
          <button
            type="button"
            onClick={() => setAberto(false)}
            className="rounded-lg border px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
          >
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}

/** Um quadro escuro com uma silhueta, para a legenda ter onde pousar. */
function FundoDaPrevia({ children, pequena = false }: { children: React.ReactNode; pequena?: boolean }) {
  return (
    <div
      className="relative flex h-full w-full items-end justify-center overflow-hidden"
      style={{ background: "linear-gradient(160deg, #3a4150 0%, #1d2129 60%, #121418 100%)", paddingBottom: pequena ? 8 : 18 }}
    >
      {/* A pessoa, em silhueta: cabeça e ombros. */}
      <div aria-hidden className="absolute left-1/2 -translate-x-1/2 rounded-full" style={{ top: "14%", width: "30%", aspectRatio: "1", background: "#4b5362" }} />
      <div aria-hidden className="absolute left-1/2 -translate-x-1/2" style={{ top: "44%", width: "70%", height: "70%", borderRadius: "45% 45% 0 0", background: "#4b5362" }} />
      <div className="relative z-10 flex w-full justify-center px-1.5">{children}</div>
    </div>
  );
}

/** "Isso muda o seu negócio" em cada estilo, com a palavra falada ("muda") no destaque. */
export function PreviaDaLegenda({ estilo, marca, pequena = false }: { estilo: EstiloDeLegenda; marca: Marca; pequena?: boolean }) {
  const k = pequena ? 0.45 : 1;
  const sobreOAcento = contraste(marca.acento);
  let conteudo: React.ReactNode;
  if (estilo === "palavra") {
    conteudo = (
      <span style={{ fontFamily: "Anton, Impact, 'Arial Black', sans-serif", fontSize: 34 * k, lineHeight: 1, textTransform: "uppercase", color: marca.acento, WebkitTextStroke: `${3 * k}px #000`, paintOrder: "stroke fill", letterSpacing: 0.5 }}>
        muda
      </span>
    );
  } else if (estilo === "caixa") {
    conteudo = (
      <span style={{ background: marca.escuro, color: "#fff", fontWeight: 800, fontSize: 15 * k, lineHeight: 1.25, padding: `${4 * k}px ${9 * k}px`, borderRadius: 4 * k, fontFamily: "'Liberation Sans', Arial, sans-serif", textAlign: "center" }}>
        Isso <span style={{ color: marca.acento }}>muda</span> o seu negócio
      </span>
    );
  } else if (estilo === "marca-texto") {
    conteudo = (
      <span style={{ fontWeight: 800, fontSize: 16 * k, lineHeight: 1.35, fontFamily: "'Liberation Sans', Arial, sans-serif", textAlign: "center", color: "#fff", textShadow: "0 2px 6px rgba(0,0,0,0.8)" }}>
        <span style={{ background: marca.acento, color: sobreOAcento, padding: `0 ${4 * k}px`, borderRadius: 2, textShadow: "none" }}>Isso</span>{" "}
        <span style={{ background: marca.acento, color: sobreOAcento, padding: `0 ${4 * k}px`, borderRadius: 2, textShadow: "none" }}>muda</span> o seu negócio
      </span>
    );
  } else if (estilo === "papel") {
    const papel = (t: string, grifo = false, giro = 0) => (
      <span style={{ display: "inline-block", background: grifo ? marca.acento : "#FBFAF5", color: grifo ? sobreOAcento : "#16171a", padding: `${2 * k}px ${6 * k}px`, transform: `rotate(${giro}deg)`, boxShadow: `${2 * k}px ${3 * k}px 0 rgba(0,0,0,0.35)`, margin: `0 ${2 * k}px` }}>
        {t}
      </span>
    );
    conteudo = (
      <span style={{ fontFamily: "'Archivo Black', 'Arial Black', sans-serif", fontSize: 16 * k, lineHeight: 1.5, textAlign: "center" }}>
        {papel("Isso", false, -2)}
        {papel("muda", true, 1.5)}
        {papel("tudo", false, -1)}
      </span>
    );
  } else {
    conteudo = (
      <span style={{ fontWeight: 700, fontSize: 13 * k, lineHeight: 1.3, fontFamily: "'Liberation Sans', Arial, sans-serif", textAlign: "center", color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.95)" }}>
        Isso <span style={{ color: marca.acento }}>muda</span> o seu negócio
      </span>
    );
  }
  return <FundoDaPrevia pequena={pequena}>{conteudo}</FundoDaPrevia>;
}

/** Preto ou branco, o que ler melhor sobre a cor (a mesma conta do worker). */
function contraste(hex: string): string {
  const h = hex.replace("#", "");
  const c = h.length === 3 ? h.split("").map((x) => x + x).join("") : h.slice(0, 6);
  const l = (0.299 * parseInt(c.slice(0, 2), 16) + 0.587 * parseInt(c.slice(2, 4), 16) + 0.114 * parseInt(c.slice(4, 6), 16)) / 255;
  return l > 0.6 ? "#16171a" : "#ffffff";
}
