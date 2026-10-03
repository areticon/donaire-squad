"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, X, LayoutTemplate } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CATEGORIAS_DOS_MODELOS,
  MODELOS_DE_ARTE,
  ROTULO_DO_FORMATO,
  TAMANHO_DO_FORMATO,
  modeloPorId,
  type FormatoDoModelo,
  type ModeloDeArte,
} from "@/lib/modelos-de-arte/catalogo";
import { desenharModelo, type CoresDoDesenho } from "@/lib/modelos-de-arte/desenho";
import { FONTES, URL_DAS_FONTES } from "@/lib/modelos-de-arte/fontes";
import { textosDeExemplo } from "@/lib/modelos-de-arte/textos-de-exemplo";

/**
 * O BOOK DE MODELOS NA TELA (03/10/2026).
 *
 * Pedido do Bruno: "o que gera rejeição é o cliente não saber o que vem e vir
 * uma surpresa; escolher antes é o mais inteligente". Cada modelo aparece JÁ na
 * marca do cliente (as cores efetivas, o logo e o nome dele), com um texto de
 * exemplo do nicho e uma foto de exemplo do setor no lugar da foto. O desenho é
 * o mesmo que compõe a arte de verdade no servidor (lib/modelos-de-arte/desenho.tsx),
 * então a prévia é instantânea, de graça, e a arte sai parecida com ela.
 *
 * A escolha (um ou mais) grava no projeto a cada toque e vale para as próximas
 * artes; muda-se aqui mesmo, no Criar, na campanha ou em Configurações.
 */

interface MarcaDaGaleria {
  nome: string;
  cores: CoresDoDesenho;
  logoUrl: string | null;
  setor: string;
  setorNome: string;
  arroba?: string;
}

/** As fontes do book entram uma vez na página. */
function useFontesDoBook() {
  useEffect(() => {
    if (document.getElementById("fontes-do-book")) return;
    const l = document.createElement("link");
    l.id = "fontes-do-book";
    l.rel = "stylesheet";
    l.href = URL_DAS_FONTES;
    document.head.appendChild(l);
  }, []);
}

/** A proporção do logo, medida no navegador (o desenho precisa dela). */
function useProporcaoDoLogo(url: string | null | undefined): number | null {
  const [p, setP] = useState<number | null>(null);
  useEffect(() => {
    if (!url) return;
    const img = new Image();
    img.onload = () => setP(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1);
    img.src = url;
  }, [url]);
  return url ? p : null;
}

/** A largura de um elemento, para escalar a prévia de 1080 px até o cartão. */
function useLargura<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** O formato em que a galeria mostra o modelo: o primeiro que ele atende. */
function formatoDeVitrine(m: ModeloDeArte): FormatoDoModelo {
  return m.formatos.includes("post") ? "post" : m.formatos.includes("carrossel") ? "carrossel" : m.formatos[0];
}

/** A prévia de um modelo, desenhada em 1080 px e reduzida para caber na caixa. */
export function PreviaDoModelo({
  modelo,
  formato,
  marca,
  logoProporcao,
  caixa,
}: {
  modelo: ModeloDeArte;
  formato: FormatoDoModelo;
  marca: MarcaDaGaleria;
  logoProporcao: number | null;
  /** A caixa onde a prévia cabe inteira (largura e altura em px). */
  caixa: { largura: number; altura: number };
}) {
  const { largura: W, altura: H } = TAMANHO_DO_FORMATO[formato];
  const escala = Math.min(caixa.largura / W, caixa.altura / H);
  const desenho = useMemo(
    () =>
      desenharModelo({
        modelo,
        textos: textosDeExemplo(modelo, marca.setor),
        cores: marca.cores,
        largura: W,
        altura: H,
        foto: modelo.foto === "nenhuma" ? null : `/modelos-de-arte/fotos/${marca.setor}.jpg`,
        logo: marca.logoUrl && logoProporcao ? marca.logoUrl : null,
        logoProporcao,
        marca: marca.nome,
        arroba: marca.arroba,
        pagina: formato === "carrossel" ? { i: 0, total: 5 } : null,
      }),
    [modelo, formato, marca, logoProporcao, W, H]
  );
  if (!caixa.largura) return null;
  return (
    <div style={{ width: W * escala, height: H * escala, overflow: "hidden", position: "relative", borderRadius: 6, boxShadow: "0 1px 6px rgba(0,0,0,0.18)" }}>
      <div style={{ width: W, height: H, transform: `scale(${escala})`, transformOrigin: "top left", position: "absolute", left: 0, top: 0 }}>{desenho}</div>
    </div>
  );
}

function CartaoDoModelo({
  modelo,
  marca,
  logoProporcao,
  escolhido,
  podeMudar,
  aoAlternar,
  aoAbrir,
}: {
  modelo: ModeloDeArte;
  marca: MarcaDaGaleria;
  logoProporcao: number | null;
  escolhido: boolean;
  podeMudar: boolean;
  aoAlternar: () => void;
  aoAbrir: () => void;
}) {
  const [ref, w] = useLargura<HTMLDivElement>();
  return (
    <div
      className={cn("group flex flex-col overflow-hidden rounded-xl border text-left transition", escolhido ? "ring-2 ring-orange-500" : "hover:border-orange-500/50")}
      style={{ borderColor: escolhido ? "var(--brand)" : "var(--border)", background: "var(--bg-surface)" }}
    >
      <button type="button" onClick={aoAbrir} className="relative block w-full" aria-label={`Ver o modelo ${modelo.nome}`}>
        <div ref={ref} className="flex aspect-[4/5] w-full items-center justify-center" style={{ background: "var(--bg-elevated)" }}>
          <PreviaDoModelo modelo={modelo} formato={formatoDeVitrine(modelo)} marca={marca} logoProporcao={logoProporcao} caixa={{ largura: w * 0.92, altura: (w * 5) / 4 * 0.92 }} />
        </div>
        {escolhido && (
          <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-white shadow">
            <Check className="h-4 w-4" />
          </span>
        )}
      </button>
      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <p className="text-sm font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
          {modelo.nome}
        </p>
        <p className="line-clamp-2 text-xs" style={{ color: "var(--text-muted)" }}>
          {modelo.paraQuem}
        </p>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-1.5 pt-1">
          <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            {modelo.formatos.map((f) => ROTULO_DO_FORMATO[f]).join(" · ")}
          </span>
          <button
            type="button"
            disabled={!podeMudar}
            onClick={aoAlternar}
            aria-pressed={escolhido}
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs font-semibold transition disabled:opacity-50",
              escolhido ? "bg-orange-500 text-white" : "border hover:border-orange-500"
            )}
            style={escolhido ? undefined : { borderColor: "var(--border)", color: "var(--text-primary)" }}
          >
            {escolhido ? "Escolhido" : "Escolher"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A ficha do modelo, com a prévia grande e os formatos. */
function FichaDoModelo({
  modelo,
  marca,
  logoProporcao,
  escolhido,
  podeMudar,
  aoAlternar,
  aoFechar,
}: {
  modelo: ModeloDeArte;
  marca: MarcaDaGaleria;
  logoProporcao: number | null;
  escolhido: boolean;
  podeMudar: boolean;
  aoAlternar: () => void;
  aoFechar: () => void;
}) {
  const [formato, setFormato] = useState<FormatoDoModelo>(formatoDeVitrine(modelo));
  const [ref, w] = useLargura<HTMLDivElement>();
  const linhas: Array<[string, string]> = [
    ["A quem serve", modelo.paraQuem],
    ["Estrutura", modelo.estrutura],
    ["Tipografia", `${FONTES[modelo.tipografia.titulo].rotulo} no título, ${FONTES[modelo.tipografia.texto].rotulo} no texto${modelo.tipografia.caixaAlta ? ", em caixa alta" : ""}`],
    ["Cor", modelo.cor],
    ["Foto", modelo.fotoOnde],
    ["Regras do texto", modelo.regrasDeTexto],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6" onClick={aoFechar} role="dialog" aria-modal="true" aria-label={modelo.nome}>
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-y-auto rounded-t-2xl border sm:rounded-2xl md:flex-row"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div ref={ref} className="flex items-center justify-center p-4 md:w-1/2" style={{ background: "var(--bg-elevated)" }}>
          <PreviaDoModelo modelo={modelo} formato={formato} marca={marca} logoProporcao={logoProporcao} caixa={{ largura: w - 32, altura: Math.min(560, typeof window !== "undefined" ? window.innerHeight * 0.55 : 560) }} />
        </div>
        <div className="flex flex-col gap-3 p-5 md:w-1/2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-orange-500">{modelo.categoria}</p>
              <h3 className="text-lg font-bold leading-tight" style={{ color: "var(--text-primary)" }}>
                {modelo.nome}
              </h3>
            </div>
            <button type="button" onClick={aoFechar} className="rounded-lg p-1.5 hover:bg-[var(--bg-elevated)]" aria-label="Fechar">
              <X className="h-5 w-5" style={{ color: "var(--text-muted)" }} />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {modelo.formatos.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormato(f)}
                className={cn("rounded-lg px-2.5 py-1 text-xs font-medium", formato === f ? "bg-orange-500 text-white" : "border")}
                style={formato === f ? undefined : { borderColor: "var(--border)", color: "var(--text-primary)" }}
              >
                {ROTULO_DO_FORMATO[f]}
              </button>
            ))}
          </div>
          <dl className="space-y-2">
            {linhas.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  {k}
                </dt>
                <dd className="text-sm" style={{ color: "var(--text-primary)" }}>
                  {v}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Texto e foto de exemplo do seu nicho ({marca.setorNome}); na sua arte entram o texto do post e uma foto feita para ele. Números do exemplo são ilustrativos.
          </p>
          <button
            type="button"
            disabled={!podeMudar}
            onClick={aoAlternar}
            className={cn("mt-1 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50", escolhido ? "border" : "bg-orange-500 text-white")}
            style={escolhido ? { borderColor: "var(--border)", color: "var(--text-primary)" } : undefined}
          >
            {escolhido ? "Tirar dos meus modelos" : "Usar este modelo nas minhas artes"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function GaleriaDeModelos({
  projectId,
  variante = "completa",
}: {
  projectId: string;
  /** "compacta": dentro da janela da campanha, com a lista rolando em menos altura. */
  variante?: "completa" | "compacta";
}) {
  useFontesDoBook();
  const [dados, setDados] = useState<{ marca: MarcaDaGaleria; podeMudar: boolean } | null>(null);
  const [escolha, setEscolha] = useState<string[]>([]);
  const [categoria, setCategoria] = useState<string>("Todos");
  const [aberto, setAberto] = useState<string | null>(null);
  const [estado, setEstado] = useState<"" | "guardando" | "guardado" | "erro">("");
  const salvo = useRef<string>("");
  const logoProporcao = useProporcaoDoLogo(dados?.marca.logoUrl);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/projects/${projectId}/modelos-de-arte`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo || !d) return;
        setDados({ marca: d.marca, podeMudar: Boolean(d.podeMudar) });
        setEscolha(d.escolha ?? []);
        salvo.current = JSON.stringify(d.escolha ?? []);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [projectId]);

  // Grava a cada mudança, com um pequeno atraso: vários toques viram um PUT.
  useEffect(() => {
    const atual = JSON.stringify(escolha);
    if (!dados || atual === salvo.current) return;
    const t = setTimeout(async () => {
      setEstado("guardando");
      try {
        const r = await fetch(`/api/projects/${projectId}/modelos-de-arte`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: escolha }) });
        if (!r.ok) throw new Error();
        salvo.current = atual;
        setEstado("guardado");
      } catch {
        setEstado("erro");
      }
    }, 400);
    return () => clearTimeout(t);
  }, [escolha, dados, projectId]);

  const alternar = useCallback((id: string) => setEscolha((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id])), []);

  if (!dados) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm" style={{ color: "var(--text-muted)" }}>
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando o book de modelos
      </div>
    );
  }

  const { marca, podeMudar } = dados;
  const categorias = ["Todos", "Escolhidos", ...CATEGORIAS_DOS_MODELOS];
  const lista = MODELOS_DE_ARTE.filter((m) => (categoria === "Todos" ? true : categoria === "Escolhidos" ? escolha.includes(m.id) : m.categoria === categoria));
  const modeloAberto = aberto ? modeloPorId(aberto) : undefined;
  const compacta = variante === "compacta";

  return (
    <section className="space-y-3" aria-labelledby="book-de-modelos">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="book-de-modelos" className={cn("flex items-center gap-2 font-semibold", compacta ? "text-xs" : "text-lg")} style={{ color: "var(--text-primary)" }}>
            <LayoutTemplate className={cn("text-orange-500", compacta ? "h-3.5 w-3.5" : "h-5 w-5")} />
            Book de modelos: sua arte vai ficar assim
          </h2>
          <p className={cn(compacta ? "text-[10px]" : "text-sm", "mt-0.5")} style={{ color: "var(--text-muted)" }}>
            Cada modelo já nas suas cores, com o seu logo e um texto do seu nicho. Escolha um ou mais: as próximas artes saem nesses moldes, sem surpresa.
          </p>
        </div>
        <div className="flex items-center gap-1.5" title="As cores da sua marca usadas nas prévias">
          {[marca.cores.acento, marca.cores.escuro, marca.cores.claro].map((c) => (
            <span key={c} className="h-5 w-5 rounded-full border" style={{ background: c, borderColor: "var(--border)" }} />
          ))}
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {categorias.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategoria(c)}
            className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors", categoria === c ? "bg-orange-500 text-white" : "border hover:border-orange-500/50")}
            style={categoria === c ? undefined : { borderColor: "var(--border)", color: "var(--text-primary)" }}
          >
            {c}
            {c === "Escolhidos" ? ` (${escolha.length})` : ""}
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <p className="rounded-lg border px-3 py-6 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          Nenhum modelo escolhido ainda. Toque em &quot;Escolher&quot; nos que combinam com a sua marca.
        </p>
      ) : (
        <div className={cn("grid gap-3", compacta ? "max-h-[440px] grid-cols-2 overflow-y-auto pr-1 sm:grid-cols-3" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-4")}>
          {lista.map((m) => (
            <CartaoDoModelo
              key={m.id}
              modelo={m}
              marca={marca}
              logoProporcao={logoProporcao}
              escolhido={escolha.includes(m.id)}
              podeMudar={podeMudar}
              aoAlternar={() => alternar(m.id)}
              aoAbrir={() => setAberto(m.id)}
            />
          ))}
        </div>
      )}

      <div className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
        {escolha.length ? (
          <>
            <b style={{ color: "var(--text-primary)" }}>
              {escolha.length} {escolha.length === 1 ? "modelo escolhido" : "modelos escolhidos"}:
            </b>{" "}
            {escolha.map((id) => modeloPorId(id)?.nome).filter(Boolean).join(", ")}. As artes alternam entre eles conforme o formato e o texto do dia.
          </>
        ) : (
          "Sem modelo escolhido, as artes seguem a composição automática da sua marca."
        )}
        <span className="ml-2 opacity-80">{!podeMudar ? "Só o dono da conta muda os modelos." : estado === "guardando" ? "Guardando..." : estado === "guardado" ? "Guardado no projeto." : estado === "erro" ? "Não consegui guardar; tente de novo." : ""}</span>
      </div>

      {modeloAberto && (
        <FichaDoModelo
          modelo={modeloAberto}
          marca={marca}
          logoProporcao={logoProporcao}
          escolhido={escolha.includes(modeloAberto.id)}
          podeMudar={podeMudar}
          aoAlternar={() => alternar(modeloAberto.id)}
          aoFechar={() => setAberto(null)}
        />
      )}
    </section>
  );
}
