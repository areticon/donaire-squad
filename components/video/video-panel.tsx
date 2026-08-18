"use client";

import { useRouter } from "next/navigation";
import { VideoUpload } from "@/components/video/video-upload";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

/**
 * A tela do produto de vídeo.
 *
 * Antes disto, upload e transcrição existiam no back-end e eram inalcançáveis
 * pelo usuário: metade do fluxo construído e invisível.
 */

type Video = {
  id: string;
  status: string;
  originalName: string | null;
  durationSec: number | null;
  error: string | null;
  creditsCharged: number;
  createdAt: string;
};

/** O que cada status quer dizer para quem está esperando. */
const ESTADOS: Record<string, { rotulo: string; cor: string }> = {
  uploaded: { rotulo: "Na fila", cor: "secondary" },
  transcribing: { rotulo: "Transcrevendo", cor: "warning" },
  selecting: { rotulo: "Escolhendo os melhores trechos", cor: "warning" },
  writing: { rotulo: "Escrevendo os posts", cor: "warning" },
  ready: { rotulo: "Pronto para aprovar", cor: "success" },
  failed: { rotulo: "Falhou", cor: "destructive" },
};

export function VideoPanel({
  projectId,
  videos,
}: {
  projectId: string;
  videos: Video[];
}) {
  const router = useRouter();

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1
          className="text-3xl font-black"
          style={{ color: "var(--text-primary)" }}
        >
          Vídeo da semana
        </h1>
        <p className="mt-1" style={{ color: "var(--text-muted)" }}>
          Grave uma vez por semana. O squad transforma em conteúdo para todas as
          redes.
        </p>
      </div>

      <VideoUpload projectId={projectId} onEnviado={() => router.refresh()} />

      {videos.length > 0 && (
        <div>
          <h2
            className="text-sm font-semibold mb-3"
            style={{ color: "var(--text-muted)" }}
          >
            Enviados
          </h2>
          <div className="space-y-2">
            {videos.map((v) => {
              const estado = ESTADOS[v.status] ?? {
                rotulo: v.status,
                cor: "secondary",
              };
              return (
                <div
                  key={v.id}
                  className="rounded-xl border p-4 flex items-center justify-between gap-4"
                  style={{
                    background: "var(--bg-surface)",
                    borderColor: "var(--border)",
                  }}
                >
                  <div className="min-w-0">
                    <p
                      className="font-medium truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {v.originalName ?? "Vídeo sem nome"}
                    </p>
                    <p
                      className="text-sm mt-0.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {formatDate(v.createdAt)}
                      {v.durationSec
                        ? `, ${Math.round(v.durationSec / 60)} min`
                        : ""}
                      {v.creditsCharged > 0
                        ? `, ${v.creditsCharged} créditos`
                        : ""}
                    </p>
                    {v.error && (
                      <p className="text-sm text-orange-400 mt-1">{v.error}</p>
                    )}
                  </div>
                  <Badge variant={estado.cor as never}>{estado.rotulo}</Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
