/**
 * O CICLO EM QUE ESTAMOS, e não o último que alguém gravou (30/09).
 *
 * Mora sozinho desde 01/10 (acesso de equipe): o teto de cada membro conta o
 * gasto dele no MESMO ciclo da conta do dono, e lib/credits e
 * lib/limites-do-plano precisam da mesma regra sem um importar o outro.
 *
 * `creditsResetAt` é reposto pelo webhook do Stripe (mensal) e pelo cron de
 * reposição (anual, a cada 30 dias). Se um dos dois falhar uma vez, a data fica
 * velha, e até 30/09 a contagem seguia somando desde ela: o cliente esgotava a
 * cota em outubro e ficava preso até alguém notar, com a tela prometendo uma
 * data de liberação que já tinha passado. Avançar em passos de 30 dias a partir
 * da última reposição é a MESMA regra do cron, só que aplicada na leitura.
 */
const TRINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;

export function cicloAtual(creditsResetAt: Date | null, agora = new Date()): { inicio: Date; renovaEm: string | null } {
  if (!creditsResetAt) {
    // Sem reposicao registrada, o mes corrente e o palpite honesto: e o que
    // acontece com quem nunca renovou, ou seja quem esta no primeiro ciclo.
    return { inicio: new Date(agora.getFullYear(), agora.getMonth(), 1), renovaEm: null };
  }
  const passos = Math.max(0, Math.floor((agora.getTime() - creditsResetAt.getTime()) / TRINTA_DIAS_MS));
  const inicio = new Date(creditsResetAt.getTime() + passos * TRINTA_DIAS_MS);
  return { inicio, renovaEm: new Date(inicio.getTime() + TRINTA_DIAS_MS).toISOString() };
}
