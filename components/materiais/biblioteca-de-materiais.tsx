"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import Link from "next/link";
import { Camera, Check, Download, ExternalLink, Film, ImagePlus, Loader2, Play, RefreshCw, Trash2, Images } from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { DICA_DA_ETIQUETA, ETIQUETAS, LIMITES_DO_MATERIAL, ROTULO_DA_ETIQUETA, linkDoCard, type CorteNaTela, type Etiqueta, type MaterialNaTela } from "@/lib/materiais/tipos";

/**
 * SEUS MATERIAIS (03/10/2026), pedido do Bruno: "o uso mais comum é a pessoa
 * subir os materiais dela: foto da pessoa, fotos da empresa, do local, dos
 * produtos, vídeos; aí a plataforma gera os textos, efeitos, carrossel e
 * vídeos a partir desse material".
 *
 * Celular primeiro: um botão abre a galeria (várias de uma vez) e outro a
 * câmera. A foto é reduzida no próprio aparelho (2560 px, JPEG) antes de subir,
 * o que também resolve a orientação e o HEIC do iPhone; do vídeo saem a
 * duração, uma miniatura e uma folha de três quadros, que é o que a visão lê.
 * Tudo vai para o Blob privado; as etiquetas chegam sozinhas em segundos e o
 * cliente corrige com um toque.
 *
 * Os CORTES (05/10/2026): os Reels que o squad tirou da gravação do cliente
 * entram aqui também, numa faixa própria com miniatura, duração e o caminho
 * para o card. Moram no vídeo (não são linha de material), então não têm
 * etiqueta nem botão de apagar: aqui é para assistir, baixar e reaproveitar.
 */

const urlDoArquivo = (projectId: string, id: string, v: "mini" | "original" = "mini") => `/api/projects/${projectId}/materiais/${id}/arquivo?v=${v}`;

function paraJpeg(c: HTMLCanvasElement, q = 0.9): Promise<Blob> {
  return new Promise((ok, erro) => c.toBlob((b) => (b ? ok(b) : erro(new Error("não consegui converter a imagem"))), "image/jpeg", q));
}

function canvasDe(fonte: CanvasImageSource, w: number, h: number, max: number): HTMLCanvasElement {
  const s = Math.min(1, max / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * s);
  c.height = Math.round(h * s);
  c.getContext("2d")!.drawImage(fonte, 0, 0, c.width, c.height);
  return c;
}

async function prepararFoto(f: File) {
  const bmp = await createImageBitmap(f, { imageOrientation: "from-image" });
  const c = canvasDe(bmp, bmp.width, bmp.height, 2560);
  const grande = await paraJpeg(c, 0.9);
  const mini = await paraJpeg(canvasDe(bmp, bmp.width, bmp.height, 480), 0.8);
  bmp.close();
  return { arquivo: grande, mini, largura: c.width, altura: c.height };
}

function prepararVideo(f: File): Promise<{ mini: Blob; folha: Blob; duracao: number; largura: number; altura: number }> {
  return new Promise((ok, erro) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    const url = URL.createObjectURL(f);
    v.src = url;
    const quadros: HTMLCanvasElement[] = [];
    let tempos: number[] = [];
    const fim = (e?: Error) => {
      URL.revokeObjectURL(url);
      if (e) erro(e);
    };
    v.onerror = () => fim(new Error("não consegui abrir o vídeo neste aparelho"));
    v.onloadedmetadata = () => {
      const d = v.duration;
      if (!Number.isFinite(d) || d <= 0) return fim(new Error("vídeo sem duração"));
      if (d > LIMITES_DO_MATERIAL.video.maxSegundos + 1) return fim(new Error(`vídeo de ${Math.round(d)} s; aqui vão vídeos de até ${LIMITES_DO_MATERIAL.video.maxSegundos / 60} minutos`));
      tempos = [0.15, 0.5, 0.85].map((x) => x * d);
      v.currentTime = tempos[0];
    };
    v.onseeked = async () => {
      quadros.push(canvasDe(v, v.videoWidth, v.videoHeight, 480));
      if (quadros.length < tempos.length) {
        v.currentTime = tempos[quadros.length];
        return;
      }
      try {
        const mini = await paraJpeg(quadros[1], 0.8);
        const folha = document.createElement("canvas");
        folha.width = quadros.reduce((s, q) => s + q.width, 0);
        folha.height = Math.max(...quadros.map((q) => q.height));
        let x = 0;
        for (const q of quadros) {
          folha.getContext("2d")!.drawImage(q, x, 0);
          x += q.width;
        }
        const out = { mini, folha: await paraJpeg(folha, 0.8), duracao: v.duration, largura: v.videoWidth, altura: v.videoHeight };
        fim();
        ok(out);
      } catch (e) {
        fim(e instanceof Error ? e : new Error("falha ao ler o vídeo"));
      }
    };
  });
}

const nomeSeguro = (n: string) => n.normalize("NFD").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").slice(-60) || "arquivo";

export function BibliotecaDeMateriais({ projectId, compacto = false }: { projectId: string; compacto?: boolean }) {
  const [materiais, setMateriais] = useState<MaterialNaTela[] | null>(null);
  const [cortes, setCortes] = useState<CorteNaTela[]>([]);
  const [filtro, setFiltro] = useState<Etiqueta | "todos" | "video" | "cortes">("todos");
  const [tocando, setTocando] = useState<string | null>(null);
  const [envio, setEnvio] = useState<{ feitos: number; total: number; atual: string } | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/projects/${projectId}/materiais`, { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return;
    const j = (await r.json()) as { materiais: MaterialNaTela[]; cortes?: CorteNaTela[] };
    setMateriais(j.materiais);
    setCortes(j.cortes ?? []);
  }, [projectId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Enquanto alguma etiqueta está sendo lida, pergunta de novo a cada 4 s.
  const analisando = materiais?.some((m) => m.status === "analisando");
  useEffect(() => {
    if (!analisando) return;
    const t = setInterval(() => void carregar(), 4000);
    return () => clearInterval(t);
  }, [analisando, carregar]);

  async function subir(lista: FileList | null) {
    if (!lista?.length) return;
    const arquivos = Array.from(lista).slice(0, LIMITES_DO_MATERIAL.porEnvio);
    if (lista.length > arquivos.length) toast(`Vão ${arquivos.length} de cada vez; suba o resto depois.`);
    let feitos = 0;
    const falhas: string[] = [];
    for (const f of arquivos) {
      setEnvio({ feitos, total: arquivos.length, atual: f.name });
      try {
        const video = f.type.startsWith("video/");
        if (!video && !f.type.startsWith("image/")) throw new Error("só foto ou vídeo");
        const base = `materiais/${projectId}/${Date.now()}-${nomeSeguro(f.name.replace(/\.[^.]+$/, ""))}`;
        const subirUm = (caminho: string, dado: Blob, tipo: "foto" | "video" | "miniatura", contentType: string) =>
          upload(caminho, dado, {
            access: "private",
            handleUploadUrl: `/api/projects/${projectId}/materiais/upload`,
            clientPayload: JSON.stringify({ tipo, tamanho: dado.size }),
            contentType,
            multipart: dado.size > 20 * 1024 * 1024,
          });
        let corpo: Record<string, unknown>;
        if (video) {
          if (f.size > LIMITES_DO_MATERIAL.video.maxBytes) throw new Error("vídeo acima de 400 MB");
          const p = await prepararVideo(f);
          const tipoDoVideo = f.type === "video/quicktime" || f.type === "video/webm" ? f.type : "video/mp4";
          const [arq, mini, folha] = [
            await subirUm(`${base}.${tipoDoVideo === "video/quicktime" ? "mov" : tipoDoVideo === "video/webm" ? "webm" : "mp4"}`, f, "video", tipoDoVideo),
            await subirUm(`${base}-mini.jpg`, p.mini, "miniatura", "image/jpeg"),
            await subirUm(`${base}-folha.jpg`, p.folha, "miniatura", "image/jpeg"),
          ];
          corpo = { tipo: "video", url: arq.url, miniaturaUrl: mini.url, folhaUrl: folha.url, duracaoSec: p.duracao, largura: p.largura, altura: p.altura, sizeBytes: f.size, mimeType: tipoDoVideo, nome: f.name };
        } else {
          const p = await prepararFoto(f);
          const arq = await subirUm(`${base}.jpg`, p.arquivo, "foto", "image/jpeg");
          const mini = await subirUm(`${base}-mini.jpg`, p.mini, "miniatura", "image/jpeg");
          corpo = { tipo: "foto", url: arq.url, miniaturaUrl: mini.url, largura: p.largura, altura: p.altura, sizeBytes: p.arquivo.size, mimeType: "image/jpeg", nome: f.name };
        }
        const r = await fetch(`/api/projects/${projectId}/materiais`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? "não registrou");
        setMateriais((atual) => [j.material as MaterialNaTela, ...(atual ?? [])]);
        feitos++;
      } catch (e) {
        falhas.push(`${f.name}: ${e instanceof Error ? e.message : "falhou"}`);
      }
    }
    setEnvio(null);
    if (feitos) toast.success(feitos === 1 ? "Material salvo. As etiquetas chegam em segundos." : `${feitos} materiais salvos. As etiquetas chegam em segundos.`);
    if (falhas.length) toast.error(falhas.slice(0, 3).join("\n"), { duration: 8000 });
    if (galeria.current) galeria.current.value = "";
    if (camera.current) camera.current.value = "";
  }

  async function trocarEtiqueta(m: MaterialNaTela, e: Etiqueta) {
    const etiquetas = m.etiquetas.includes(e) ? m.etiquetas.filter((x) => x !== e) : [...m.etiquetas, e];
    setMateriais((l) => l?.map((x) => (x.id === m.id ? { ...x, etiquetas, etiquetasEditadas: true } : x)) ?? null);
    const r = await fetch(`/api/projects/${projectId}/materiais/${m.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ etiquetas }) });
    if (!r.ok) {
      toast.error("Não consegui salvar a etiqueta.");
      void carregar();
    }
  }

  async function reler(m: MaterialNaTela) {
    setMateriais((l) => l?.map((x) => (x.id === m.id ? { ...x, status: "analisando" } : x)) ?? null);
    await fetch(`/api/projects/${projectId}/materiais/${m.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reler: true }) });
  }

  async function apagar(m: MaterialNaTela) {
    if (!window.confirm("Apagar este material da biblioteca? O arquivo some de vez.")) return;
    const r = await fetch(`/api/projects/${projectId}/materiais/${m.id}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return void toast.error(j.error ?? "Não consegui apagar.");
    setMateriais((l) => l?.filter((x) => x.id !== m.id) ?? null);
    if (editando === m.id) setEditando(null);
  }

  const visiveis = useMemo(() => {
    const l = materiais ?? [];
    if (filtro === "todos") return l;
    if (filtro === "cortes") return [];
    if (filtro === "video") return l.filter((m) => m.tipo === "video");
    return l.filter((m) => m.etiquetas.includes(filtro));
  }, [materiais, filtro]);

  const contagem = (e: Etiqueta) => materiais?.filter((m) => m.etiquetas.includes(e)).length ?? 0;
  const nVideos = materiais?.filter((m) => m.tipo === "video").length ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold" style={{ color: "var(--text-primary)" }}>
            <Images className="h-5 w-5 text-orange-400" />
            Seus materiais
          </h2>
          <p className="mt-1 max-w-[640px] text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Fotos suas, da equipe, do local e dos produtos, e vídeos curtos do dia a dia. O squad usa o que você subir antes de gerar imagem: a sua foto vira arte com luz, profundidade e o título atrás de você, e os vídeos entram nos cortes. Seu rosto nunca é alterado.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => galeria.current?.click()}
            disabled={Boolean(envio)}
            className="flex h-11 items-center gap-2 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-60"
          >
            {envio ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            Subir fotos e vídeos
          </button>
          <button
            type="button"
            onClick={() => camera.current?.click()}
            disabled={Boolean(envio)}
            aria-label="Tirar foto agora"
            className="flex h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors hover:border-orange-500/50 disabled:opacity-60 sm:hidden"
            style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
          >
            <Camera className="h-4 w-4" />
          </button>
        </div>
        <input ref={galeria} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => void subir(e.target.files)} />
        <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void subir(e.target.files)} />
      </div>

      {envio && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)", color: "var(--text-primary)" }}>
          <div className="flex items-center justify-between gap-3">
            <span className="truncate">Enviando {envio.feitos + 1} de {envio.total}: {envio.atual}</span>
            <span className="shrink-0 text-xs" style={{ color: "var(--text-muted)" }}>mantenha esta tela aberta</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
            <div className="h-full bg-orange-500 transition-all" style={{ width: `${Math.round(((envio.feitos + 0.5) / envio.total) * 100)}%` }} />
          </div>
        </div>
      )}

      {materiais && materiais.length + cortes.length > 0 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {(["todos", ...ETIQUETAS, "video", "cortes"] as const).map((f) => {
            const n = f === "todos" ? materiais.length + cortes.length : f === "video" ? nVideos : f === "cortes" ? cortes.length : contagem(f);
            if (f !== "todos" && n === 0) return null;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFiltro(f)}
                className={cn("h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors", filtro === f ? "border-orange-500 bg-orange-500/10" : "hover:border-orange-500/40")}
                style={{ borderColor: filtro === f ? undefined : "var(--border)", color: filtro === f ? "var(--text-primary)" : "var(--text-muted)" }}
              >
                {f === "todos" ? "Tudo" : f === "video" ? "Vídeos" : f === "cortes" ? "Cortes" : ROTULO_DA_ETIQUETA[f]} <span className="opacity-60">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {materiais === null ? (
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando seus materiais
        </div>
      ) : materiais.length === 0 ? (
        <button
          type="button"
          onClick={() => galeria.current?.click()}
          className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center transition-colors hover:border-orange-500/50"
          style={{ borderColor: "var(--border)" }}
        >
          <ImagePlus className="h-7 w-7 text-orange-400" />
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Comece por 5 a 10 fotos
          </span>
          <span className="max-w-[460px] text-[13px]" style={{ color: "var(--text-muted)" }}>
            Uma sua de frente, bem iluminada; o seu espaço; os produtos; a equipe trabalhando. Vídeos de até 3 minutos também.
          </span>
        </button>
      ) : filtro === "cortes" ? null : (
        <div className={cn("grid items-start gap-3", compacto ? "grid-cols-3 sm:grid-cols-4 lg:grid-cols-6" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5")}>
          {visiveis.map((m) => (
            <div key={m.id} className="flex min-w-0 flex-col overflow-hidden rounded-xl border" style={{ borderColor: editando === m.id ? "rgb(249 115 22)" : "var(--border)", background: "var(--bg-elevated)" }}>
              <button type="button" onClick={() => setEditando(editando === m.id ? null : m.id)} className="relative block aspect-square w-full overflow-hidden" aria-label="Ver e corrigir etiquetas">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={urlDoArquivo(projectId, m.id)} alt={m.descricao ?? m.nome ?? "Material"} loading="lazy" className="h-full w-full object-cover" />
                {m.tipo === "video" && (
                  <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                    <Play className="h-3 w-3" /> {m.duracaoSec ? `${Math.round(m.duracaoSec)} s` : "vídeo"}
                  </span>
                )}
                {m.usos > 0 && <span className="absolute right-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">usado {m.usos}x</span>}
                {m.status === "analisando" && (
                  <span className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-black/70 px-2 py-1.5 text-[11px] text-white">
                    <Loader2 className="h-3 w-3 animate-spin" /> Lendo o material
                  </span>
                )}
              </button>
              <div className="flex min-h-[44px] flex-wrap items-center gap-1 p-2">
                {m.status === "falhou" && !m.etiquetas.length ? (
                  <button type="button" onClick={() => void reler(m)} className="flex items-center gap-1 text-[11px] text-orange-400">
                    <RefreshCw className="h-3 w-3" /> Ler de novo
                  </button>
                ) : (
                  m.etiquetas.map((e) => (
                    <span key={e} className="rounded-full bg-orange-500/10 px-2 py-0.5 text-[11px] font-medium" style={{ color: "var(--text-primary)" }}>
                      {ROTULO_DA_ETIQUETA[e]}
                    </span>
                  ))
                )}
                {m.qualidade === "fraca" && <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ color: "var(--text-muted)", background: "var(--bg-card)" }}>qualidade baixa</span>}
              </div>
              {editando === m.id && (
                <div className="flex flex-col gap-2 border-t p-2" style={{ borderColor: "var(--border)" }}>
                  {m.descricao && (
                    <p className="text-[12px] leading-snug" style={{ color: "var(--text-muted)" }}>
                      {m.descricao}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {ETIQUETAS.map((e) => {
                      const tem = m.etiquetas.includes(e);
                      return (
                        <button
                          key={e}
                          type="button"
                          title={DICA_DA_ETIQUETA[e]}
                          onClick={() => void trocarEtiqueta(m, e)}
                          className={cn("flex h-8 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium", tem ? "border-orange-500 bg-orange-500/15" : "")}
                          style={{ borderColor: tem ? undefined : "var(--border)", color: tem ? "var(--text-primary)" : "var(--text-muted)" }}
                        >
                          {tem && <Check className="h-3 w-3" />}
                          {ROTULO_DA_ETIQUETA[e]}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between">
                    <a href={urlDoArquivo(projectId, m.id, "original")} target="_blank" rel="noreferrer" className="text-[11px] underline" style={{ color: "var(--text-muted)" }}>
                      Abrir original
                    </a>
                    <button type="button" onClick={() => void apagar(m)} className="flex h-8 items-center gap-1 rounded-md px-2 text-[11px] text-red-400 hover:bg-red-500/10">
                      <Trash2 className="h-3.5 w-3.5" /> Apagar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {cortes.length > 0 && (filtro === "todos" || filtro === "cortes") && (
        <section className="flex flex-col gap-3" aria-label="Cortes das suas gravações">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              <Film className="h-4 w-4 text-orange-400" />
              Cortes das suas gravações <span className="font-normal opacity-60">{cortes.length}</span>
            </h3>
            <p className="mt-0.5 text-[12px] leading-snug" style={{ color: "var(--text-muted)" }}>
              Os Reels que o squad tirou do que você gravou. Assista, baixe para postar em outro lugar ou abra o card para ajustar.
            </p>
          </div>
          <div className={cn("grid items-start gap-3", compacto ? "grid-cols-3 sm:grid-cols-4 lg:grid-cols-6" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5")}>
            {cortes.map((c) => (
              <div key={c.id} className="flex min-w-0 flex-col overflow-hidden rounded-xl border" style={{ borderColor: tocando === c.id ? "rgb(249 115 22)" : "var(--border)", background: "var(--bg-elevated)" }}>
                <div className="relative aspect-[4/5] w-full overflow-hidden bg-black">
                  {tocando === c.id ? (
                    <video src={c.videoUrl} poster={c.miniaturaUrl} controls autoPlay playsInline preload="auto" className="h-full w-full object-contain" />
                  ) : (
                    <button type="button" onClick={() => setTocando(c.id)} className="block h-full w-full" aria-label={`Assistir o corte ${c.titulo}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.miniaturaUrl} alt={c.titulo} loading="lazy" className="h-full w-full object-cover" />
                      <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                        <Play className="h-3 w-3" /> {c.duracaoSec ? `${c.duracaoSec} s` : "corte"}
                      </span>
                      <span className="absolute right-2 top-2 rounded-md bg-orange-500/90 px-1.5 py-0.5 text-[11px] font-semibold text-white">Corte</span>
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 p-2">
                  <p className="line-clamp-2 text-[12px] font-medium leading-snug" style={{ color: "var(--text-primary)" }} title={c.gravacao ? `De: ${c.gravacao}` : undefined}>
                    {c.titulo}
                  </p>
                  <div className="flex flex-wrap items-center gap-1">
                    {c.cardId ? (
                      <Link
                        href={linkDoCard(projectId, c.cardId, c.semanaDoCard)}
                        className="flex h-8 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors hover:border-orange-500/50"
                        style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Abrir card
                      </Link>
                    ) : (
                      <span className="flex h-8 items-center px-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                        Ainda sem card
                      </span>
                    )}
                    <a
                      href={c.baixarUrl}
                      className="flex h-8 items-center gap-1 rounded-md px-2 text-[11px] transition-colors hover:bg-orange-500/10"
                      style={{ color: "var(--text-muted)" }}
                      aria-label={`Baixar o corte ${c.titulo}`}
                    >
                      <Download className="h-3.5 w-3.5" /> Baixar
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
