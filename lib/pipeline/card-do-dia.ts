/**
 * O CARD DO DIA NA NOVA TENTATIVA DA FILA (08/10/2026).
 *
 * O caso: na campanha do Igor de 07/10 cada dia falhou três vezes, e cada
 * tentativa gravou de novo o card de pesquisa do Roberto. O quadro ficou com
 * 15 cards de pesquisa iguais (5 dias x 3 tentativas). A causa é geral, não do
 * Igor: o dia é refeito do zero a cada tentativa da fila (exceção, função morta
 * no teto de tempo, revisão que caiu), e `saveCard` sempre CRIAVA. A memória
 * de "card do Roberto já salvo" era um Set em memória, que zera a cada
 * tentativa, porque cada uma roda numa função diferente.
 *
 * A regra: o card de um agente num dia é UM. A tentativa nova reaproveita o
 * card da anterior (mesma execução, mesmo dia, mesmo agente, mesmo tipo de
 * card e mesma rede, nas adaptações) e escreve por cima, em vez de criar outro.
 *
 * Puro, sem banco: `saveCard` (lib/pipeline/executar.ts) lê os candidatos e
 * pergunta aqui qual serve.
 */

export type CardCandidato = {
  id: string;
  scheduledDate: Date | null;
  metadata: unknown;
};

/**
 * Meia semana: a data do card não é exata entre tentativas (dia no passado vira
 * "agora + 10 min" na hora em que roda), mas o mesmo dia da semana numa
 * campanha de duas semanas fica sete dias adiante. Menos de 3,5 dias de
 * distância é o mesmo dia; mais é a outra semana.
 */
export const JANELA_DO_MESMO_DIA_MS = 3.5 * 86_400_000;

/** A rede da adaptação (Instagram, Facebook, TikTok) gravada no card, ou null. */
export function redeDoCard(metadata: unknown): string | null {
  const r = (metadata as { rede?: unknown } | null | undefined)?.rede;
  return typeof r === "string" && r ? r : null;
}

/**
 * O card da tentativa anterior que esta tentativa deve reaproveitar, ou null
 * para criar um novo. Os candidatos já vêm filtrados por execução, dia da
 * semana, agente e tipo de card; aqui se confere a semana e a rede.
 */
export function cardParaReaproveitar(
  candidatos: CardCandidato[],
  novo: { scheduledDate?: Date | null; metadata?: unknown }
): CardCandidato | null {
  const rede = redeDoCard(novo.metadata);
  const quando = novo.scheduledDate?.getTime() ?? null;
  const mesmos = candidatos.filter((c) => {
    if (redeDoCard(c.metadata) !== rede) return false;
    const antes = c.scheduledDate?.getTime() ?? null;
    if (quando === null || antes === null) return quando === antes;
    return Math.abs(quando - antes) < JANELA_DO_MESMO_DIA_MS;
  });
  // O mais antigo é o que o quadro mostra desde a primeira tentativa: é ele
  // que continua. Se já existem duplicados (campanha de antes desta regra),
  // eles ficam como estão; só não nasce mais nenhum.
  return mesmos[0] ?? null;
}

/** As peças deste dia já viraram post numa tentativa anterior? (mesma janela de data) */
export function diaJaEntregue(postsDoDia: Array<{ scheduledAt: Date | null }>, scheduledDate: Date): boolean {
  return postsDoDia.some((p) => p.scheduledAt && Math.abs(p.scheduledAt.getTime() - scheduledDate.getTime()) < JANELA_DO_MESMO_DIA_MS);
}
