import type { VideoDoGemeo } from "@/lib/media/gemeo";

/**
 * A REGRA DO "CANCELAR ESTE VÍDEO" (05/10/2026), sem banco.
 *
 * Nasceu do relato do Bruno: gerou um vídeo do gêmeo, gerou outro com um
 * treino melhor, e o primeiro ficou parado em "Etapa 8 de 17: O roteiro espera
 * a sua aprovação" sem jeito de sair da faixa. O "dispensar" só existia para o
 * vídeo que FALHOU; o que espera o cliente ou está andando não tinha porta.
 *
 * Módulo PURO: a faixa (componente de cliente) lê o texto da confirmação daqui,
 * e o servidor (`cancelar-video.ts`) lê as decisões. Nada aqui toca o banco.
 *
 * O que vale, em uma frase cada:
 *   - cancela o que espera o cliente, o que está andando e, desde 06/10, o
 *     pronto (as peças que não foram ao ar saem do quadro; publicado e
 *     agendado ficam);
 *   - o que já foi gerado é descartado, e o que estava rodando no worker ou no
 *     gerador termina sozinho e é descartado na chegada (os callbacks ignoram
 *     o vídeo cancelado);
 *   - créditos: SÓ o que a régua atual já devolve. A gravação não ganha estorno
 *     novo (a primeira parte foi entregue; a segunda, se aprovada, segue a
 *     regra da aprovação). O gêmeo segue as regras que já existem: tudo volta
 *     se nada começou (`cancelarVideoDoGemeo`), e a reserva é acertada pelo
 *     que já foi falado (o mesmo acerto do passo do cron).
 */

/** O status terminal do VideoJob cancelado pelo cliente. */
export const STATUS_CANCELADO = "cancelado";

/** O prefixo do id da linha do gêmeo gravando na faixa (linha-do-tempo-servidor.ts). */
export const PREFIXO_DO_GEMEO = "gemeo-";

/** O texto da confirmação, igual na faixa e na resposta do servidor. */
export const TEXTO_DA_CONFIRMACAO = "Cancelar este vídeo? O que já foi gerado é descartado e os créditos ainda não gastos não são cobrados.";

/** Posts que já foram ao ar (ou estão indo): o cancelamento não mexe neles. */
export const POSTS_NO_AR = ["published", "publishing", "scheduled"] as const;

/** Estados da montagem (cortes e completo) em que algo está rodando. */
export const MONTAGEM_ANDANDO = ["na-fila", "preparando", "dirigindo", "ilustrando", "gerando", "montando"] as const;

/** Etapas em que o WORKER está com um pedido deste vídeo nas mãos. */
const NO_WORKER = new Set(["transcribing", "cutting"]);

/** Estados antes da aprovação do roteiro: só a primeira parte foi cobrada. */
const ANTES_DA_APROVACAO = new Set(["uploaded", "transcribing", "transcribed", "selecting", "selected", "roteirizando", "roteiro"]);

export type Veredicto = { pode: true } | { pode: false; status: 404 | 409; motivo: string };

/** O id do vídeo do gêmeo quando a linha da faixa é dele ("gemeo-<id>"). */
export function idDoGemeoNaFaixa(id: string): string | null {
  return id.startsWith(PREFIXO_DO_GEMEO) && id.length > PREFIXO_DO_GEMEO.length ? id.slice(PREFIXO_DO_GEMEO.length) : null;
}

/**
 * O PRONTO TAMBÉM SE CANCELA (06/10, tarde): até aqui o vídeo pronto só tinha
 * o X "tirar da lista", que some da tela e volta ao recarregar, com as peças
 * paradas no quadro. Agora cancelar o pronto tira do quadro o que ainda não
 * foi ao ar; o que já foi publicado ou está agendado continua (para tirar um
 * agendado, arquive o card dele), e nada é devolvido nem cobrado.
 */
export const TEXTO_DA_CONFIRMACAO_PRONTO =
  "Cancelar este vídeo pronto? As peças dele que ainda não foram publicadas saem do quadro. O que já foi publicado ou está agendado continua, e nada mais é cobrado.";

/** O vídeo está pronto (peças no quadro) e nada mais roda nele. */
export function videoPronto(v: { status: string; finishedAt: Date | string | null; edicaoAndando: boolean }): boolean {
  return v.status === "ready" && Boolean(v.finishedAt) && !v.edicaoAndando;
}

/** A confirmação certa para o cartão: a do pronto, ou a de sempre. */
export function textoDaConfirmacao(pronto: boolean): string {
  return pronto ? TEXTO_DA_CONFIRMACAO_PRONTO : TEXTO_DA_CONFIRMACAO;
}

/**
 * Dá para cancelar esta gravação? O que espera o cliente (roteiro), o que
 * está andando e o pronto (06/10), sim. O que falhou também: cancelar é mais
 * forte que dispensar (fecha o quadro) e a pessoa pode preferir. Só o já
 * cancelado, não.
 */
export function podeCancelarGravacao(v: { status: string; finishedAt: Date | string | null; edicaoAndando: boolean }): Veredicto {
  if (v.status === STATUS_CANCELADO) return { pode: false, status: 409, motivo: "Este vídeo já foi cancelado." };
  return { pode: true };
}

/**
 * O aviso de que algo ainda está rodando fora daqui e vai terminar sozinho.
 * Nulo quando não há nada no worker nem no gerador.
 */
export function avisoDoQueTerminaSozinho(v: { status: string; edicaoAndando: boolean }): string | null {
  if (NO_WORKER.has(v.status)) {
    return v.status === "transcribing"
      ? "A transcrição que já estava em andamento termina sozinha e é descartada quando chegar."
      : "O corte que já estava sendo feito nos nossos servidores termina sozinho e é descartado quando chegar.";
  }
  if (v.edicaoAndando) return "A montagem que já estava sendo feita termina sozinha e é descartada quando chegar.";
  return null;
}

/** O que acontece com os créditos desta gravação, dito com todas as letras. */
export function creditosDaGravacaoCancelada(v: { status: string; creditsCharged: number }): string {
  if (v.creditsCharged <= 0) return "Nada foi cobrado por este vídeo.";
  if (ANTES_DA_APROVACAO.has(v.status)) {
    return "A primeira parte (transcrição, escolha dos cortes e roteiro) já foi feita e fica cobrada. A segunda parte, da edição, não é cobrada.";
  }
  return "O que já foi cobrado fica como está; nada mais é cobrado deste vídeo.";
}

/** O registro gravado no vídeo cancelado, para quem ler o banco depois. */
export function registroDoCancelamento(quem: string | null, quando = new Date()): string {
  const data = quando.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return `Cancelado ${quem ? `por ${quem}` : "pelo cliente"} em ${data}.`;
}

// ─────────────────────────────── o gêmeo ───────────────────────────────

/** Dá para cancelar este vídeo do gêmeo? Só o que ainda está gravando. */
export function podeCancelarGemeo(v: Pick<VideoDoGemeo, "estado">): Veredicto {
  if (v.estado === "cancelada") return { pode: false, status: 409, motivo: "Este vídeo já foi cancelado." };
  if (v.estado === "falhou") return { pode: false, status: 409, motivo: "Este vídeo já parou; os créditos dele já voltaram." };
  if (v.estado === "na-esteira") return { pode: false, status: 409, motivo: "Este vídeo já entrou na edição: cancele a gravação na faixa." };
  return { pode: true };
}

/** Nada foi pedido a fornecedor ainda: é o caso que `cancelarVideoDoGemeo` já cobre, com tudo de volta. */
export function gemeoNaoComecou(v: Pick<VideoDoGemeo, "estado" | "pedacos">): boolean {
  return v.estado === "na-fila" && !(v.pedacos ?? []).some((p) => p.audioUrl || p.requestId);
}

/**
 * O ACERTO DA RESERVA no cancelamento, pela MESMA regra do passo do cron
 * (gemeo-passo.ts, "cobra o tempo real da fala, devolve o resto"): o que já
 * foi falado fica cobrado, o resto da reserva volta. Depois do acerto feito
 * pelo passo não há mais o que devolver. Nunca devolve mais do que a reserva.
 */
export function acertoDaReservaNoCancelamento(
  v: Pick<VideoDoGemeo, "creditosReservados" | "creditosCobrados" | "pedacos" | "gerador">,
  creditosDoGemeo: (segundos: number, gerador: NonNullable<VideoDoGemeo["gerador"]>) => number
): { segundosFalados: number; devido: number; volta: number } {
  const segundosFalados = Math.round((v.pedacos ?? []).reduce((s, p) => s + (p.segundos ?? 0), 0) * 10) / 10;
  if (v.creditosCobrados != null) return { segundosFalados, devido: v.creditosCobrados, volta: 0 };
  const devido = Math.min(v.creditosReservados, creditosDoGemeo(segundosFalados, v.gerador ?? "omnihuman"));
  return { segundosFalados, devido, volta: Math.max(0, v.creditosReservados - devido) };
}

/** O que já foi gerado e vai para o lixo: as falas, os pedaços e o vídeo juntado que não virou gravação. */
export function midiasDoGemeoParaApagar(v: Pick<VideoDoGemeo, "pedacos" | "finalUrl" | "videoJobId">): string[] {
  const urls: Array<string | null | undefined> = [];
  for (const p of v.pedacos ?? []) urls.push(p.audioUrl, p.videoUrl);
  if (v.finalUrl && !v.videoJobId) urls.push(v.finalUrl);
  return [...new Set(urls.filter((u): u is string => typeof u === "string" && u.length > 0))];
}

/** O aviso para o gêmeo: o gerador não tem botão de parar. */
export function avisoDoGemeoQueTerminaSozinho(v: Pick<VideoDoGemeo, "estado">): string | null {
  if (v.estado === "gerando" || v.estado === "falando") return "O pedaço que o gerador já estava fazendo termina sozinho e é descartado quando chegar.";
  if (v.estado === "juntando") return "A junção que já estava em andamento termina sozinha e é descartada quando chegar.";
  return null;
}
