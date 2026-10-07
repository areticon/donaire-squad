import { MAX_TENTATIVAS, MORTE, etapaDeRetomada } from "@/lib/media/video-state";
import type { PassoDoPiloto } from "@/lib/media/piloto-do-servidor";

/**
 * A FALHA EXPLÍCITA DO VÍDEO (08/10/2026): a etapa que gravou "failed" com o
 * motivo (o worker devolveu ok:false, a seleção, o roteiro, a redação, o
 * worker recusou o corte com 503 durante um deploy).
 *
 * Até aqui ninguém no servidor tentava de novo: o vigia só olha etapa de
 * trabalho que passou do prazo, e a única nova tentativa automática morava na
 * aba aberta do cliente (components/video/esteira-do-video.tsx, a primeira
 * falha). Com a aba fechada, o vídeo ficava parado esperando um clique, e a
 * equipe não sabia de nada.
 *
 * A regra agora, decidida aqui (puro, sem banco) e executada pelo vigia
 * (`vigiarFalhas`, lib/media/vigia-das-etapas.ts):
 *
 *   1. a PRIMEIRA falha ganha uma nova tentativa pelo servidor, um minuto
 *      depois (a aba, se estiver aberta, repete na hora; o minuto evita os
 *      dois repetirem juntos, e a rota é atômica de qualquer jeito);
 *   2. a SEGUNDA falha não repete: a equipe recebe o e-mail com o motivo
 *      técnico, e o cliente o aviso com o código (observador do sino);
 *   3. erro que não melhora com nova tentativa (saldo do cliente, gravação sem
 *      trecho aproveitável, a desistência do vigia, que já avisou) fica como
 *      está.
 *
 * "Primeira" e "segunda" são medidas por `attempts`, que cada rota soma ao
 * tomar a etapa e zera ao terminar bem: falha com attempts < 2 é a primeira.
 */

/** O servidor espera isto depois da falha antes de repetir: a aba aberta repete na hora. */
export const ESPERA_DA_FALHA_S = 60;
/** Falha mais velha que isto não é repetida nem avisada: é registro esquecido, e não incidente. */
export const JANELA_DA_FALHA_S = 24 * 3600;
/** Por quanto tempo a nova tentativa despachada conta como "o servidor está tentando" para o sino. */
export const RETOMADA_EM_ANDAMENTO_S = 5 * 60;

/** O passo do piloto que retoma cada etapa (o mesmo que o vigia usa no prazo). */
export const PASSO_DA_ETAPA: Record<ReturnType<typeof etapaDeRetomada>, PassoDoPiloto> = {
  transcribe: "transcrever",
  select: "selecionar",
  roteiro: "roteiro",
  cortar: "cortar",
  write: "preparar",
};

/** Erros que não melhoram repetindo. */
const NAO_REPETE: RegExp[] = [
  // O saldo e o teto são do cliente: repetir só recusa de novo.
  /saldo insuficiente/i,
  /cr[eé]ditos que a sua equipe liberou/i,
  /cr[eé]ditos da equipe/i,
  /que a sua equipe liberou para voc[eê]/i,
  // Gravação sem trecho aproveitável: a primeira parte já foi devolvida, e repetir cobraria de novo.
  /nenhum trecho aproveit[aá]vel/i,
  /n[aã]o devolveu nenhum trecho/i,
  // A desistência do vigia (três paradas): ele mesmo já avisou a equipe.
  /parou tr[eê]s vezes nos nossos servidores/i,
];

/** Esta falha melhora com uma nova tentativa? */
export function falhaQueRepete(erro: string | null | undefined): boolean {
  if (!erro) return true;
  if ((Object.values(MORTE) as string[]).includes(erro)) return false;
  return !NAO_REPETE.some((r) => r.test(erro));
}

/** O que o servidor já fez com uma falha, guardado em `retomadas.falhaExplicita`. */
export type FalhaTratada = {
  /** O `updatedAt` (ISO) da falha tratada: uma falha nova tem outra marca. */
  marca?: string;
  acao?: "retomada" | "avisada";
  em?: string;
};

export type FalhaParaDecidir = {
  status: string;
  attempts: number;
  error: string | null;
  updatedAt: Date;
  temTranscricao: boolean;
  temTrechos: boolean;
  temCortes: boolean;
  roteiroPendente: boolean;
  tratada: FalhaTratada | null;
};

export type DecisaoDaFalha =
  | { acao: "retomar"; marca: string; etapa: ReturnType<typeof etapaDeRetomada>; passo: PassoDoPiloto }
  | { acao: "avisar-equipe"; marca: string; etapa: ReturnType<typeof etapaDeRetomada> }
  | { acao: "nada"; porque: string };

export function decidirFalhaExplicita(v: FalhaParaDecidir, agora = new Date()): DecisaoDaFalha {
  if (v.status !== "failed") return { acao: "nada", porque: "não está em falha" };
  const idadeS = (agora.getTime() - v.updatedAt.getTime()) / 1000;
  if (idadeS < ESPERA_DA_FALHA_S) return { acao: "nada", porque: "esperando a aba repetir primeiro" };
  if (idadeS > JANELA_DA_FALHA_S) return { acao: "nada", porque: "falha antiga" };
  if (!falhaQueRepete(v.error)) return { acao: "nada", porque: "erro que não melhora repetindo" };
  const marca = v.updatedAt.toISOString();
  if (v.tratada?.marca === marca) return { acao: "nada", porque: "esta falha já foi tratada" };
  const etapa = etapaDeRetomada(v);
  if (v.attempts < 2 && v.attempts < MAX_TENTATIVAS) return { acao: "retomar", marca, etapa, passo: PASSO_DA_ETAPA[etapa] };
  return { acao: "avisar-equipe", marca, etapa };
}

/**
 * O servidor está repetindo esta falha agora? O sino não avisa "parou" do que
 * vai voltar a andar em segundos (estado que sobrevive ao fato).
 */
export function servidorRepetindo(v: { status: string; updatedAt: Date; attempts: number; error: string | null; tratada: FalhaTratada | null }, agora = new Date()): boolean {
  if (v.status !== "failed") return false;
  const marca = v.updatedAt.toISOString();
  const t = v.tratada;
  if (t?.marca === marca) {
    return t.acao === "retomada" && Boolean(t.em) && agora.getTime() - new Date(t.em!).getTime() < RETOMADA_EM_ANDAMENTO_S * 1000;
  }
  // Ainda não tratada, mas vai ser: primeira falha recente de erro que repete.
  // Só por alguns minutos: se o vigia não conseguiu despachar até lá, ninguém
  // está repetindo, e o cliente precisa saber.
  const idadeS = (agora.getTime() - v.updatedAt.getTime()) / 1000;
  return v.attempts < 2 && idadeS <= ESPERA_DA_FALHA_S + 3 * 60 && falhaQueRepete(v.error);
}
