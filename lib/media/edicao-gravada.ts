import { bordasDoCorte } from "@/lib/media/bordas-do-corte";
import { prisma } from "@/lib/db/prisma";
import type { Word } from "@/lib/media/transcribe";
import { detectarPausas, emendarNoSilencio, intervalosDoTrecho } from "@/lib/media/edicao";
import {
  detectarFalsosComecos,
  detectarMuletasArrastadas,
  detectarRepeticoes,
  unirRemocoes,
  vetarRemocoesLongasDeFala,
} from "@/lib/media/limpeza";
import { defeitosDoTextoFinal, textoFinalDoCorte, type TextoFinal } from "@/lib/media/texto-final-do-corte";

/**
 * A edição que o worker recebeu para cada trecho, guardada no próprio trecho.
 *
 * Existe para a Vera ler o que foi AO AR, e não a transcrição bruta. Em 29/09
 * o corte de Moisés saiu com "a forma mais inteligente que tem é / então tanto
 * pro seu time" (a limpeza por IA tirou "você, é delegar, né"), e a Vera
 * aprovou porque leu a fala inteira, que estava certa. As remoções da limpeza
 * por IA só existem na hora do pedido; sem guardá-las, ninguém depois consegue
 * saber o que o espectador ouve.
 *
 * Grava só `inicio` e `manter` (no tempo do corte), que é exatamente o que o
 * worker emenda. Um trecho por vez, direto no jsonb, porque `clips` é escrito
 * por várias rotas ao mesmo tempo (mesmo cuidado de `fundirNoTrecho`).
 */
export type EdicaoDoTrecho = {
  inicio: number;
  fim: number;
  manter: Array<{ de: number; ate: number }>;
  em: string;
};

export async function gravarEdicaoDosTrechos(
  videoJobId: string,
  trechos: Array<{ indice: number; inicio: number; fim: number; manter: Array<{ de: number; ate: number }> }>
): Promise<void> {
  const em = new Date().toISOString();
  for (const t of trechos) {
    const json = JSON.stringify({ inicio: t.inicio, fim: t.fim, manter: t.manter, em } satisfies EdicaoDoTrecho);
    await prisma.$executeRaw`
      UPDATE video_jobs
      SET clips = jsonb_set(clips, ARRAY[${String(t.indice)}, 'edicao']::text[], ${json}::jsonb, true)
      WHERE id = ${videoJobId} AND jsonb_typeof(clips -> ${t.indice}::int) = 'object'`.catch((e) =>
      // Falhar aqui não derruba o corte: a Vera cai na reconstrução sem IA.
      console.error(`[edicao-gravada][${videoJobId}] gravar edição do trecho ${t.indice} falhou:`, e)
    );
  }
}

/** Lê os trechos do corpo do pedido (o mesmo JSON que vai ao worker) e grava. */
export async function gravarEdicaoDoPedido(videoJobId: string, corpo: string): Promise<void> {
  const pedido = JSON.parse(corpo) as {
    trechos?: Array<{ indice: number; inicio: number; fim: number; manter: Array<{ de: number; ate: number }> }>;
  };
  await gravarEdicaoDosTrechos(videoJobId, pedido.trechos ?? []);
}

/**
 * O texto final do corte e os defeitos mecânicos dele.
 *
 * Com a edição gravada (e das MESMAS bordas do trecho), usa ela. Sem, refaz a
 * edição sem a limpeza por IA: pausas, repetição, falso começo e muleta, que
 * são determinísticos e custam zero. É a melhor aproximação possível do que
 * foi ao ar quando o pedido é anterior a esta gravação.
 */
export function textoFinalParaRevisao(
  palavras: Word[],
  trecho: { inicio: number; fim: number; emPausa?: boolean; edicao?: EdicaoDoTrecho | null },
  duracaoSec: number
): TextoFinal & { defeitos: string[]; inicio: number; fim: number; fonte: "gravada" | "reconstruida" } {
  // As MESMAS bordas do pedido ao worker (no silêncio, desde 30/09). Com o
  // arredondamento antigo aqui, a Vera não reconhecia a edição gravada,
  // reconstruía o corte com as bordas velhas e reprovava um defeito que o
  // vídeo já não tinha.
  const { inicio, fim } = bordasDoCorte(trecho, palavras);
  const e = trecho.edicao;
  if (e && Math.abs(e.inicio - inicio) < 0.01 && Math.abs(e.fim - fim) < 0.01 && e.manter?.length) {
    return {
      ...textoFinalDoCorte(palavras, e.inicio, e.manter),
      defeitos: defeitosDoTextoFinal(palavras, e.inicio, e.fim, e.manter),
      inicio,
      fim,
      fonte: "gravada",
    };
  }
  const janela = palavras.filter((w) => w.end > inicio - 30 && w.start < fim + 30);
  const pausas = detectarPausas(janela, duracaoSec);
  const remocoes = emendarNoSilencio(
    vetarRemocoesLongasDeFala(
      unirRemocoes(
        unirRemocoes(unirRemocoes(pausas, detectarFalsosComecos(janela)), detectarMuletasArrastadas(janela)),
        detectarRepeticoes(janela)
      ),
      janela,
      pausas
    ),
    janela
  );
  const manter = intervalosDoTrecho(remocoes, inicio, fim, janela);
  const final = textoFinalDoCorte(janela, inicio, manter);
  // Os índices voltam para a lista inteira, que é a que a Vera numera.
  const deslocamento = palavras.indexOf(janela[0]);
  return {
    ...final,
    indices: final.indices.map((i) => i + Math.max(0, deslocamento)),
    defeitos: defeitosDoTextoFinal(janela, inicio, fim, manter),
    inicio,
    fim,
    fonte: "reconstruida",
  };
}
