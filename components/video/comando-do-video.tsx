"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { Check, Loader2, Mic, Sparkles, Square, Wand2 } from "lucide-react";
import {
  FONTES_DO_COMANDO,
  montarComando,
  OPCOES_DO_AJUDANTE,
  PALETAS_PRONTAS,
  type ComandoDoVideo,
  type CoresDoComando,
  type EscolhasDoAjudante,
  type FonteDoComando,
} from "@/lib/media/editor-por-comando/comando";
import { comandoDoEstilo, miniaturasDosEstilos } from "@/lib/media/editor-por-comando/comando-dos-estilos";
import { estiloDoCatalogo } from "@/lib/media/catalogo-de-estilos";
import { PreviaDoEstiloDeVideo, temPreviaDeVideo } from "@/components/video/previa-do-estilo-de-video";

/**
 * O COMANDO DO VÍDEO (05/10/2026): com o editor por comando ligado
 * (EDITOR_POR_COMANDO=1), esta tela SUBSTITUI a escolha de estilo do
 * catálogo. O cliente descreve o vídeo que quer (escrevendo ou falando),
 * pode partir de uma referência pronta ou do ajudante, e responde duas
 * perguntas rápidas: a letra e as cores. Desligado, mostra a `reserva` (o
 * catálogo de estilos de sempre).
 *
 * Componente cliente: fala só com /api/projects/[id]/comando-do-video.
 */

type Marca = { acento: string; escuro: string; claro: string };
type Projeto = { paleta: string[]; nicho: string | null; publico: string | null; nome: string | null };

/** As miniaturas visíveis antes de "ver todos" (as em destaque e as de bíblia completa vêm primeiro). */
const MINIATURAS_INICIAIS = 8;

export function ComandoDoVideo({ projectId, reserva }: { projectId: string; reserva: ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [ligado, setLigado] = useState(false);
  const [marca, setMarca] = useState<Marca>({ acento: "#F97316", escuro: "#15171a", claro: "#f2efe8" });
  const [projeto, setProjeto] = useState<Projeto>({ paleta: [], nicho: null, publico: null, nome: null });
  const [todosOsEstilos, setTodosOsEstilos] = useState(false);
  const [texto, setTexto] = useState("");
  const [fonte, setFonte] = useState<FonteDoComando>("geist");
  const [cores, setCores] = useState<CoresDoComando>({ tipo: "marca" });
  const [origem, setOrigem] = useState<ComandoDoVideo["origem"]>("escrito");
  const [referencia, setReferencia] = useState<string | null>(null);
  const [salvo, setSalvo] = useState<string>("");
  const [salvando, setSalvando] = useState(false);
  const [ajudante, setAjudante] = useState(false);
  const [escolhas, setEscolhas] = useState<EscolhasDoAjudante>({});
  const [gravando, setGravando] = useState(false);
  const [transcrevendo, setTranscrevendo] = useState(false);
  const gravador = useRef<MediaRecorder | null>(null);
  const pedacos = useRef<Blob[]>([]);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/projects/${projectId}/comando-do-video`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { ligado?: boolean; comando?: ComandoDoVideo | null; marca?: Marca; paleta?: string[]; nicho?: string | null; publico?: string | null; nome?: string | null } | null) => {
        if (!vivo) return;
        setLigado(Boolean(d?.ligado));
        if (d?.marca) setMarca(d.marca);
        setProjeto({ paleta: Array.isArray(d?.paleta) && d.paleta.length ? d.paleta : d?.marca ? [d.marca.acento, d.marca.escuro, d.marca.claro] : [], nicho: d?.nicho ?? null, publico: d?.publico ?? null, nome: d?.nome ?? null });
        if (d?.comando) {
          setTexto(d.comando.texto);
          setFonte(d.comando.fonte);
          setCores(d.comando.cores);
          setOrigem(d.comando.origem ?? "escrito");
          setReferencia(d.comando.referencia ?? null);
          setSalvo(JSON.stringify([d.comando.texto, d.comando.fonte, d.comando.cores]));
        }
      })
      .catch(() => setLigado(false))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [projectId]);

  if (carregando) {
    return (
      <div className="flex items-center gap-2 rounded-xl border p-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando como seus vídeos são editados...
      </div>
    );
  }
  if (!ligado) return <>{reserva}</>;

  const mudou = JSON.stringify([texto.trim(), fonte, cores]) !== salvo;

  // A MINIATURA DO ESTILO (05/10, noite): o clique preenche o comando com a linguagem do estilo, as cores da
  // marca, o nicho do projeto e a sugestão de ritmo e elementos (o texto continua editável; o JEV segue livre).
  const miniaturas = miniaturasDosEstilos();
  function usarEstilo(id: string) {
    const m = miniaturas.find((x) => x.id === id);
    const t = comandoDoEstilo(id, projeto);
    if (!m || !t) return;
    setTexto(t);
    setFonte(m.fonte);
    setReferencia(id);
    setOrigem("referencia");
  }
  const estiloEscolhido = referencia ? estiloDoCatalogo(referencia) : undefined;

  async function salvar() {
    if (texto.trim().length < 3) {
      toast.error("Escreva o comando do vídeo primeiro.");
      return;
    }
    setSalvando(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/comando-do-video`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: texto.trim(), fonte, cores, origem, referencia }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Não consegui salvar.");
      setSalvo(JSON.stringify([texto.trim(), fonte, cores]));
      toast.success("Comando salvo. Vale para os próximos cortes.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarGravacao() {
    if (gravando) {
      gravador.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      pedacos.current = [];
      rec.ondataavailable = (e) => e.data.size && pedacos.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setGravando(false);
        const audio = new Blob(pedacos.current, { type: rec.mimeType || "audio/webm" });
        setTranscrevendo(true);
        try {
          const r = await fetch(`/api/projects/${projectId}/comando-do-video/voz`, { method: "POST", headers: { "Content-Type": audio.type }, body: audio });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d.error || "Não consegui transcrever.");
          setTexto((atual) => (atual.trim() ? `${atual.trim()} ${d.texto}` : d.texto));
          setOrigem("voz");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Não consegui transcrever.");
        } finally {
          setTranscrevendo(false);
        }
      };
      gravador.current = rec;
      rec.start();
      setGravando(true);
    } catch {
      toast.error("Não consegui abrir o microfone. Confira a permissão do navegador.");
    }
  }

  const cartao = "rounded-xl border p-4";
  const estiloCartao = { borderColor: "var(--border)", background: "var(--bg-surface)" };
  const chip = (ativo: boolean) => ({
    borderColor: ativo ? "#f97316" : "var(--border)",
    background: ativo ? "rgba(249,115,22,0.10)" : "transparent",
    color: "var(--text-primary)",
  });

  return (
    <div className="space-y-4">
      <div className={cartao} style={estiloCartao}>
        <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
          Descreva o vídeo que você quer
        </p>
        <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
          Escreva ou fale do seu jeito: o estilo, o clima, o que deve aparecer na tela. O diretor de edição monta cada corte a partir deste comando.
        </p>

        {/* As miniaturas dos estilos (05/10, noite): um clique preenche o comando com a linguagem, as cores da marca e o nicho. */}
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {(todosOsEstilos ? miniaturas : miniaturas.slice(0, MINIATURAS_INICIAIS)).map((m) => {
            const ativo = referencia === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => usarEstilo(m.id)}
                aria-pressed={ativo}
                className="min-w-0 overflow-hidden rounded-lg border text-left transition-colors"
                style={chip(ativo)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.arte} alt="" loading="lazy" className="block aspect-video w-full object-cover" style={{ background: "var(--bg-input)" }} />
                <span className="block px-2 pt-1.5 text-xs font-bold leading-tight sm:text-sm">{m.nome}</span>
                <span className="block truncate px-2 pb-2 text-[11px] sm:text-xs" style={{ color: "var(--text-muted)" }}>
                  {m.referencia ?? (m.destaque ? "em destaque" : " ")}
                </span>
              </button>
            );
          })}
        </div>
        {miniaturas.length > MINIATURAS_INICIAIS && (
          <button type="button" onClick={() => setTodosOsEstilos((v) => !v)} className="mb-3 text-sm font-bold" style={{ color: "#f97316" }}>
            {todosOsEstilos ? "Ver menos estilos" : `Ver todos os estilos (${miniaturas.length})`}
          </button>
        )}

        <div className="relative">
          <textarea
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setOrigem("escrito");
            }}
            rows={5}
            maxLength={1500}
            placeholder='Ex.: "estilo Vox, recortes de papel, colagem, mapa antigo quando eu falar de lugar"'
            className="w-full resize-y rounded-lg border px-3 py-2 pr-12 text-sm outline-none focus:ring-2 focus:ring-orange-500"
            style={{ borderColor: "var(--border)", background: "var(--bg-input)", color: "var(--text-primary)" }}
          />
          <button
            type="button"
            onClick={() => void alternarGravacao()}
            disabled={transcrevendo}
            aria-label={gravando ? "Parar e transcrever" : "Falar o comando"}
            className="absolute right-2 top-2 rounded-full p-2"
            style={{ background: gravando ? "#dc2626" : "var(--bg-surface)", color: gravando ? "#fff" : "var(--text-primary)", border: "1px solid var(--border)" }}
          >
            {transcrevendo ? <Loader2 className="h-4 w-4 animate-spin" /> : gravando ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
        </div>
        {origem === "referencia" && estiloEscolhido && (
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            Preenchido a partir do estilo {estiloEscolhido.nome}, com as cores da sua marca e o seu nicho. Edite à vontade: é uma sugestão, e o editor escolhe em cada momento o que a fala pede.
          </p>
        )}
        {gravando && (
          <p className="mt-1 text-xs font-bold" style={{ color: "#dc2626" }}>
            Gravando. Fale o vídeo que você quer e toque no quadrado para parar.
          </p>
        )}

        <button
          type="button"
          onClick={() => setAjudante((v) => !v)}
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold"
          style={{ color: "#f97316" }}
        >
          <Wand2 className="h-4 w-4" /> Me ajude a escrever o comando
        </button>

        {ajudante && (
          <div className="mt-3 space-y-3 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
            {(
              [
                ["clima", "Qual o clima?"],
                ["visual", "O que aparece na tela?"],
                ["ritmo", "Qual o ritmo?"],
                ["imagens", "Imagens geradas?"],
              ] as const
            ).map(([campo, pergunta]) => (
              <div key={campo}>
                <p className="mb-1 text-xs font-bold" style={{ color: "var(--text-muted)" }}>
                  {pergunta}
                </p>
                <div className="flex flex-wrap gap-2">
                  {OPCOES_DO_AJUDANTE[campo].map((o) => (
                    <button key={o.id} type="button" onClick={() => setEscolhas((e) => ({ ...e, [campo]: o.id }))} className="rounded-full border px-3 py-1 text-xs" style={chip(escolhas[campo] === o.id)}>
                      {o.texto}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <input
              value={escolhas.extra ?? ""}
              onChange={(e) => setEscolhas((x) => ({ ...x, extra: e.target.value }))}
              placeholder="Algo mais? (opcional)"
              className="w-full rounded-lg border px-3 py-1.5 text-sm outline-none"
              style={{ borderColor: "var(--border)", background: "var(--bg-input)", color: "var(--text-primary)" }}
            />
            <button
              type="button"
              disabled={!montarComando(escolhas)}
              onClick={() => {
                setTexto(montarComando(escolhas));
                setOrigem("ajudante");
                setReferencia(null);
                setAjudante(false);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" /> Usar este comando
            </button>
          </div>
        )}
      </div>

      {/* A prévia do estilo escolhido, nas cores reais da marca (os estilos com prévia própria). */}
      {estiloEscolhido && temPreviaDeVideo(estiloEscolhido.id) && <PreviaDoEstiloDeVideo projectId={projectId} estiloId={estiloEscolhido.id} nomeDoEstilo={estiloEscolhido.nome} />}

      {/* Pergunta 1: a letra, mostrada nela mesma (aproximada no navegador). */}
      <div className={cartao} style={estiloCartao}>
        <p className="mb-2 text-sm font-bold" style={{ color: "var(--text-primary)" }}>
          Qual letra nos títulos?
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FONTES_DO_COMANDO.map((f) => (
            <button key={f.id} type="button" onClick={() => setFonte(f.id)} className="rounded-lg border p-3 text-left" style={chip(fonte === f.id)}>
              <span className="block truncate text-xl" style={{ fontFamily: f.amostraCss, fontWeight: f.amostraPeso, textTransform: f.caixaAlta ? "uppercase" : "none" }}>
                Seu vídeo
              </span>
              <span className="mt-1 block text-xs font-bold">{f.nome}</span>
              <span className="block text-xs" style={{ color: "var(--text-muted)" }}>
                {f.resumo}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Pergunta 2: as cores (as da marca por padrão). */}
      <div className={cartao} style={estiloCartao}>
        <p className="mb-2 text-sm font-bold" style={{ color: "var(--text-primary)" }}>
          Quais cores?
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
          {[{ id: "marca", nome: "As da minha marca", ...marca }, ...PALETAS_PRONTAS].map((p) => {
            const ativo = p.id === "marca" ? cores.tipo === "marca" : cores.tipo === "outra" && cores.acento === p.acento && cores.escuro === p.escuro;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setCores(p.id === "marca" ? { tipo: "marca" } : { tipo: "outra", acento: p.acento, escuro: p.escuro, claro: p.claro })}
                className="flex items-center gap-2 rounded-lg border p-2 text-left"
                style={chip(ativo)}
              >
                <span className="flex shrink-0 overflow-hidden rounded-md border" style={{ borderColor: "var(--border)" }}>
                  {[p.escuro, p.acento, p.claro].map((c) => (
                    <span key={c} className="h-6 w-4" style={{ background: c }} />
                  ))}
                </span>
                <span className="text-xs font-bold">{p.nome}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {!mudou && salvo && (
          <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
            <Check className="h-4 w-4" /> Salvo
          </span>
        )}
        <button type="button" onClick={() => void salvar()} disabled={salvando || !mudou} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
          {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar comando
        </button>
      </div>
    </div>
  );
}
