/**
 * QUAIS CARDS PERTENCEM A UMA PEÇA DO CALENDÁRIO, quando duas campanhas
 * caem no mesmo dia.
 *
 * Relato do Bruno em 21/09, na segunda campanha do dia: "gerou de novo um
 * post no dia 21 com a mesma imagem de outro, já nasceu com a tarja
 * rejeitado". Medido: a campanha nova criou cinco posts no dia 21 às 21:36; a
 * campanha anterior tinha cinco posts no mesmo dia às 14:09, reprovados pelo
 * Bruno horas antes, com os oito cards do dia marcados como reprovados.
 *
 * O calendário separava as duas PEÇAS pela hora, mas escolhia os CARDS de
 * cada peça só pelo dia da campanha (`dayOfWeek === 1`), e os dois runs têm
 * dia 1. A peça nova pegava o card de publicação da campanha antiga (que era
 * quem dizia "rejeitado") e o card de mídia dela (que era a imagem repetida).
 *
 * A regra que faltava é uma só: **card de uma campanha não fala por peça de
 * outra.** Quando os posts do grupo têm `runId`, os cards precisam ser do
 * mesmo run. Quando não têm (corte de vídeo, post levado de outra rede, peça
 * antiga sem run), o filtro cai no que sempre foi: só o dia.
 *
 * Fica num módulo, e não solto no componente, porque o componente tem 4.500
 * linhas e a regra tem cinco: aqui ela tem prova.
 */

export interface CardParaPeca {
  runId: string;
  dayOfWeek: number;
}

export interface PostParaPeca {
  runId?: string | null;
  dayOfWeek?: number | null;
}

/**
 * A CHAVE DE UMA PEÇA no calendário: família, campanha e hora.
 *
 * Até 21/09 a chave era só família e hora, e duas campanhas para a mesma
 * semana caíam na mesma peça quando publicavam no mesmo horário (09:00). Os
 * cinco rascunhos da campanha nova do dia 22 sumiram DENTRO da peça agendada
 * da campanha anterior: uma peça com nove destinos dizendo "agendado", e o
 * Bruno lendo que o squad não tinha entregado nada.
 *
 * Post sem run (corte de vídeo, peça antiga) fica com a campanha vazia, e
 * continua se agrupando com os iguais a ele, como sempre foi.
 */
export function chaveDaPeca(familia: string, runId: string | null | undefined, horaIso: string): string {
  return `${familia}@${runId ?? ""}@${horaIso}`;
}

/** A família de uma chave montada por `chaveDaPeca`. */
export function familiaDaChave(chave: string): string {
  return chave.split("@")[0];
}

/** Os runs de que os posts da peça vêm. Vazio quando nenhum post sabe o run dele. */
export function runsDaPeca(posts: PostParaPeca[]): Set<string> {
  return new Set(posts.map((p) => p.runId).filter((r): r is string => typeof r === "string" && r.length > 0));
}

/**
 * Os cards que valem para esta peça: do mesmo dia da campanha E, quando a
 * peça sabe de que campanha veio, da mesma campanha.
 */
export function cardsDaPeca<C extends CardParaPeca>(cardsDoDia: C[], posts: PostParaPeca[]): C[] {
  const diaDeOrigem = posts[0]?.dayOfWeek ?? null;
  const runs = runsDaPeca(posts);
  return cardsDoDia.filter((c) => {
    if (diaDeOrigem != null && c.dayOfWeek !== diaDeOrigem) return false;
    if (runs.size > 0 && !runs.has(c.runId)) return false;
    return true;
  });
}
