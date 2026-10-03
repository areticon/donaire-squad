"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, PenLine, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CATALOGO_DE_ESTILOS,
  CUSTO_DAS_INSERCOES_IA,
  ESTILOS_COM_BIBLIA,
  GRUPOS,
  MOVIMENTOS_DE_CAMERA,
  EFEITOS,
  LOOKS,
  arteDoEstilo,
  camadasCompativeis,
  estiloDoCatalogo,
  estiloEmBeta,
  normalizarEscolha,
  type EscolhaDeEstilo,
  type EstiloDoCatalogo,
  type OpcaoDeCamada,
} from "@/lib/media/catalogo-de-estilos";
import { ESTILOS, type NomeDoEstilo } from "@/lib/media/estilos";
import { nomeDoEstiloDeLegenda, type EscolhaDaLegenda, type EstiloDeLegenda } from "@/lib/media/legenda-escolhida";
import { EscolhaDaLegenda as EscolhaDaLegendaNaTela } from "@/components/video/escolha-da-legenda";

/**
 * O MENU DE ESTILO EM CAMADAS (29/09/2026), no lugar dos quatro cartões.
 *
 * O Bruno testou e reprovou os quatro estilos (dramático, acelerado, sério,
 * animado): "a lista deve ser igual à da Higgsfield, com artes de exemplo para
 * o usuário saber qual o estilo". Aqui estão as quatro camadas do desenho
 * aprovado (linguagem, movimento de câmera, efeito, look), a linguagem com a
 * arte de exemplo de cada uma, e o "escrever com as minhas palavras", em que o
 * diretor lê o texto e a tela mostra a leitura antes de o cliente confirmar.
 *
 * Os quatro perfis antigos não sumiram: viraram a BASE que cada linguagem usa
 * na legenda e no ritmo dos cortes (ver lib/media/catalogo-de-estilos.ts).
 *
 * DOIS GRUPOS (02/10, pedido do Bruno antes da Gaberlini Consórcios): no alto
 * "Nossos melhores modelos", os estilos com bíblia completa (ritmo medido,
 * regras, revisão); embaixo "Modelos em fase BETA", com um aviso honesto de
 * uma linha, porque eles seguem a base de um dos melhores com o ritmo
 * próprio, e a arte de exemplo pode prometer mais do que o vídeo entrega.
 */
// "legenda" (30/09): com ou sem legenda, e em qual estilo. Aba própria porque
// é uma camada como as outras, e a escolha grava por um caminho só dela (ver
// components/video/escolha-da-legenda.tsx).
type Aba = "linguagem" | "camera" | "efeitos" | "look" | "legenda";

export function CatalogoDeEstilos({
  projectId,
  aoMudarBase,
}: {
  projectId: string;
  /** O perfil de legenda que a linguagem escolhida usa (para o clima da trilha). */
  aoMudarBase?: (base: NomeDoEstilo) => void;
}) {
  const [escolha, setEscolha] = useState<EscolhaDeEstilo | null>(null);
  const [aba, setAba] = useState<Aba>("linguagem");
  const [salvando, setSalvando] = useState(false);
  const [texto, setTexto] = useState("");
  const [lendo, setLendo] = useState(false);
  const [leitura, setLeitura] = useState<EscolhaDeEstilo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const salvoPorUltimo = useRef<string>("");
  const [legenda, setLegenda] = useState<{ escolha: EscolhaDaLegenda; automatica: EstiloDeLegenda | null } | null>(null);
  const [legendaAutomatica, setLegendaAutomatica] = useState<EstiloDeLegenda | null>(null);
  const aoMudarLegenda = useCallback((escolha: EscolhaDaLegenda, automatica: EstiloDeLegenda | null) => setLegenda({ escolha, automatica }), []);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/projects/${projectId}/estilo-de-edicao`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo) return;
        const e = normalizarEscolha(d?.escolha);
        salvoPorUltimo.current = JSON.stringify(e);
        setEscolha(e);
        setTexto(e.texto ?? "");
      })
      .catch(() => vivo && setEscolha(normalizarEscolha(null)));
    return () => {
      vivo = false;
    };
  }, [projectId]);

  // Grava a cada mudança, com um pequeno atraso: vários cliques viram um PUT.
  useEffect(() => {
    if (!escolha) return;
    const atual = JSON.stringify(escolha);
    if (atual === salvoPorUltimo.current) return;
    const t = setTimeout(async () => {
      setSalvando(true);
      try {
        const r = await fetch(`/api/projects/${projectId}/estilo-de-edicao`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(escolha),
        });
        if (!r.ok) throw new Error();
        const d = (await r.json()) as { base?: NomeDoEstilo; legendaAutomatica?: EstiloDeLegenda };
        salvoPorUltimo.current = atual;
        if (d.base) aoMudarBase?.(d.base);
        // A linguagem nova muda o que a legenda automática usa.
        if (d.legendaAutomatica) setLegendaAutomatica(d.legendaAutomatica);
        setErro(null);
      } catch {
        setErro("Não consegui guardar o estilo. A escolha continua na tela; tente de novo.");
      } finally {
        setSalvando(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [escolha, projectId, aoMudarBase]);

  async function interpretar() {
    setLendo(true);
    setErro(null);
    setLeitura(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/estilo-de-edicao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      const d = (await r.json()) as { escolha?: EscolhaDeEstilo; error?: string };
      if (!r.ok || !d.escolha) throw new Error(d.error ?? "Não consegui ler o estilo.");
      setLeitura(d.escolha);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui ler o estilo.");
    } finally {
      setLendo(false);
    }
  }

  if (!escolha) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm" style={{ color: "var(--text-muted)" }}>
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando os estilos
      </div>
    );
  }

  const estilo = estiloDoCatalogo(escolha.estiloId);
  const alternar = (lista: string[], id: string, max: number) =>
    lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id].slice(-max);
  const nomes = (ids: string[], de: OpcaoDeCamada[]) => ids.map((i) => de.find((o) => o.id === i)?.nome).filter(Boolean).join(", ");

  // Os dois grupos (02/10): os de bíblia completa no alto, os em teste embaixo.
  const melhores = ESTILOS_COM_BIBLIA.map((id) => estiloDoCatalogo(id)).filter((e): e is EstiloDoCatalogo => Boolean(e));
  const emBeta = CATALOGO_DE_ESTILOS.filter((e) => estiloEmBeta(e.id));

  /** O cartão de uma linguagem: a arte de exemplo, o nome, a referência e o resumo. */
  const cartao = (e: EstiloDoCatalogo) => {
    const ativo = e.id === escolha.estiloId;
    return (
      <button
        key={e.id}
        type="button"
        // Trocar de linguagem leva só as camadas que a nova aceita (01/10):
        // "colagem" do Vox não vai junto para o MrBeast.
        onClick={() => setEscolha({ ...escolha, estiloId: e.id, ...camadasCompativeis(e.id, escolha), texto: undefined, interpretacao: undefined })}
        aria-pressed={ativo}
        className={cn("group overflow-hidden rounded-xl border text-left transition", ativo ? "ring-2 ring-orange-500" : "hover:border-orange-500/50")}
        style={{ borderColor: ativo ? "var(--brand)" : "var(--border)", background: "var(--bg-surface)" }}
      >
        <div className="relative aspect-video overflow-hidden bg-black/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={arteDoEstilo(e.id)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
          {ativo && (
            <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-white">
              <Check className="h-4 w-4" />
            </span>
          )}
          {/* Selo "beta" (01/10): a linguagem ainda usa a bíblia do kit, sem a própria. */}
          {estiloEmBeta(e.id) && (
            <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white" title="Em teste: segue a base de um dos nossos modelos com o ritmo próprio; o visual pode não sair igual à imagem.">
              beta
            </span>
          )}
        </div>
        <div className="p-2.5">
          <p className="text-sm font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
            {e.nome}
          </p>
          {e.referencia && <p className="text-[11px] font-medium text-orange-400">{e.referencia}</p>}
          <p className="mt-1 line-clamp-2 text-xs" style={{ color: "var(--text-muted)" }}>
            {e.resumo}
          </p>
        </div>
      </button>
    );
  };

  const abas: Array<{ id: Aba; rotulo: string; conta?: number }> = [
    { id: "linguagem", rotulo: "Linguagem" },
    { id: "camera", rotulo: "Movimento de câmera", conta: escolha.camera.length },
    { id: "efeitos", rotulo: "Efeitos", conta: escolha.efeitos.length },
    { id: "look", rotulo: "Look", conta: escolha.look ? 1 : 0 },
    { id: "legenda", rotulo: "Legenda" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Estilo de edição
        </h2>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Escolha a linguagem e some as camadas, como num estúdio. Sempre com as cores, a fonte e o
          logo da sua marca: &quot;estilo Vox&quot; é a linguagem da Vox com as suas cores.
        </p>
      </div>

      {/* As abas das quatro camadas. */}
      <div className="flex flex-wrap gap-1.5 border-b pb-2" style={{ borderColor: "var(--border)" }}>
        {abas.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAba(a.id)}
            className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", aba === a.id ? "bg-orange-500 text-white" : "hover:bg-[var(--bg-elevated)]")}
            style={aba === a.id ? undefined : { color: "var(--text-primary)" }}
          >
            {a.rotulo}
            {a.conta ? <span className="ml-1.5 text-xs opacity-80">{a.conta}</span> : null}
          </button>
        ))}
      </div>

      {aba === "linguagem" && (
        <div className="space-y-5">
          {/* ESCREVER O PRÓPRIO ESTILO: o diretor lê, a tela mostra, o cliente confirma. */}
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
            <div className="mb-2 flex items-center gap-2">
              <PenLine className="h-4 w-4 text-orange-400" />
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Ou escreva o estilo com as suas palavras
              </p>
            </div>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={2}
              maxLength={600}
              placeholder="Ex.: como a Vox, mas mais rápido, com legenda grande e trilha animada"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-orange-500"
              style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            />
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => void interpretar()}
                disabled={lendo || texto.trim().length < 8}
                className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {lendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {lendo ? "O diretor está lendo" : "Ver como o diretor entendeu"}
              </button>
            </div>
            {leitura && (
              <div className="mt-3 rounded-lg border p-3" style={{ borderColor: "var(--brand)", background: "var(--bg-surface)" }}>
                <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                  {leitura.interpretacao}
                </p>
                <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  Linguagem: <b>{estiloDoCatalogo(leitura.estiloId)?.nome}</b>
                  {leitura.camera.length ? ` · Câmera: ${nomes(leitura.camera, MOVIMENTOS_DE_CAMERA)}` : ""}
                  {leitura.efeitos.length ? ` · Efeitos: ${nomes(leitura.efeitos, EFEITOS)}` : ""}
                  {leitura.look ? ` · Look: ${LOOKS.find((l) => l.id === leitura.look)?.nome}` : ""}
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={() => setLeitura(null)} className="rounded-lg border px-3 py-1.5 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
                    Ajustar o texto
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEscolha(leitura);
                      setLeitura(null);
                    }}
                    className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-white"
                  >
                    Está certo, usar este estilo
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* COMO O DIRETOR EDITA (03/10): o corte limpo profissional é o padrão de
              toda linguagem; as inserções de IA (imagem e cena geradas) só com
              a chave ligada aqui, com o custo dito na própria tela. */}
          <section className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }} aria-labelledby="insercoes-ia">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p id="insercoes-ia" className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  Inserções de IA (imagens e cenas geradas)
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  {escolha.insercoesIA
                    ? `Ligadas: o diretor planeja imagens e cenas de cinema na linguagem escolhida. Custa ${CUSTO_DAS_INSERCOES_IA.texto}, e o planejamento leva alguns minutos a mais.`
                    : "Desligadas (padrão): corte limpo profissional, com você na tela, cortes nas pausas, punch-in nas ênfases, poucas cartelas de texto e legenda. A linguagem escolhida define a legenda, as cartelas e o som. Dentro do roteiro, dá para pedir uma imagem numa cena específica."}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(escolha.insercoesIA)}
                onClick={() => setEscolha({ ...escolha, insercoesIA: !escolha.insercoesIA })}
                className={cn("relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors", escolha.insercoesIA ? "bg-orange-500" : "bg-neutral-500/40")}
                title={escolha.insercoesIA ? "Desligar as inserções de IA" : "Ligar as inserções de IA"}
              >
                <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", escolha.insercoesIA ? "translate-x-5" : "translate-x-0.5")} />
              </button>
            </div>
          </section>

          {/* NOSSOS MELHORES MODELOS: os de bíblia completa, na ordem da lista. */}
          <section aria-labelledby="estilos-melhores">
            <div className="mb-2">
              <p id="estilos-melhores" className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Nossos melhores modelos
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Cada um tem manual completo: ritmo medido, regras e revisão do vídeo pronto.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">{melhores.map((e) => cartao(e))}</div>
          </section>

          {/* MODELOS EM FASE BETA: os derivados, com o aviso honesto e os grupos de antes. */}
          <section aria-labelledby="estilos-beta" className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
            <div className="mb-3">
              <p id="estilos-beta" className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Modelos em fase BETA
                <span className="rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">beta</span>
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Em teste: seguem a base de um dos nossos modelos com o ritmo próprio; o visual pode não sair igual à imagem.
              </p>
            </div>
            <div className="space-y-4">
              {GRUPOS.map((grupo) => {
                const doGrupo = emBeta.filter((e) => e.grupo === grupo);
                if (!doGrupo.length) return null;
                return (
                  <div key={grupo}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                      {grupo}
                    </p>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">{doGrupo.map((e) => cartao(e))}</div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* Montada sempre (escondida fora da aba) para o resumo de baixo saber a legenda. */}
      <div className={aba === "legenda" ? "" : "hidden"}>
        <EscolhaDaLegendaNaTela projectId={projectId} automatica={legendaAutomatica} aoMudar={aoMudarLegenda} />
      </div>

      {aba !== "linguagem" && aba !== "legenda" && (
        <div className="space-y-3">
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {aba === "look"
              ? "O tratamento de cor e textura de todo o vídeo. Escolha um, ou nenhum."
              : "Valem para as cenas geradas por IA e para as transições da edição. Escolha até três."}
          </p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {(aba === "camera" ? MOVIMENTOS_DE_CAMERA : aba === "efeitos" ? EFEITOS : LOOKS).map((o) => {
              const ativo =
                aba === "camera" ? escolha.camera.includes(o.id) : aba === "efeitos" ? escolha.efeitos.includes(o.id) : escolha.look === o.id;
              // A camada que a linguagem escolhida recusa aparece apagada (01/10).
              const teste = camadasCompativeis(escolha.estiloId, {
                camera: aba === "camera" ? [o.id] : [],
                efeitos: aba === "efeitos" ? [o.id] : [],
                look: aba === "look" ? o.id : null,
              });
              const recusada = aba === "camera" ? !teste.camera.length : aba === "efeitos" ? !teste.efeitos.length : !teste.look;
              return (
                <button
                  key={o.id}
                  type="button"
                  disabled={recusada && !ativo}
                  title={recusada ? `Não combina com a linguagem ${estilo?.nome ?? ""}` : undefined}
                  onClick={() =>
                    setEscolha(
                      aba === "camera"
                        ? { ...escolha, camera: alternar(escolha.camera, o.id, 3) }
                        : aba === "efeitos"
                          ? { ...escolha, efeitos: alternar(escolha.efeitos, o.id, 3) }
                          : { ...escolha, look: escolha.look === o.id ? null : o.id }
                    )
                  }
                  aria-pressed={ativo}
                  className={cn("rounded-lg border p-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-40", ativo ? "border-orange-500 bg-orange-500/10" : "hover:border-orange-500/40")}
                  style={ativo ? undefined : { borderColor: "var(--border)", background: "var(--bg-surface)" }}
                >
                  <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {ativo && <Check className="h-3.5 w-3.5 text-orange-500" />}
                    {o.nome}
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                    {o.resumo}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* O RESUMO do que vale, e o que os cortes usam hoje. */}
      <div className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
        <b style={{ color: "var(--text-primary)" }}>{estilo?.nome}</b>
        {estilo?.referencia ? ` (${estilo.referencia})` : ""}
        {escolha.camera.length ? ` · Câmera: ${nomes(escolha.camera, MOVIMENTOS_DE_CAMERA)}` : ""}
        {escolha.efeitos.length ? ` · Efeitos: ${nomes(escolha.efeitos, EFEITOS)}` : ""}
        {escolha.look ? ` · Look: ${LOOKS.find((l) => l.id === escolha.look)?.nome}` : ""}
        {escolha.insercoesIA ? " · Inserções de IA ligadas" : " · Corte limpo, sem imagem gerada"}
        {estilo ? `. Nos cortes verticais, o ritmo é "${ESTILOS[estilo.base].rotulo}"` : ""}
        {legenda
          ? legenda.escolha.modo === "sem"
            ? ", sem legenda."
            : legenda.escolha.modo === "estilo"
              ? `, legenda "${nomeDoEstiloDeLegenda(legenda.escolha.estilo)}".`
              : `, legenda automática${legenda.automatica ? ` ("${nomeDoEstiloDeLegenda(legenda.automatica)}")` : ""}.`
          : estilo
            ? "."
            : ""}
        <span className="ml-2 opacity-80">{salvando ? "Guardando..." : erro ? "" : "Guardado no projeto."}</span>
        {erro && <span className="ml-2 text-orange-400">{erro}</span>}
      </div>
    </div>
  );
}
