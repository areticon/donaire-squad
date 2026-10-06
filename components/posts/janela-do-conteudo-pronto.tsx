"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, FileUp, Loader2, Repeat, Sparkles, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { RedeIcone } from "@/components/social/rede-icone";
import { cn } from "@/lib/utils";
import { NOMES_DAS_REDES } from "@/lib/posts/estado";
import { deCampos, paraCampos, proximoHorarioLivre } from "@/lib/posts/horario-da-peca";
import { formatosDaRede, rotuloDoFormatoNaRede, type FormatoDeDestino } from "@/lib/publish/formato-de-destino";
import {
  conferirParaRede,
  extensaoDoMime,
  fraseDaRecorrencia,
  HORA_PADRAO,
  MAX_BYTES_DO_ARQUIVO,
  nomeSeguro,
  ocorrenciasDaSerie,
  tipoDaPeca,
  tipoDoArquivo,
  type ArquivoMedido,
  type PedidoDeConteudoPronto,
  type Recorrencia,
  type TipoDaPeca,
  type TipoDeRecorrencia,
} from "@/lib/posts/conteudo-pronto";

/**
 * SUBIR UM CONTEÚDO PRONTO MEU (06/10/2026): a janela em que o cliente sobe
 * a arte ou o vídeo que ele já tem e põe num dia do quadro.
 *
 * Pedido do Bruno: "ele clica em adicionar conteúdo em qualquer dia da semana
 * e tem as opções: vídeo, gêmeo, IA, e um conteúdo pronto seu: suba aqui suas
 * artes e seus vídeos prontos. Não será editado, nada. A IA pode ajudar a
 * fazer a descrição." E às 02h20: o cliente diz do que se trata, a IA pode
 * ler a imagem para ajudar, e a peça pode se repetir toda semana ou todo mês.
 *
 * Uma tela só, de cima para baixo: os arquivos (arrastar ou escolher; várias
 * imagens viram carrossel), as redes do projeto com o lugar em cada uma
 * (feed, reel, story, como a rede chama), a data e a hora, a recorrência e a
 * legenda, com o botão que pede uma à IA a partir do que o cliente contar e
 * do que está escrito na arte.
 *
 * O arquivo é MEDIDO aqui, no navegador, antes de subir um byte: tipo,
 * tamanho, largura, altura e duração. É com isso que as regras de cada rede
 * (lib/posts/conteudo-pronto.ts) dizem, antes de salvar, o que a rede recusa
 * (a rede sai da escolha, com o motivo) e o que ela aceita mas perde (aviso).
 * Nada é reencodado.
 */

export type ContaParaConteudoPronto = {
  id: string;
  platform: string;
  displayName: string | null;
  accountType: string;
};

type ArquivoNaJanela = {
  chave: string;
  file: File;
  medido: ArquivoMedido;
  /** Object URL para a prévia; liberado ao sair. */
  previa: string;
  /** O quadro de abertura do vídeo, em JPEG, para a capa no quadro. */
  poster: Blob | null;
};

const MB = 1024 * 1024;

function paraJpeg(c: HTMLCanvasElement, q = 0.85): Promise<Blob> {
  return new Promise((ok, erro) => c.toBlob((b) => (b ? ok(b) : erro(new Error("não consegui ler a imagem"))), "image/jpeg", q));
}

function canvasDe(fonte: CanvasImageSource, w: number, h: number, max: number): HTMLCanvasElement {
  const s = Math.min(1, max / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  c.getContext("2d")!.drawImage(fonte, 0, 0, c.width, c.height);
  return c;
}

async function medirImagem(f: File): Promise<ArquivoMedido> {
  const bmp = await createImageBitmap(f, { imageOrientation: "from-image" });
  const m = { nome: f.name, mime: f.type, bytes: f.size, largura: bmp.width, altura: bmp.height };
  bmp.close();
  return m;
}

function medirVideo(f: File): Promise<{ medido: ArquivoMedido; poster: Blob | null }> {
  return new Promise((ok, erro) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    const url = URL.createObjectURL(f);
    v.src = url;
    const fim = () => URL.revokeObjectURL(url);
    v.onerror = () => {
      fim();
      erro(new Error("não consegui abrir este vídeo no navegador"));
    };
    v.onloadedmetadata = () => {
      if (!Number.isFinite(v.duration) || v.duration <= 0) {
        fim();
        return erro(new Error("vídeo sem duração"));
      }
      v.currentTime = Math.min(0.5, v.duration / 2);
    };
    v.onseeked = async () => {
      const medido: ArquivoMedido = { nome: f.name, mime: f.type, bytes: f.size, largura: v.videoWidth, altura: v.videoHeight, segundos: v.duration };
      let poster: Blob | null = null;
      try {
        poster = await paraJpeg(canvasDe(v, v.videoWidth, v.videoHeight, 720));
      } catch {
        poster = null;
      }
      fim();
      ok({ medido, poster });
    };
  });
}

/** A primeira lâmina (ou o quadro do vídeo) em JPEG de até 1024 px, base64 puro, para a IA ler. */
async function imagemParaAIA(a: ArquivoNaJanela): Promise<string | null> {
  try {
    const fonte: Blob = a.poster ?? a.file;
    if (!fonte.type.startsWith("image/")) return null;
    const bmp = await createImageBitmap(fonte, { imageOrientation: "from-image" });
    const jpeg = await paraJpeg(canvasDe(bmp, bmp.width, bmp.height, 1024), 0.82);
    bmp.close();
    const bytes = new Uint8Array(await jpeg.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  } catch {
    return null;
  }
}

const chaveDoDestino = (contaId: string, formato: FormatoDeDestino) => `${contaId}@${formato}`;

const OPCOES_DE_RECORRENCIA: Array<{ tipo: TipoDeRecorrencia; rotulo: string }> = [
  { tipo: "nenhuma", rotulo: "Só este dia" },
  { tipo: "semanal", rotulo: "Toda semana" },
  { tipo: "mensal", rotulo: "Todo mês (mesmo dia do mês)" },
];

export function JanelaDoConteudoPronto({
  aberto,
  projectId,
  contas,
  dataInicial,
  onFechar,
  onCriado,
}: {
  aberto: boolean;
  projectId: string;
  /** As contas conectadas do projeto (só as ativas). */
  contas: ContaParaConteudoPronto[];
  /** O dia clicado no quadro, "AAAA-MM-DD". Sem ele, o próximo horário livre. */
  dataInicial?: string | null;
  onFechar: () => void;
  onCriado: (r: { runId: string; postIds: string[]; ocorrencias: number }) => void;
}) {
  const [arquivos, setArquivos] = useState<ArquivoNaJanela[]>([]);
  const [medindo, setMedindo] = useState(false);
  const [destinos, setDestinos] = useState<Set<string>>(new Set());
  const [data, setData] = useState("");
  const [hora, setHora] = useState(HORA_PADRAO);
  const [recorrencia, setRecorrencia] = useState<TipoDeRecorrencia>("nenhuma");
  const [semFim, setSemFim] = useState(true);
  const [ate, setAte] = useState("");
  const [descricao, setDescricao] = useState("");
  const [legenda, setLegenda] = useState("");
  const [pedindoLegenda, setPedindoLegenda] = useState(false);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  // Cada abertura recomeça limpa, no dia clicado (ou no próximo horário
  // livre quando o dia e a hora de sempre já passaram).
  const [abertoAntes, setAbertoAntes] = useState(false);
  if (aberto !== abertoAntes) {
    setAbertoAntes(aberto);
    if (aberto) {
      setArquivos([]);
      setDestinos(new Set());
      setDescricao("");
      setLegenda("");
      setRecorrencia("nenhuma");
      setSemFim(true);
      setAte("");
      setErro(null);
      setSalvando(null);
      const proposto = dataInicial ? deCampos(dataInicial, HORA_PADRAO) : null;
      if (proposto && proposto.getTime() > Date.now() + 2 * 60_000) {
        setData(dataInicial!);
        setHora(HORA_PADRAO);
      } else {
        const livre = paraCampos(proximoHorarioLivre([]));
        setData(livre.data);
        setHora(livre.hora);
      }
    }
  }

  // Libera as prévias ao fechar.
  useEffect(() => {
    if (aberto) return;
    setArquivos((lista) => {
      for (const a of lista) URL.revokeObjectURL(a.previa);
      return [];
    });
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const tecla = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && !salvando) onFechar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aberto, salvando, onFechar]);

  const medidos = useMemo(() => arquivos.map((a) => a.medido), [arquivos]);
  const peca = useMemo(() => (medidos.length ? tipoDaPeca(medidos) : null), [medidos]);
  const tipo: TipoDaPeca | null = peca && "tipo" in peca ? peca.tipo : null;

  /** O veredito de cada conta e lugar, com os arquivos de agora. */
  const vereditos = useMemo(() => {
    const saida = new Map<string, ReturnType<typeof conferirParaRede>>();
    if (!tipo) return saida;
    for (const c of contas) for (const f of formatosDaRede(c.platform)) saida.set(chaveDoDestino(c.id, f), conferirParaRede(c.platform, f, medidos, tipo));
    return saida;
  }, [contas, medidos, tipo]);

  // Com os arquivos mudando, o que ficou bloqueado sai da escolha; e, na
  // primeira leva de arquivos, o feed de cada conta entra marcado.
  const primeiraLeva = useRef(true);
  useEffect(() => {
    if (!tipo) {
      primeiraLeva.current = true;
      return;
    }
    // Decidido FORA do updater: o React em desenvolvimento chama o updater
    // duas vezes, e mexer no ref lá dentro fazia a segunda chamada desmarcar
    // o que a primeira tinha marcado (visto na prova de 06/10).
    const primeira = primeiraLeva.current;
    primeiraLeva.current = false;
    setDestinos((atual) => {
      const novo = new Set<string>();
      if (primeira) {
        for (const c of contas) {
          const v = vereditos.get(chaveDoDestino(c.id, "feed"));
          if (v && v.bloqueios.length === 0) novo.add(chaveDoDestino(c.id, "feed"));
        }
        return novo;
      }
      for (const k of atual) if ((vereditos.get(k)?.bloqueios.length ?? 1) === 0) novo.add(k);
      return novo;
    });
  }, [tipo, vereditos, contas]);

  async function receber(lista: FileList | File[] | null) {
    if (!lista?.length) return;
    setErro(null);
    setMedindo(true);
    const novos: ArquivoNaJanela[] = [];
    const falhas: string[] = [];
    for (const f of Array.from(lista)) {
      const t = tipoDoArquivo(f.type);
      if (!t) {
        falhas.push(`${f.name}: só JPG, PNG, WebP, MP4 ou MOV`);
        continue;
      }
      if (f.size > MAX_BYTES_DO_ARQUIVO) {
        falhas.push(`${f.name}: acima de ${MAX_BYTES_DO_ARQUIVO / MB} MB`);
        continue;
      }
      try {
        if (t === "video") {
          const { medido, poster } = await medirVideo(f);
          novos.push({ chave: `${f.name}-${f.size}-${f.lastModified}`, file: f, medido, previa: URL.createObjectURL(f), poster });
        } else {
          const medido = await medirImagem(f);
          novos.push({ chave: `${f.name}-${f.size}-${f.lastModified}`, file: f, medido, previa: URL.createObjectURL(f), poster: null });
        }
      } catch (e) {
        falhas.push(`${f.name}: ${e instanceof Error ? e.message : "não abriu"}`);
      }
    }
    setMedindo(false);
    if (falhas.length) setErro(falhas.join(" · "));
    if (novos.length) setArquivos((atual) => [...atual, ...novos.filter((n) => !atual.some((a) => a.chave === n.chave))]);
    if (entrada.current) entrada.current.value = "";
  }

  function tirar(chave: string) {
    setArquivos((atual) => {
      const a = atual.find((x) => x.chave === chave);
      if (a) URL.revokeObjectURL(a.previa);
      return atual.filter((x) => x.chave !== chave);
    });
  }

  function alternar(contaId: string, formato: FormatoDeDestino) {
    const k = chaveDoDestino(contaId, formato);
    if ((vereditos.get(k)?.bloqueios.length ?? 1) > 0) return;
    setDestinos((atual) => {
      const novo = new Set(atual);
      if (novo.has(k)) novo.delete(k);
      else novo.add(k);
      return novo;
    });
  }

  const redesMarcadas = useMemo(() => {
    const porConta = new Map(contas.map((c) => [c.id, c.platform]));
    return [...new Set([...destinos].map((k) => porConta.get(k.split("@")[0])).filter((p): p is string => Boolean(p)))];
  }, [destinos, contas]);

  const regraDaSerie: Recorrencia | null = recorrencia === "nenhuma" ? null : { tipo: recorrencia, ate: semFim ? null : ate || null };
  const ocorrencias = useMemo(() => (data && hora ? ocorrenciasDaSerie({ data, hora }, regraDaSerie).length : 1), [data, hora, recorrencia, semFim, ate]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pedirLegenda() {
    if (!descricao.trim()) {
      setErro("Conte em uma ou duas frases o que é este conteúdo: a IA escreve a legenda a partir disso.");
      return;
    }
    setErro(null);
    setPedindoLegenda(true);
    try {
      const imagem = arquivos[0] ? await imagemParaAIA(arquivos[0]) : null;
      const r = await fetch(`/api/projects/${projectId}/conteudo-pronto/legenda`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descricao, tipo, redes: redesMarcadas, arquivos: medidos.map((m) => m.nome), imagem }),
      });
      const j = (await r.json().catch(() => ({}))) as { legenda?: string; error?: string; creditos?: number };
      if (!r.ok || !j.legenda) throw new Error(j.error ?? "A IA não respondeu.");
      setLegenda(j.legenda);
      toast.success(`Legenda pronta${j.creditos ? ` (${j.creditos} créditos)` : ""}. Edite à vontade antes de salvar.`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui pedir a legenda.");
    } finally {
      setPedindoLegenda(false);
    }
  }

  const podeSalvar = Boolean(tipo) && destinos.size > 0 && Boolean(data) && Boolean(hora) && (recorrencia === "nenhuma" || semFim || Boolean(ate)) && !salvando && !medindo;

  async function salvar() {
    if (!tipo || !podeSalvar) return;
    setErro(null);
    const quando = deCampos(data, hora);
    if (Number.isNaN(quando.getTime())) return setErro("Data ou hora inválida.");
    if (quando.getTime() < Date.now() - 60_000) return setErro("A data já passou. Escolha uma data e hora futuras.");
    if (regraDaSerie?.ate && regraDaSerie.ate < data) return setErro("A data fim da série vem antes da primeira saída.");

    const porConta = new Map(contas.map((c) => [c.id, c]));
    const pedidoDeDestinos = [...destinos].map((k) => {
      const [socialAccountId, formato] = k.split("@");
      return { socialAccountId, formato: formato as FormatoDeDestino };
    });
    if (pedidoDeDestinos.some((d) => !porConta.has(d.socialAccountId))) return setErro("Uma das contas marcadas não está mais conectada.");

    try {
      const pasta = `conteudo-pronto/${projectId}`;
      const carimbo = Date.now();
      const subidos: PedidoDeConteudoPronto["arquivos"] = [];
      for (const [i, a] of arquivos.entries()) {
        setSalvando(`Subindo ${a.medido.nome} (${i + 1} de ${arquivos.length})…`);
        const b = await upload(`${pasta}/${carimbo}-${i + 1}-${nomeSeguro(a.medido.nome)}.${extensaoDoMime(a.medido.mime)}`, a.file, {
          access: "public",
          handleUploadUrl: "/api/campanha/material",
          clientPayload: JSON.stringify({ projectId }),
          contentType: a.medido.mime,
          multipart: a.file.size > 50 * MB,
          onUploadProgress: (p) => setSalvando(`Subindo ${a.medido.nome} (${i + 1} de ${arquivos.length}): ${Math.round(p.percentage)}%`),
        });
        subidos.push({ ...a.medido, url: b.url });
      }
      let posterUrl: string | null = null;
      const poster = arquivos[0]?.poster;
      if (tipo === "video" && poster) {
        setSalvando("Guardando o quadro de abertura…");
        const b = await upload(`${pasta}/${carimbo}-capa.jpg`, poster, {
          access: "public",
          handleUploadUrl: "/api/campanha/material",
          clientPayload: JSON.stringify({ projectId }),
          contentType: "image/jpeg",
        }).catch(() => null);
        posterUrl = b?.url ?? null;
      }
      setSalvando("Pondo no quadro…");
      const pedido: PedidoDeConteudoPronto = {
        tipo,
        arquivos: subidos,
        posterUrl,
        destinos: pedidoDeDestinos,
        data,
        hora,
        legenda,
        descricao: descricao.trim() || undefined,
        recorrencia: regraDaSerie,
      };
      const r = await fetch(`/api/projects/${projectId}/conteudo-pronto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pedido),
      });
      const j = (await r.json().catch(() => ({}))) as { runId?: string; postIds?: string[]; ocorrencias?: number; error?: string };
      if (!r.ok || !j.runId || !j.postIds) throw new Error(j.error ?? "Não consegui pôr no quadro.");
      const n = j.ocorrencias ?? 1;
      toast.success(n > 1 ? `No quadro: ${n} datas, ${j.postIds.length} posts, esperando a sua aprovação.` : `No quadro: ${j.postIds.length} post${j.postIds.length > 1 ? "s" : ""}, esperando a sua aprovação.`);
      onCriado({ runId: j.runId, postIds: j.postIds, ocorrencias: n });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "O envio falhou.");
    } finally {
      setSalvando(null);
    }
  }

  const rotuloDaPeca = tipo === "video" ? "Vídeo" : tipo === "carousel" ? `Carrossel de ${arquivos.length} lâminas` : tipo === "image" ? "Imagem" : null;
  const campo = "h-9 rounded-lg border px-3 text-sm outline-none";
  const estiloDoCampo = { background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" } as const;

  return (
    <AnimatePresence>
      {aberto && (
        <motion.div
          key="janela-conteudo-pronto"
          data-janela-conteudo-pronto
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:p-8"
          onClick={(e) => {
            if (e.target === e.currentTarget && !salvando) onFechar();
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.99 }}
            transition={{ duration: 0.2, ease: [0.2, 0.7, 0.3, 1] }}
            role="dialog"
            aria-label="Subir um conteúdo pronto meu"
            className="w-full max-w-[760px] overflow-hidden rounded-2xl border shadow-2xl"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
          >
            <div className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
              <div className="min-w-0">
                <p className="text-[15.5px] font-bold" style={{ color: "var(--text-primary)" }}>
                  Subir um conteúdo pronto meu
                </p>
                <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                  A sua arte ou o seu vídeo, prontos. Nada é editado: entra no quadro como está, e sai nas redes quando você aprovar.
                </p>
              </div>
              <button onClick={onFechar} disabled={Boolean(salvando)} title="Fechar" className="shrink-0 rounded-lg p-1 transition-colors hover:bg-[var(--realce-2)]" style={{ color: "var(--text-muted)" }}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[calc(100vh-14rem)] space-y-5 overflow-y-auto px-5 py-5">
              {/* 1. Os arquivos */}
              <section className="space-y-2">
                <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  1. O arquivo
                  {rotuloDaPeca ? (
                    <span className="ml-2 rounded-md border px-1.5 py-[2px] text-[10.5px] font-bold uppercase tracking-[.03em]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                      {rotuloDaPeca}
                    </span>
                  ) : null}
                </h3>
                <div
                  data-zona-de-arquivos
                  onDragOver={(e) => {
                    e.preventDefault();
                    setArrastando(true);
                  }}
                  onDragLeave={() => setArrastando(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setArrastando(false);
                    void receber(e.dataTransfer.files);
                  }}
                  onClick={() => entrada.current?.click()}
                  className={cn(
                    "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition-colors",
                    arrastando ? "border-orange-500 bg-orange-500/10" : "hover:border-orange-500/50"
                  )}
                  style={{ borderColor: arrastando ? undefined : "var(--border)", background: arrastando ? undefined : "var(--bg-input)" }}
                >
                  {medindo ? <Loader2 className="h-5 w-5 animate-spin text-orange-400" /> : <FileUp className="h-5 w-5 text-orange-400" />}
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    Arraste aqui ou clique para escolher
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Foto JPG, PNG ou WebP (várias viram carrossel) ou um vídeo MP4 ou MOV, até {MAX_BYTES_DO_ARQUIVO / MB} MB.
                  </p>
                  <input ref={entrada} type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" className="hidden" onChange={(e) => void receber(e.target.files)} />
                </div>
                {peca && "erro" in peca && (
                  <p className="flex items-center gap-1.5 text-xs text-red-400">
                    <AlertCircle className="h-3.5 w-3.5" /> {peca.erro}
                  </p>
                )}
                {arquivos.length > 0 && (
                  <ul className="flex flex-wrap gap-2" data-arquivos>
                    {arquivos.map((a, i) => (
                      <li
                        key={a.chave}
                        className="relative h-20 w-20 overflow-hidden rounded-lg border"
                        style={{ borderColor: "var(--border)" }}
                        title={`${a.medido.nome} · ${a.medido.largura}×${a.medido.altura}${a.medido.segundos ? ` · ${Math.round(a.medido.segundos)} s` : ""} · ${(a.medido.bytes / MB).toFixed(1)} MB`}
                      >
                        {a.medido.mime.startsWith("video/") ? (
                          <video src={a.previa} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.previa} alt={a.medido.nome} className="h-full w-full object-cover" />
                        )}
                        <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] font-bold text-white">{i + 1}</span>
                        <button type="button" onClick={() => tirar(a.chave)} aria-label={`Tirar ${a.medido.nome}`} className="absolute right-1 top-1 rounded bg-black/70 p-0.5 text-white hover:bg-red-600">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* 2. As redes e o lugar em cada uma */}
              <section className="space-y-2">
                <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  2. Onde sai
                </h3>
                {contas.length === 0 ? (
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Nenhuma rede conectada neste projeto. Conecte uma em Redes sociais e volte aqui.
                  </p>
                ) : !tipo ? (
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Escolha o arquivo primeiro: é ele que diz o que cada rede aceita.
                  </p>
                ) : (
                  <ul className="space-y-2" data-redes>
                    {contas.map((c) => {
                      const lugares = formatosDaRede(c.platform).map((f) => ({ f, v: vereditos.get(chaveDoDestino(c.id, f)) }));
                      const todosBloqueados = lugares.every((l) => (l.v?.bloqueios.length ?? 1) > 0);
                      return (
                        <li key={c.id} data-rede={c.platform} className={cn("rounded-lg border px-3 py-2", todosBloqueados && "opacity-70")} style={{ borderColor: "var(--border)", background: "var(--bg-input)" }}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                              <RedeIcone plataforma={c.platform} className="h-4 w-4" />
                              {NOMES_DAS_REDES[c.platform] ?? c.platform}
                              {c.displayName && (
                                <span className="font-normal" style={{ color: "var(--text-muted)" }}>
                                  · {c.displayName}
                                  {c.accountType === "organization" ? " (página)" : ""}
                                </span>
                              )}
                            </span>
                            <span className="ml-auto flex flex-wrap gap-1.5">
                              {lugares.map(({ f, v }) => {
                                const k = chaveDoDestino(c.id, f);
                                const bloqueado = (v?.bloqueios.length ?? 1) > 0;
                                const marcado = destinos.has(k);
                                return (
                                  <button
                                    key={f}
                                    type="button"
                                    data-destino={k}
                                    disabled={bloqueado}
                                    aria-pressed={marcado}
                                    onClick={() => alternar(c.id, f)}
                                    title={bloqueado ? v?.bloqueios.join(" ") : marcado ? "Marcado: clique para tirar" : "Clique para marcar"}
                                    className={cn(
                                      "h-7 rounded-md border px-2 text-[11.5px] font-medium transition-all",
                                      marcado ? "border-orange-500 bg-orange-500/10 text-[var(--text-primary)]" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-accent)]",
                                      bloqueado && "cursor-not-allowed line-through opacity-50 hover:border-[var(--border)]"
                                    )}
                                  >
                                    {tipo === "carousel" && f === "feed" && !bloqueado ? "Carrossel" : rotuloDoFormatoNaRede(c.platform, f)}
                                  </button>
                                );
                              })}
                            </span>
                          </div>
                          {/* Os motivos: o bloqueio da rede inteira, e os avisos dos lugares marcados. */}
                          {todosBloqueados && (
                            <p className="mt-1.5 flex items-start gap-1.5 text-[11.5px] text-red-400">
                              <AlertCircle className="mt-[1px] h-3.5 w-3.5 shrink-0" /> {lugares[0]?.v?.bloqueios[0]}
                            </p>
                          )}
                          {lugares
                            .filter(({ f, v }) => destinos.has(chaveDoDestino(c.id, f)) && v && v.avisos.length > 0)
                            .map(({ f, v }) => (
                              <p key={f} className="mt-1.5 flex items-start gap-1.5 text-[11.5px] text-amber-400">
                                <AlertCircle className="mt-[1px] h-3.5 w-3.5 shrink-0" />
                                <span>
                                  <b className="font-semibold">{rotuloDoFormatoNaRede(c.platform, f)}:</b> {v!.avisos.join(" ")}
                                </span>
                              </p>
                            ))}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {/* 3. Quando, e se repete */}
              <section className="space-y-2">
                <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  3. Quando sai
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={campo} style={estiloDoCampo} aria-label="Data" data-data />
                  <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={campo} style={estiloDoCampo} aria-label="Hora" data-hora />
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Horário de Brasília. A peça fica no quadro esperando a sua aprovação; só sai depois dela.
                  </span>
                </div>
                <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }} data-recorrencia>
                  <p className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                    <Repeat className="h-3.5 w-3.5 text-orange-400" />
                    Este conteúdo é só para este dia ou se repete?
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {OPCOES_DE_RECORRENCIA.map((o) => (
                      <button
                        key={o.tipo}
                        type="button"
                        data-recorrencia-tipo={o.tipo}
                        aria-pressed={recorrencia === o.tipo}
                        onClick={() => setRecorrencia(o.tipo)}
                        className={cn(
                          "h-7 rounded-md border px-2 text-[11.5px] font-medium transition-all",
                          recorrencia === o.tipo ? "border-orange-500 bg-orange-500/10 text-[var(--text-primary)]" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-accent)]"
                        )}
                      >
                        {o.rotulo}
                      </button>
                    ))}
                  </div>
                  {recorrencia !== "nenhuma" && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        Até quando?
                      </span>
                      <button
                        type="button"
                        aria-pressed={semFim}
                        onClick={() => setSemFim(true)}
                        className={cn("h-7 rounded-md border px-2 text-[11.5px] font-medium", semFim ? "border-orange-500 bg-orange-500/10 text-[var(--text-primary)]" : "border-[var(--border)] text-[var(--text-muted)]")}
                      >
                        Sem fim (12 meses)
                      </button>
                      <button
                        type="button"
                        aria-pressed={!semFim}
                        onClick={() => setSemFim(false)}
                        className={cn("h-7 rounded-md border px-2 text-[11.5px] font-medium", !semFim ? "border-orange-500 bg-orange-500/10 text-[var(--text-primary)]" : "border-[var(--border)] text-[var(--text-muted)]")}
                      >
                        Até uma data
                      </button>
                      {!semFim && <input type="date" value={ate} min={data} onChange={(e) => setAte(e.target.value)} className={cn(campo, "h-7")} style={estiloDoCampo} aria-label="Data fim" data-ate />}
                      <span className="basis-full text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {fraseDaRecorrencia(regraDaSerie)}: {ocorrencias} {ocorrencias === 1 ? "data" : "datas"} no quadro, cada uma esperando a sua aprovação. A série toda se cancela num clique, no card do Paulo.
                        {semFim ? " Sem fim quer dizer 12 meses: quando chegar lá, é só subir de novo." : ""}
                      </span>
                    </div>
                  )}
                </div>
              </section>

              {/* 4. A legenda */}
              <section className="space-y-2">
                <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  4. A legenda
                </h3>
                <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
                  <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                    Do que se trata? A IA escreve a legenda com isso e com o que está escrito na sua arte.
                  </p>
                  <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-start">
                    <input
                      type="text"
                      value={descricao}
                      onChange={(e) => setDescricao(e.target.value)}
                      data-descricao
                      placeholder='Ex.: "lançamento de um produto digital", "promoção de carta de consórcio", "receita de bolo"'
                      className={cn(campo, "flex-1")}
                      style={estiloDoCampo}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => void pedirLegenda()} loading={pedindoLegenda} disabled={pedindoLegenda || !descricao.trim()} data-pedir-legenda>
                      <Sparkles className="h-3.5 w-3.5" />
                      Pedir à IA uma legenda
                    </Button>
                  </div>
                  <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    Custa o mesmo que um texto da esteira (15 créditos). Subir o conteúdo pronto não gasta crédito.
                  </p>
                </div>
                <textarea
                  value={legenda}
                  onChange={(e) => setLegenda(e.target.value)}
                  rows={5}
                  data-legenda
                  placeholder="A legenda que vai junto com a peça. Escreva a sua, ou peça uma à IA acima e ajuste."
                  className="w-full resize-y rounded-lg border px-3 py-2 text-sm outline-none"
                  style={estiloDoCampo}
                />
              </section>

              {erro && (
                <p className="flex items-start gap-1.5 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-300" role="alert">
                  <AlertCircle className="mt-[1px] h-3.5 w-3.5 shrink-0" /> {erro}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t px-5 py-3.5" style={{ borderColor: "var(--border)" }}>
              <Button variant="outline" onClick={onFechar} disabled={Boolean(salvando)}>
                Cancelar
              </Button>
              <div className="flex items-center gap-3">
                {salvando && (
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {salvando}
                  </span>
                )}
                <Button onClick={() => void salvar()} disabled={!podeSalvar} loading={Boolean(salvando)} data-por-no-quadro>
                  {ocorrencias > 1 ? `Pôr no quadro (${ocorrencias} datas)` : "Pôr no quadro"}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
