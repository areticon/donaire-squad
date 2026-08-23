"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VideoUpload } from "@/components/video/video-upload";
import { VideoEspera } from "@/components/video/video-espera";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { ClipApproval, type TrechoComPosts } from "@/components/video/clip-approval";
import { CortesPanel, type Corte } from "@/components/video/cortes-panel";
import {
  estaTrabalhando,
  proximaAcao,
  MAX_TENTATIVAS,
} from "@/lib/media/video-state";

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
  attempts: number;
  temTranscricao: boolean;
  temTrechos: boolean;
  temCortes: boolean;
  completoUrl: string | null;
  completoBytes: number | null;
  rodandoHaSegundos: number | null;
  clips: TrechoComPosts[] | null;
};

/** O que cada estado quer dizer para quem está olhando. */
const ESTADOS: Record<string, { rotulo: string; cor: string }> = {
  uploaded: { rotulo: "Pronto para transcrever", cor: "secondary" },
  transcribing: { rotulo: "Transcrevendo", cor: "warning" },
  cutting: { rotulo: "Cortando os vídeos", cor: "warning" },
  cut: { rotulo: "Cortes prontos", cor: "secondary" },
  transcribed: { rotulo: "Pronto para escolher os trechos", cor: "secondary" },
  selecting: { rotulo: "Escolhendo os trechos", cor: "warning" },
  selected: { rotulo: "Pronto para escrever", cor: "secondary" },
  writing: { rotulo: "Escrevendo os posts", cor: "warning" },
  ready: { rotulo: "Pronto para aprovar", cor: "success" },
  failed: { rotulo: "Falhou", cor: "destructive" },
};

/** De quanto em quanto tempo perguntar ao servidor se algo mudou. */
const INTERVALO_MS = 4000;

type AoVivo = {
  status: string;
  error: string | null;
  attempts: number;
  rodandoHaSegundos: number | null;
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
  const [erroDaAcao, setErroDaAcao] = useState<string | null>(null);
  /**
   * Resultado do preparo do YouTube, por vídeo.
   *
   * Fica separado do aviso geral porque o aviso geral mora no TOPO da página, e
   * o botão fica lá embaixo: o Bruno clicou, a mensagem apareceu fora do campo
   * de visão dele, e a conclusão foi "não aconteceu nada". Retorno de ação
   * precisa nascer ao lado do que foi clicado.
   */
  const [avisoYouTube, setAvisoYouTube] = useState<Record<string, string>>({});

  /**
   * O estado fresco vindo da consulta periódica, por vídeo.
   *
   * Fica separado da lista que veio do servidor porque as duas têm papéis
   * diferentes: a consulta é leve e frequente (só status e tempo), e o
   * `router.refresh()` é caro e só vale a pena quando algo realmente mudou,
   * porque é ele que traz os posts prontos.
   */
  const [aoVivo, setAoVivo] = useState<Record<string, AoVivo>>({});

  const combinados = videos.map((v) => {
    const fresco = aoVivo[v.id];
    return fresco ? { ...v, ...fresco } : v;
  });

  const algumTrabalhando = combinados.some((v) => estaTrabalhando(v.status));

  // Guardado em ref para o efeito de consulta não precisar dele como
  // dependência: incluí-lo faria o intervalo ser desmontado e remontado a cada
  // resposta, e a consulta nunca aconteceria no ritmo pedido.
  const statusConhecidos = useRef<Record<string, string>>({});
  useEffect(() => {
    statusConhecidos.current = Object.fromEntries(
      combinados.map((v) => [v.id, v.status])
    );
  });

  const consultar = useCallback(async () => {
    try {
      const r = await fetch(`/api/videos/status?projectId=${projectId}`, {
        cache: "no-store",
      });
      if (!r.ok) return;
      const { videos: frescos } = (await r.json()) as {
        videos: Array<AoVivo & { id: string }>;
      };

      setAoVivo(
        Object.fromEntries(
          frescos.map((v) => [
            v.id,
            {
              status: v.status,
              error: v.error,
              attempts: v.attempts,
              rodandoHaSegundos: v.rodandoHaSegundos,
            },
          ])
        )
      );

      // Só recarrega do servidor quando um status realmente mudou. Sem esta
      // guarda, seria um `router.refresh()` a cada quatro segundos para sempre,
      // e cada um deles refaz a consulta pesada que traz os posts inteiros.
      const mudou = frescos.some(
        (v) =>
          statusConhecidos.current[v.id] !== undefined &&
          statusConhecidos.current[v.id] !== v.status
      );
      if (mudou) router.refresh();
    } catch {
      // Consulta que falha não vira erro na tela: a próxima tenta de novo em
      // quatro segundos, e piscar "falha de rede" a cada oscilação de sinal
      // assustaria mais do que ajudaria.
    }
  }, [projectId, router]);

  useEffect(() => {
    if (!algumTrabalhando) return;
    // Uma consulta na hora, antes de entrar no ritmo. Sem ela o cronômetro da
    // tela de espera ficaria escondido pelos primeiros quatro segundos, que é
    // justamente quando a pessoa está olhando para ver se aconteceu alguma
    // coisa.
    consultar();
    const t = setInterval(consultar, INTERVALO_MS);
    return () => clearInterval(t);
  }, [algumTrabalhando, consultar]);

  async function executar(videoId: string, rota: string) {
    setRodando(videoId);
    setErroDaAcao(null);

    // Consulta logo depois de disparar, sem esperar o trabalho terminar. É isto
    // que faz a tela entrar em estado de espera na hora: a etapa longa pode
    // levar minutos, e antes o botão ficava girando o tempo todo sem contar
    // nada. A resposta do POST ainda é lida, mas só para mostrar erro imediato.
    const disparo = fetch(`/api/videos/${videoId}/${rota}`, { method: "POST" });
    setTimeout(consultar, 400);

    try {
      const r = await disparo;
      if (!r.ok) {
        const corpo = await r.json().catch(() => ({}));
        setErroDaAcao(corpo.error ?? `A plataforma recusou com código ${r.status}.`);
      }
    } catch {
      // A requisição pode cair antes de a etapa longa terminar (rede, aba
      // trocada, proxy impaciente). Isso não quer dizer que o trabalho parou:
      // quem sabe o estado de verdade é o banco, e a consulta periódica vai
      // contar. Por isso aqui não se declara falha.
    } finally {
      setRodando(null);
      consultar();
      router.refresh();
    }
  }

  async function prepararYouTube(videoId: string) {
    setRodando(`yt-${videoId}`);
    setAvisoYouTube((a) => ({ ...a, [videoId]: "" }));
    try {
      const r = await fetch(`/api/videos/${videoId}/youtube`, { method: "POST" });
      const corpo = await r.json().catch(() => ({}));
      const mensagem = !r.ok
        ? (corpo.error ?? `A plataforma recusou com código ${r.status}.`)
        : corpo.criado
          ? "Rascunho criado. Abra o quadro de Posts para revisar e publicar."
          : "Esta gravação já tinha um rascunho, e ele está no quadro de Posts.";
      setAvisoYouTube((a) => ({ ...a, [videoId]: mensagem }));
      if (r.ok) router.refresh();
    } catch {
      setAvisoYouTube((a) => ({
        ...a,
        [videoId]: "A requisição não completou. Recarregue e veja se o rascunho apareceu.",
      }));
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

      {erroDaAcao && (
        <p
          className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-4 py-3 text-sm text-orange-300"
          role="alert"
        >
          {erroDaAcao}
        </p>
      )}

      {combinados.length > 0 && (
        <div>
          <h2
            className="text-sm font-semibold mb-3"
            style={{ color: "var(--text-muted)" }}
          >
            Enviados
          </h2>
          <div className="space-y-2">
            {combinados.map((v) => {
              const estado = ESTADOS[v.status] ?? {
                rotulo: v.status,
                cor: "secondary",
              };
              const paraAprovar = (v.clips ?? []).filter(
                (c) => c.posts || c.erro
              );
              const acao = proximaAcao(v);
              const trabalhando = estaTrabalhando(v.status);
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
                    {v.status === "failed" && v.attempts >= MAX_TENTATIVAS && (
                      <p className="text-sm text-orange-400 mt-1">
                        Esta etapa já falhou {v.attempts} vezes. Repetir de novo
                        provavelmente falharia igual, então o botão saiu do ar de
                        propósito. Fale com o suporte.
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge variant={estado.cor as never}>{estado.rotulo}</Badge>
                    {acao && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={rodando === v.id}
                        onClick={() => executar(v.id, acao.rota)}
                      >
                        {rodando === v.id ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Começando
                          </>
                        ) : (
                          acao.rotulo
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                {/* A entrega: a gravação editada e os cortes, com as escolhas
                    de publicação. Aparece em "cut" e continua aparecendo depois,
                    porque o cliente volta para rever o que marcou. */}
                {(v.status === "cut" || (v.status === "ready" && v.temCortes)) && (
                  <div className="pl-4">
                    <CortesPanel
                      videoId={v.id}
                      projectId={projectId}
                      cortes={(v.clips as unknown as Corte[]) ?? []}
                      completo={{
                        url: v.completoUrl,
                        bytes: v.completoBytes,
                        duracaoSec: v.durationSec,
                      }}
                    />
                  </div>
                )}

                {trabalhando && (
                  <div className="pl-4">
                    <VideoEspera
                      status={v.status as "transcribing" | "selecting" | "writing"}
                      rodandoHaSegundos={v.rodandoHaSegundos}
                    />
                  </div>
                )}

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

                    {/* A gravação inteira, para o canal do cliente. Os trechos
                        escolhidos viram capítulos, que é o mesmo trabalho de
                        seleção aproveitado de outra forma. Fica separado dos
                        trechos porque é UM envio por gravação, não um por
                        trecho: o arquivo tem centenas de megabytes. */}
                    <div
                      className="rounded-xl border p-4 flex items-center justify-between gap-4"
                      style={{
                        background: "var(--bg-surface)",
                        borderColor: "var(--border)",
                      }}
                    >
                      <div className="min-w-0">
                        <p
                          className="text-sm font-medium"
                          style={{ color: "var(--text-primary)" }}
                        >
                          Publicar a gravação no seu canal do YouTube
                        </p>
                        <p
                          className="text-xs mt-0.5"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Vai inteira, com os {paraAprovar.length} momentos
                          escolhidos virando capítulos. Cria um rascunho para
                          você revisar e publicar no quadro de posts.
                        </p>
                      </div>
                      <div className="shrink-0 text-right space-y-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={rodando === `yt-${v.id}`}
                          onClick={() => prepararYouTube(v.id)}
                        >
                          {rodando === `yt-${v.id}` ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Preparando
                            </>
                          ) : (
                            "Preparar para o YouTube"
                          )}
                        </Button>
                        {avisoYouTube[v.id] && (
                          <p
                            className="text-xs max-w-[16rem]"
                            style={{ color: "var(--text-muted)" }}
                            role="status"
                          >
                            {avisoYouTube[v.id]}
                          </p>
                        )}
                      </div>
                    </div>
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
