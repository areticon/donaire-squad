/**
 * A PEÇA QUE SAIU SEM A REVISÃO DA VERA (08/10/2026).
 *
 * A revisão do dia da campanha tenta o JEV e cai no Claude; quando os dois
 * falham, o erro subia e a fila refazia o dia inteiro (texto e arte pagos de
 * novo), e na terceira vez o dia sumia. Agora o dia segue: as peças vão ao
 * quadro com `metadata.naoRevisado`, o card da Vera abre com o aviso abaixo, e
 * a tela pede para conferir antes de aprovar.
 *
 * Puro, sem banco: o motor (lib/pipeline/executar.ts) e a tela leem daqui.
 */

/**
 * O que fica no lugar do parecer quando ninguém revisou. Sem "VEREDITO:" e sem
 * a palavra de reprovação de propósito: o leitor do parecer não pode achar
 * nele um veredito que não existiu.
 */
export const PARECER_SEM_REVISAO = "Não revisado: a revisão deste dia não rodou. Confira o texto e a arte antes de aprovar.";

/** A primeira linha do card da Vera no dia sem revisão. */
export const AVISO_DE_NAO_REVISADO = "⚠ NÃO REVISADO: a revisão da Vera não rodou neste dia. As peças estão no quadro sem a conferência dela; confira o texto e a arte antes de aprovar.";

/**
 * O fecho do card da Vera no dia sem revisão (revisão de 08/10). A tela lê o
 * ÚLTIMO "VEREDITO:" do card (lib/squad/veredito.ts). Quando a revisão que caiu
 * é a da volta, o card guarda a reprovação da primeira, e sem este fecho a
 * peça já corrigida aparecia como "reprovado pela Vera", o que o Bruno recusou
 * em 19/09. Este marcador não é um veredito conhecido: a tela lê "sem veredito".
 */
export const FECHO_SEM_REVISAO = "VEREDITO: NAO_REVISADO";

/** A peça (ou o card) saiu sem revisão? */
export function naoRevisado(metadata: unknown): boolean {
  return (metadata as { naoRevisado?: unknown } | null | undefined)?.naoRevisado === true;
}
