import type { Trecho } from "@/lib/media/select-clips";
import type { Word } from "@/lib/media/transcribe";
import type { RoteiroDoVideo } from "@/lib/media/roteiro-em-texto";
import { montarPedidoDeCorte } from "@/lib/media/pedido-de-corte";
import { montagemDoCompletoLigada } from "@/lib/media/montagem-do-completo";
import { assinarCorpo, CABECALHO_ASSINATURA } from "@/lib/media/worker-token";

/**
 * O PEDIDO SÓ DO VÍDEO COMPLETO ao worker (`soCompleto`), num lugar só
 * (08/10). Era montado dentro de app/api/videos/[id]/refazer-completo; o
 * controle do corte no completo (lib/media/controle-do-completo-servidor.ts)
 * manda o mesmo pedido, e duas cópias divergem (a lição de pedido-de-corte.ts).
 *
 * - As remoções do completo são as do corte do cliente quando ele existe
 *   (`roteiro.completoDoCliente`); senão, a limpeza aprovada no roteiro.
 * - Com a montagem do completo ligada, os trechos vão VAZIOS: o worker não
 *   olha trecho nenhum no `soCompleto`, e cada trecho no pedido pagaria uma
 *   escolha de efeitos ao modelo (`escolherEfeitos`) que não muda nada no
 *   completo. Sem a montagem, eles ainda dão as frases de destaque da base.
 */

export type VideoParaOCompleto = {
  id: string;
  blobUrl: string;
  durationSec: number | null;
  projectId: string;
  clips: unknown;
  transcript: unknown;
  project: { videoStyle: string | null; videoMusicUrl: string | null; videoTerms: string | null; videoEstiloEscolha: unknown; colorPalette: string | null } | null;
};

export async function corpoDoSoCompleto(video: VideoParaOCompleto, roteiro: RoteiroDoVideo | null, appUrl: string): Promise<string> {
  // O corte do cliente vale sempre que existe; com ele, a limpeza guardada é
  // reaproveitada mesmo sem aprovação (rodá-la de novo pagaria IA para nada:
  // o completo sai com a lista do cliente).
  const doCliente = roteiro?.completoDoCliente?.remocoes?.length ? roteiro.completoDoCliente.remocoes : null;
  const aprovado = roteiro?.aprovadoEm || (doCliente && roteiro?.limpezaFeita) ? roteiro : null;
  const { corpo } = await montarPedidoDeCorte(
    {
      id: video.id,
      blobUrl: video.blobUrl,
      durationSec: video.durationSec ?? 0,
      projectId: video.projectId,
      trechos: montagemDoCompletoLigada() ? [] : ((video.clips as Trecho[] | null) ?? []),
      palavras: (video.transcript as { words?: Word[] } | null)?.words ?? [],
      estilo: video.project?.videoStyle ?? null,
      musicaUrl: video.project?.videoMusicUrl ?? null,
      termos: video.project?.videoTerms ?? null,
      escolha: video.project?.videoEstiloEscolha ?? null,
      colorPalette: video.project?.colorPalette ?? null,
      remocoesProntas: aprovado ? aprovado.remocoes : null,
      retomadasNasProntas: Boolean(aprovado?.retomadasFeitas),
      remocoesDoCompleto: doCliente,
    },
    { appUrl }
  );
  const pedido = JSON.parse(corpo) as Record<string, unknown>;
  pedido.soCompleto = true;
  return JSON.stringify(pedido);
}

/** Manda o pedido ao worker. Lança com a mensagem do worker quando ele recusa. */
export async function enviarSoOCompleto(texto: string): Promise<void> {
  const base = process.env.VIDEO_WORKER_URL;
  if (!base) throw new Error("O worker de vídeo não está configurado.");
  const r = await fetch(`${base.replace(/\/$/, "")}/cortar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", [CABECALHO_ASSINATURA]: assinarCorpo(texto) },
    body: texto,
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`worker respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
}
