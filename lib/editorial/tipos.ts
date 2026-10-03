/**
 * Os tipos da linha editorial, sem banco: a tela (cliente) importa daqui, e
 * nunca de linha-editorial.ts, que toca o Prisma.
 */

export type PapelDaCena = "gancho" | "desenvolvimento" | "fechamento";

export type CenaDoRoteiro = {
  id: string;
  papel: PapelDaCena;
  /** O que a pessoa diz. */
  fala: string;
  /** O que aparece na tela nessa cena. */
  naTela: string;
};

/**
 * De onde veio a ideia (01/10). Queixa do Bruno: "pedi para gerar novas e ele
 * repetiu as mesmas, é como se tivesse um banco de dados limitado". Desde
 * então cada rodada mistura origens, e o cliente vê a origem em cada ideia.
 */
export type OrigemDaIdeia = "radar" | "x" | "pesquisa" | "curiosidade" | "publico" | "documento" | "padrao" | "tendencia";

export const ROTULO_DA_ORIGEM: Record<OrigemDaIdeia, string> = {
  radar: "do radar da semana",
  x: "conversa no X",
  pesquisa: "pesquisa",
  curiosidade: "curiosidade e datas",
  publico: "pergunta do público",
  documento: "do seu documento",
  padrao: "padrão de referência",
  // 02/10: a sugestão de uma tendência da semana levada para a linha (lib/referencias/tendencias.ts).
  tendencia: "tendência da semana",
};

/**
 * O que vem guardado no campo `fonte` (JSON) do roteiro. Os campos novos de
 * 01/10 moram aqui para a Fase A sair sem migração: `gancho` da tabela
 * continua sendo o "por que agora", e a primeira frase do vídeo é `abertura`.
 */
export type FonteDaIdeia = {
  titulo?: string;
  url?: string;
  origem?: OrigemDaIdeia;
  /** O recorte específico desta ideia (o que ela diz que as outras não dizem). */
  angulo?: string;
  /** O gancho: a primeira frase do vídeo, do jeito que a pessoa fala. */
  abertura?: string;
  /** O item do radar ou da pesquisa que originou a ideia. */
  itemId?: string;
  /** A rodada em que a ideia nasceu (para marcar "nova" na tela). */
  rodada?: number;
};

export type RoteiroNaTela = {
  id: string;
  status: "ideia" | "pronto" | "gravado" | "descartada";
  titulo: string;
  gancho: string | null;
  fonte: FonteDaIdeia | null;
  tese: string | null;
  cenas: CenaDoRoteiro[];
  duracao: number;
  createdAt: string;
};

/**
 * Quantos segundos a fala de uma cena leva, pela régua de 2,4 palavras por
 * segundo medida em 22/09 (lib/media/roteiro-do-video.ts). Mora aqui também
 * porque a tela recalcula enquanto o cliente edita, sem ir ao servidor.
 */
export function segundosDaFala(fala: string): number {
  const palavras = fala.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(palavras / 2.4));
}
