"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, Video, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  MB_POR_MINUTO_RECOMENDADO,
  TIPOS_ACEITOS,
  validarVideo,
  type Veredito,
} from "@/lib/media/limits";

/**
 * Envio do vídeo semanal.
 *
 * A validação acontece no navegador, antes de subir um byte, porque é o único
 * lugar onde a duração e o tamanho já são conhecidos e ainda dá tempo de
 * recusar. Deixar a pessoa esperar 45 minutos de upload para descobrir que o
 * arquivo não serve seria a pior experiência possível, e é exatamente o que
 * aconteceria com a taxa de gravação padrão do OBS.
 *
 * O arquivo não passa pela nossa função: o navegador envia direto para o
 * storage. Função serverless tem limite de corpo na casa das dezenas de
 * megabytes, e um vídeo de 20 minutos passa de 1 GB.
 */

type Arquivo = { file: File; duracao: number; veredito: Veredito };

async function lerDuracao(file: File): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement("video");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(el.src);
      resolve(el.duration);
    };
    el.onerror = () => {
      URL.revokeObjectURL(el.src);
      resolve(0);
    };
    el.src = URL.createObjectURL(file);
  });
}

export function VideoUpload({
  projectId,
  onEnviado,
}: {
  projectId: string;
  onEnviado?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<Arquivo | null>(null);
  const [lendo, setLendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  async function escolher(file: File) {
    setErro(null);
    setPronto(false);
    setLendo(true);
    const duracao = await lerDuracao(file);
    setArquivo({ file, duracao, veredito: validarVideo(file.size, duracao) });
    setLendo(false);
  }

  async function enviar() {
    if (!arquivo || !arquivo.veredito.ok) return;
    setEnviando(true);
    setErro(null);
    setProgresso(0);
    try {
      const blob = await upload(`videos/${projectId}/${arquivo.file.name}`, arquivo.file, {
        // Privado de propósito: vídeo cru do cliente é material não publicado e
        // não pode ficar alcançável por quem tiver a URL.
        access: "private",
        // Recomendado acima de 100 MB: divide em partes, sobe em paralelo e
        // repete só a parte que falhar, em vez de perder o upload inteiro.
        multipart: true,
        handleUploadUrl: "/api/videos/upload",
        clientPayload: JSON.stringify({ projectId }),
        onUploadProgress: (p) => setProgresso(Math.round(p.percentage)),
      });

      // Em desenvolvimento o callback do storage não alcança o localhost, então
      // o registro também é exposto aqui. A rota é idempotente.
      await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          blobUrl: blob.url,
          originalName: arquivo.file.name,
          sizeBytes: arquivo.file.size,
        }),
      });

      setPronto(true);
      setArquivo(null);
      onEnviado?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao enviar o vídeo.");
    } finally {
      setEnviando(false);
    }
  }

  const v = arquivo?.veredito;

  return (
    <div
      className="rounded-xl border p-6"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div className="flex items-start gap-3 mb-5">
        <Video className="w-5 h-5 text-orange-400 mt-0.5 shrink-0" />
        <div>
          <h2 className="font-bold text-[var(--text-primary)]">
            Envie a gravação da semana
          </h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Fale do jeito que você falaria com um cliente. O squad transcreve,
            escolhe os melhores trechos e escreve o conteúdo de cada rede.
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={TIPOS_ACEITOS.join(",")}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void escolher(f);
        }}
      />

      {!arquivo && !pronto && (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={lendo}
          className="w-full rounded-xl border border-dashed p-8 text-center transition-colors hover:border-orange-500/40"
          style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}
        >
          {lendo ? (
            <span className="inline-flex items-center gap-2 text-[var(--text-muted)]">
              <Loader2 className="w-4 h-4 animate-spin" />
              Lendo o arquivo
            </span>
          ) : (
            <>
              <Upload className="w-6 h-6 mx-auto mb-2 text-[var(--text-muted)]" />
              <span className="block text-[var(--text-primary)] font-medium">
                Escolher vídeo
              </span>
              <span className="block text-sm text-[var(--text-muted)] mt-1">
                MP4, MOV, MKV ou WebM. Até 60 minutos.
              </span>
            </>
          )}
        </button>
      )}

      {pronto && (
        <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-5 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-[var(--text-primary)] font-medium">
              Vídeo recebido. O squad já começou.
            </p>
            <button
              onClick={() => {
                setPronto(false);
                inputRef.current?.click();
              }}
              className="text-sm text-orange-400 mt-1 hover:underline"
            >
              Enviar outro
            </button>
          </div>
        </div>
      )}

      {arquivo && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div
            className="rounded-xl border p-4 mb-4"
            style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}
          >
            <p className="text-[var(--text-primary)] font-medium truncate">
              {arquivo.file.name}
            </p>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {Math.round(arquivo.duracao / 60)} min,{" "}
              {(arquivo.file.size / 1048576).toFixed(0)} MB
            </p>
          </div>

          {v && !v.ok && (
            <div className="rounded-xl border border-orange-500/25 bg-orange-500/10 p-4 mb-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-orange-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[var(--text-primary)] font-medium">{v.motivo}</p>
                {v.dica && (
                  <p className="text-sm text-[var(--text-muted)] mt-1">{v.dica}</p>
                )}
              </div>
            </div>
          )}

          {v && v.ok && (
            <div
              className="rounded-xl border p-4 mb-4"
              style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}
            >
              <p className="text-sm text-[var(--text-muted)]">
                Esse trabalho vai custar{" "}
                <strong className="text-[var(--text-primary)]">
                  {v.creditos} créditos
                </strong>{" "}
                e render cerca de{" "}
                <strong className="text-[var(--text-primary)]">
                  {(v.creditos - Math.ceil(arquivo.duracao / 60) * 2) / 4} trechos
                </strong>
                , cada um virando post nas três redes.
              </p>
            </div>
          )}

          {enviando && (
            <div className="mb-4">
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ background: "var(--bg-primary)" }}
              >
                <div
                  className="h-full bg-orange-500 transition-all"
                  style={{ width: `${progresso}%` }}
                />
              </div>
              <p className="text-sm text-[var(--text-muted)] mt-2">
                Enviando, {progresso}%
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <Button onClick={enviar} disabled={!v?.ok || enviando}>
              {enviando ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Enviando
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Enviar para o squad
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setArquivo(null);
                setErro(null);
              }}
              disabled={enviando}
            >
              Escolher outro
            </Button>
          </div>
        </motion.div>
      )}

      {erro && <p className="text-sm text-orange-400 mt-4">{erro}</p>}

      <p className="text-xs text-[var(--text-muted)] mt-5">
        Dica que economiza o seu tempo: grave a 4 Mbps (
        {MB_POR_MINUTO_RECOMENDADO} MB por minuto). No OBS é Configurações,
        Saída, Taxa de bits do vídeo, 4000 Kbps. Para alguém falando na frente da
        câmera a imagem é a mesma, e o arquivo sobe em segundos em vez de
        minutos.
      </p>
    </div>
  );
}
