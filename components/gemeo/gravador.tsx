"use client";

import { useEffect, useRef, useState } from "react";
import { Circle, Square, RotateCcw, Check, Loader2 } from "lucide-react";

/**
 * GRAVADOR PELO NAVEGADOR (01/10/2026), para a voz e para a autorização do
 * gêmeo digital. MediaRecorder puro, sem biblioteca: o Chrome grava em webm e
 * o Safari em mp4, e o worker converte a voz para MP3 do lado de lá.
 *
 * Mostra a câmera ao vivo quando grava vídeo (a pessoa precisa se ver para
 * ler a frase olhando para a lente), conta o tempo, para sozinho no teto, e
 * deixa ouvir ou ver antes de mandar. Nada sai do navegador antes do
 * "Usar esta gravação".
 */

const TIPOS_DE_VIDEO = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
const TIPOS_DE_AUDIO = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];

function tipoSuportado(lista: string[]): string {
  if (typeof MediaRecorder === "undefined") return "";
  return lista.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

export function Gravador({
  video,
  maxSegundos,
  minSegundos = 0,
  onPronto,
  enviando = false,
  rotulo,
}: {
  video: boolean;
  maxSegundos: number;
  minSegundos?: number;
  onPronto: (arquivo: Blob, segundos: number) => void;
  enviando?: boolean;
  rotulo: string;
}) {
  const [fase, setFase] = useState<"parado" | "pedindo" | "gravando" | "revendo">("parado");
  const [segundos, setSegundos] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [gravado, setGravado] = useState<{ blob: Blob; url: string; segundos: number } | null>(null);
  const aoVivo = useRef<HTMLVideoElement | null>(null);
  const fluxo = useRef<MediaStream | null>(null);
  const gravador = useRef<MediaRecorder | null>(null);
  const inicio = useRef(0);

  function soltarCamera() {
    fluxo.current?.getTracks().forEach((t) => t.stop());
    fluxo.current = null;
  }

  useEffect(() => () => soltarCamera(), []);

  useEffect(() => {
    if (fase !== "gravando") return;
    const t = setInterval(() => {
      const s = Math.floor((Date.now() - inicio.current) / 1000);
      setSegundos(s);
      // Para sozinho no teto (mesma coisa que o botão Parar).
      if (s >= maxSegundos && gravador.current?.state === "recording") gravador.current.stop();
    }, 250);
    return () => clearInterval(t);
  }, [fase, maxSegundos]);

  /**
   * POR QUE NÃO ABRIU, em palavras que levam à saída (01/10). Antes toda falha
   * mandava "liberar no cadeado"; mas quando a política da página bloqueia, o
   * navegador nem pergunta e o cadeado não tem o que liberar: a saída é
   * recarregar. Sem aparelho, a saída é ligar um microfone ou câmera.
   */
  function motivoDaFalha(e: unknown, comVideo: boolean): string {
    const oQue = comVideo ? "a câmera e o microfone" : "o microfone";
    const nome = e instanceof DOMException ? e.name : "";
    const doc = document as Document & {
      permissionsPolicy?: { allowsFeature(f: string): boolean };
      featurePolicy?: { allowsFeature(f: string): boolean };
    };
    const politica = doc.permissionsPolicy ?? doc.featurePolicy;
    const bloqueadoPelaPagina =
      politica && (!politica.allowsFeature("microphone") || (comVideo && !politica.allowsFeature("camera")));
    if (bloqueadoPelaPagina) return `Esta página abriu sem permissão para ${oQue}. Recarregue a página (F5) e tente de novo.`;
    if (nome === "NotFoundError" || nome === "OverconstrainedError")
      return `Não achei ${comVideo ? "câmera ou microfone" : "microfone"} neste aparelho. Conecte um e tente de novo.`;
    if (nome === "NotReadableError")
      return `${comVideo ? "A câmera ou o microfone" : "O microfone"} está em uso por outro programa (reunião, OBS). Feche o outro programa e tente de novo.`;
    return `O navegador recusou ${oQue}. Clique no cadeado ao lado do endereço, libere ${oQue} e tente de novo.`;
  }

  async function comecar() {
    setErro(null);
    setFase("pedindo");
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: video ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });
      fluxo.current = s;
      if (video && aoVivo.current) {
        aoVivo.current.srcObject = s;
        await aoVivo.current.play().catch(() => {});
      }
      const mimeType = tipoSuportado(video ? TIPOS_DE_VIDEO : TIPOS_DE_AUDIO);
      const r = new MediaRecorder(s, mimeType ? { mimeType } : undefined);
      const pedacos: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && pedacos.push(e.data);
      r.onstop = () => {
        const tipo = (r.mimeType || mimeType || (video ? "video/webm" : "audio/webm")).split(";")[0];
        const blob = new Blob(pedacos, { type: tipo });
        const dur = Math.round((Date.now() - inicio.current) / 1000);
        soltarCamera();
        setGravado({ blob, url: URL.createObjectURL(blob), segundos: dur });
        setFase("revendo");
      };
      gravador.current = r;
      inicio.current = Date.now();
      setSegundos(0);
      r.start(1000);
      setFase("gravando");
    } catch (e) {
      soltarCamera();
      setFase("parado");
      setErro(motivoDaFalha(e, video));
    }
  }

  function parar() {
    if (gravador.current?.state === "recording") gravador.current.stop();
  }

  function descartar() {
    if (gravado) URL.revokeObjectURL(gravado.url);
    setGravado(null);
    setFase("parado");
    setSegundos(0);
  }

  const curto = gravado ? gravado.segundos < minSegundos : false;
  const relogio = `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;

  return (
    <div className="flex flex-col gap-3">
      {video && (fase === "gravando" || fase === "pedindo") && (
        <video ref={aoVivo} muted playsInline className="aspect-video w-full max-w-[520px] rounded-lg bg-black object-cover" style={{ transform: "scaleX(-1)" }} />
      )}
      {fase === "revendo" && gravado && (
        video ? (
          <video src={gravado.url} controls playsInline className="aspect-video w-full max-w-[520px] rounded-lg bg-black" />
        ) : (
          <audio src={gravado.url} controls className="w-full max-w-[520px]" />
        )
      )}

      <div className="flex flex-wrap items-center gap-2">
        {fase === "parado" && (
          <button type="button" onClick={() => void comecar()} className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white">
            <Circle className="h-4 w-4 fill-current" /> {rotulo}
          </button>
        )}
        {fase === "pedindo" && (
          <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
            <Loader2 className="h-4 w-4 animate-spin" /> Abrindo {video ? "a câmera" : "o microfone"}...
          </span>
        )}
        {fase === "gravando" && (
          <>
            <button type="button" onClick={parar} className="inline-flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-sm font-semibold text-white">
              <Square className="h-4 w-4 fill-current" /> Parar
            </button>
            <span className="inline-flex items-center gap-1.5 font-mono text-sm" style={{ color: "var(--text-primary)" }}>
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> {relogio}
              <span style={{ color: "var(--text-muted)" }}> de no máximo {Math.floor(maxSegundos / 60)}:{String(maxSegundos % 60).padStart(2, "0")}</span>
            </span>
            {minSegundos > 0 && segundos < minSegundos && (
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                continue até pelo menos {minSegundos} s
              </span>
            )}
          </>
        )}
        {fase === "revendo" && gravado && (
          <>
            <button
              type="button"
              disabled={curto || enviando}
              onClick={() => onPronto(gravado.blob, gravado.segundos)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {enviando ? "Enviando..." : "Usar esta gravação"}
            </button>
            <button
              type="button"
              disabled={enviando}
              onClick={descartar}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
              style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
            >
              <RotateCcw className="h-4 w-4" /> Gravar de novo
            </button>
            {curto && (
              <span className="text-xs text-orange-400">
                Ficou com {gravado.segundos} s. Precisamos de pelo menos {minSegundos} s.
              </span>
            )}
          </>
        )}
      </div>
      {erro && <p className="text-sm text-red-400">{erro}</p>}
    </div>
  );
}
