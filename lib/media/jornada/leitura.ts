import { lerVideo, type LeituraDoVideo, type RespostaDaMedicao } from "@/lib/media/leitura-do-video";
import { amostrasNoTempoEditado, leituraNoTempoEditado, limitesFinos, type Palavra, type Pedaco } from "@/lib/media/jornada/linha-do-tempo";
import type { AmostraDaJornada } from "@/lib/media/jornada/estado";

/**
 * O PASSO 3 DA JORNADA (E1): a leitura do vídeo ANTES do plano. A medição do
 * worker (rosto, corpo, tela, quadro, a cada ~2 s, sem IA paga) e a visão do
 * Gemini (o que acontece, o que mostra, do que a fala trata) sobre o vídeo
 * ORIGINAL, em trechos finos de 4 a 10 s alinhados às frases. Depois, tudo é
 * levado para o tempo editado (o da fala do completo que o plano usa).
 *
 * O Gemini DESCREVE; ninguém decide aqui. Custo: o mesmo US$ 0,006 a 0,007
 * por minuto da leitura de sempre (o vídeo é o mesmo; muda a granularidade).
 */

export type LeituraDaJornada = { leitura: LeituraDoVideo; amostras: AmostraDaJornada[]; avisos: string[]; custoUsd: number };

export async function lerParaAJornada(p: {
  url: string;
  /** A transcrição do ORIGINAL (tempo da gravação). */
  palavras: Palavra[];
  duracao: number;
  /** Os pedaços mantidos pela limpeza (null: o vídeo inteiro, sem corte). */
  manter: Pedaco[] | null;
  projectId?: string | null;
  /** A prova local manda a medição e a visão já feitas (ou a leitura inteira). */
  medicao?: RespostaDaMedicao | null;
  /** O proxy da visão em bytes (só a prova local). */
  visaoBytes?: Uint8Array | null;
}): Promise<LeituraDaJornada> {
  const avisos: string[] = [];
  let medida: RespostaDaMedicao | null = p.medicao ?? null;
  const limites = limitesFinos(p.palavras, p.duracao);
  const leituraOriginal = await lerVideo({
    url: p.url,
    fala: { palavras: p.palavras, duracao: p.duracao },
    projectId: p.projectId,
    duracao: p.duracao,
    medicao: p.medicao ?? null,
    limites,
    visaoBytes: p.visaoBytes ?? null,
    avisos,
    aoMedir: (m) => (medida = m),
  });
  const leitura = p.manter ? leituraNoTempoEditado(leituraOriginal, p.manter) : leituraOriginal;
  const amostras = amostrasNoTempoEditado(medida?.medida ?? null, p.manter);
  return { leitura, amostras, avisos, custoUsd: leituraOriginal.custoUsd };
}
