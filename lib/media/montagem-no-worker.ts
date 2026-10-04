import { assinarCorpo, CABECALHO_ASSINATURA } from "@/lib/media/worker-token";

/**
 * O PRAZO DE UMA MONTAGEM NO WORKER, visto do app (04/10/2026).
 *
 * Em 04/10 os dois cortes e o completo de cmurtv2zg caíram em "sem-montagem":
 * uma montagem pendurou no worker por 14 h e a fila de montagem (uma por vez)
 * parou atrás dela. O app esperava um prazo FIXO (90 min no corte, 120 no
 * completo), desistia do sob medida, mandava a reserva para a MESMA fila
 * parada e, três prazos depois, desistia da reserva também.
 *
 * Agora: o worker tem prazo por trabalho (worker/src/index.mjs,
 * `prazoDaMontagem`) e devolve o erro pelo callback; o app espera o prazo do
 * worker mais a fila, proporcional à duração, e, passado ele, PERGUNTA ao
 * worker (`/vivo` com a chave) antes de dar a montagem por morta: rodando ou
 * esperando a vez na fila não é morta, até o teto.
 */

/** A mesma conta do worker: 20 min fixos mais 6 s por segundo de vídeo no final (3 na prévia). */
export function prazoDoWorkerMs(duracaoSeg: number | null | undefined, final: boolean): number {
  const dur = Number(duracaoSeg) > 0 ? Number(duracaoSeg) : 1200;
  return Math.round((20 * 60 + dur * (final ? 6 : 3)) * 1000);
}

/** A espera na fila do worker que o app tolera sem perguntar (um completo inteiro pode estar na frente). */
const FOLGA_DA_FILA_MS = 45 * 60_000;
/** Passado isto desde o envio, desiste mesmo com o worker dizendo que ainda roda ou espera. */
export const TETO_DA_ESPERA_MS = 6 * 3600_000;

/** O prazo do app para o callback de uma montagem: o do worker mais a fila. */
export function prazoDaMontagemMs(duracaoSeg: number | null | undefined, final: boolean): number {
  return prazoDoWorkerMs(duracaoSeg, final) + FOLGA_DA_FILA_MS;
}

export type MontagemNoWorker = "rodando" | "na-fila" | "ausente" | "desconhecido";

/** Pergunta ao worker pela montagem desta chave: rodando, na fila ou ausente. Assinado como todo pedido ao worker. */
export async function montagemNoWorker(videoJobId: string, chave: string | null | undefined): Promise<MontagemNoWorker> {
  const base = process.env.VIDEO_WORKER_URL;
  if (!base || !chave) return "desconhecido";
  const corpo = JSON.stringify({ videoJobId, chave });
  try {
    const r = await fetch(`${base.replace(/\/$/, "")}/vivo`, {
      method: "POST",
      headers: { "Content-Type": "application/json", [CABECALHO_ASSINATURA]: assinarCorpo(corpo) },
      body: corpo,
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return "desconhecido";
    const j = (await r.json().catch(() => ({}))) as { vivo?: boolean; naFila?: boolean };
    if (j.vivo) return "rodando";
    if (j.naFila) return "na-fila";
    return "ausente";
  } catch {
    return "desconhecido";
  }
}

/**
 * Passado o prazo, ainda vale esperar? Só se o worker diz que a montagem roda
 * ou espera a vez, e antes do teto. Worker fora do ar ou sem resposta: não
 * espera (o caminho de sempre, reenvio ou reserva, decide).
 */
export async function aindaEsperaOWorker(videoJobId: string, chave: string | null | undefined, idadeMs: number): Promise<boolean> {
  if (idadeMs > TETO_DA_ESPERA_MS) return false;
  const estado = await montagemNoWorker(videoJobId, chave);
  return estado === "rodando" || estado === "na-fila";
}
