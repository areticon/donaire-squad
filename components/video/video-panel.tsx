"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VideoUpload } from "@/components/video/video-upload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { ClipApproval, type TrechoComPosts } from "@/components/video/clip-approval";

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
  clips: TrechoComPosts[] | null;
};

/**
 * O que cada status quer dizer para quem está esperando, e qual é a próxima
 * ação. O fluxo é encadeado a mão de propósito enquanto não existe fila: cada
 * etapa é uma chamada cara e demorada, e juntar tudo numa requisição só
 * estouraria o maxDuration da Vercel.
 */
const ACOES: Record<string, { rotulo: string; rota: string } | undefined> = {
  uploaded: { rotulo: "Transcrever", rota: "transcribe" },
  selecting: { rotulo: "Escolher os trechos", rota: "select" },
  writing: { rotulo: "Escrever os posts", rota: "write" },
  failed: { rotulo: "Tentar de novo", rota: "transcribe" },
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
  const [rodando, setRodando] = useState<string | null>(null);

  async function executar(videoId: string, rota: string) {
    setRodando(videoId);
    try {
      await fetch(`/api/videos/${videoId}/${rota}`, { method: "POST" });
      router.refresh();
    } finally {
      setRodando(null);
    }
  }

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
              const paraAprovar = (v.clips ?? []).filter(
                (c) => c.posts || c.erro
              );
              return (
                <div key={v.id} className="space-y-3">
                <div
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
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge variant={estado.cor as never}>{estado.rotulo}</Badge>
                    {ACOES[v.status] && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={rodando === v.id}
                        onClick={() => executar(v.id, ACOES[v.status]!.rota)}
                      >
                        {rodando === v.id ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Rodando
                          </>
                        ) : (
                          ACOES[v.status]!.rotulo
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Os posts prontos ficam sob o vídeo que os gerou, e não em
                    uma tela separada, porque o cliente precisa lembrar de qual
                    momento da gravação cada texto saiu para julgar se ficou
                    fiel ao que ele quis dizer. */}
                {v.status === "ready" && paraAprovar.length > 0 && (
                  <div className="pl-4 space-y-3">
                    <p
                      className="text-sm"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {paraAprovar.filter((c) => c.posts).length} trechos viraram
                      post. Edite o que quiser antes de aprovar.
                    </p>
                    {paraAprovar.map((c, i) => (
                      <ClipApproval
                        key={`${v.id}-${i}`}
                        videoId={v.id}
                        index={(v.clips ?? []).indexOf(c)}
                        trecho={c}
                        onAprovado={() => router.refresh()}
                      />
                    ))}
                  </div>
                )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
