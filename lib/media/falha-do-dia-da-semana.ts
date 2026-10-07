/**
 * O DIA DA SEMANA DO VÍDEO QUE FALHOU (08/10/2026).
 *
 * `escreverSemanaDoVideo` grava o dia que não saiu como um card "AVISO:" com
 * `metadata.falha`. Até aqui esse card contava como "dia já escrito": toda
 * rodada seguinte da esteira pulava o dia, e o card prometia "A esteira tenta
 * de novo sozinha", o que nada fazia. O dia ficava com o aviso para sempre.
 *
 * A regra nova: o dia com falha é tentado de novo de verdade, até um teto, por
 * um passo do cron (lib/media/retomar-semana-do-video.ts) e por qualquer
 * rodada da esteira. Cada falha soma uma tentativa em `metadata.tentativasDoDia`.
 * No teto, o dia para de ser tentado, a equipe recebe o e-mail e o cliente o
 * código. O texto do card diz só o que de fato vai acontecer.
 *
 * Puro, sem banco.
 */

/** Quantas vezes o dia é escrito antes de parar e chamar a equipe. */
export const TETO_DE_TENTATIVAS_DO_DIA = 3;

/** Quanto o cron espera depois de uma falha antes de tentar o dia de novo. */
export const ESPERA_DA_NOVA_TENTATIVA_MIN = 5;

type MetaDoCard = { falha?: unknown; tentativasDoDia?: unknown } | null | undefined;

/** Quantas tentativas já falharam neste dia. Card de antes desta regra (só `falha`) conta como uma. */
export function tentativasDoDia(metadata: unknown): number {
  const m = metadata as MetaDoCard;
  if (!m?.falha) return 0;
  const n = Number(m.tentativasDoDia);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

/** O card é de um dia que falhou e ainda vai ser tentado de novo? */
export function diaPorTentarDeNovo(metadata: unknown): boolean {
  const n = tentativasDoDia(metadata);
  return n > 0 && n < TETO_DE_TENTATIVAS_DO_DIA;
}

/**
 * O dia já está escrito (e a esteira o pula)? Um card com post, ou com texto
 * de verdade. O card de espera ("Lucas está escrevendo...") não conta, e o
 * AVISO de um dia que ainda vai ser tentado também não: senão ninguém tenta.
 * O AVISO do dia que bateu no teto conta como escrito: ele fica como está.
 */
export function diaJaEscrito(cards: Array<{ postId: string | null; content: string | null; metadata: unknown }>, espera: RegExp): boolean {
  return cards.some((c) => c.postId || (c.content && !espera.test(c.content.trim()) && !diaPorTentarDeNovo(c.metadata)));
}

/** O texto do card do dia que falhou, sem o erro técnico (ele fica em `metadata.falha`, para a equipe). */
export function textoDoAvisoDoDia(p: { rotulo: string; dia: string; tentativas: number; codigo: string; postJaCriado?: boolean }): string {
  // A falha DEPOIS do post (revisão de 08/10, o card que não gravou no banco):
  // a peça existe, e tentar de novo a duplicaria. Nem "não consegui montar",
  // nem "três tentativas": o que houve de verdade.
  if (p.postJaCriado) {
    return `AVISO: ${p.rotulo} de ${p.dia} foi criado, mas não terminou de ser montado no quadro. Não tentamos de novo sozinhos para não duplicar a peça, e a equipe já foi avisada. Se faltar algo, abra um chamado com o código ${p.codigo}.`;
  }
  if (p.tentativas >= TETO_DE_TENTATIVAS_DO_DIA) {
    return `AVISO: não consegui montar ${p.rotulo} de ${p.dia} depois de ${TETO_DE_TENTATIVAS_DO_DIA} tentativas. Paramos de tentar sozinhos e a equipe já foi avisada com o motivo. O resto da semana não depende deste dia; se quiser esta peça, abra um chamado com o código ${p.codigo}.`;
  }
  return `AVISO: não consegui montar ${p.rotulo} de ${p.dia} desta vez. A esteira tenta de novo sozinha em cerca de ${ESPERA_DA_NOVA_TENTATIVA_MIN} minutos (tentativa ${p.tentativas} de ${TETO_DE_TENTATIVAS_DO_DIA}).`;
}
