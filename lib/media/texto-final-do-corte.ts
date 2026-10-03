import type { Word } from "@/lib/media/transcribe";

/**
 * O TEXTO FINAL de um corte: o que o espectador ouve depois da edição, e não a
 * transcrição bruta do trecho.
 *
 * ## Por que isto existe
 *
 * No teste de 29/09 o corte de Moisés (vídeo cmumzycoa000004iacu03zol8) foi
 * aprovado pela seleção e pela Vera, e saiu com um salto no meio da fala. As
 * duas liam a TRANSCRIÇÃO BRUTA do trecho, que estava inteira e fazia sentido;
 * o que foi ao ar era essa transcrição MENOS as remoções da limpeza, e ninguém
 * lia essa versão. Quem revisa precisa ler o que vai ao ar.
 *
 * O mesmo cálculo serve para a checagem mecânica (fim pendurado, remoção longa
 * de fala, emenda que atravessa fim de frase), para a Vera e para o script de
 * diagnóstico. Um lugar só, para as três leituras não divergirem.
 */

/** Termina com ponto, interrogação, exclamação ou reticências. */
export function fechaFrase(palavra: string): boolean {
  return /[.!?…]["'”’)\]]?\s*$/.test(palavra);
}

/**
 * Palavras que não podem fechar um corte, mesmo com ponto depois: são ligação
 * para a frase seguinte, e o corte que termina nelas fica pendurado ("então...",
 * "e", "mas"). A transcrição às vezes põe ponto depois de um "então" que puxa a
 * próxima frase.
 */
const NAO_FECHA = new Set([
  "entao", "e", "mas", "porque", "que", "ai", "tipo", "ou", "pra", "para", "de", "do", "da",
  "o", "a", "um", "uma", "com", "sem", "se", "quando", "como", "enfim", "tanto",
]);

/** Muleta que fecha frase e sai na limpeza: "né?", "tá?", "hein?". */
const MULETAS_DE_FIM = new Set(["ne", "ta", "hein", "ein"]);

function chave(p: string): string {
  return p
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

/** A palavra fecha a frase E pode ser a última de um corte. */
export function fechaCorte(palavra: string): boolean {
  return fechaFrase(palavra) && !NAO_FECHA.has(chave(palavra));
}

/** Quanto de FALA (soma da duração das palavras) um intervalo de tempo cobre. */
export function falaCoberta(palavras: Word[], de: number, ate: number): number {
  let s = 0;
  for (const w of palavras) {
    if (w.end <= de || w.start >= ate) continue;
    s += Math.min(w.end, ate) - Math.max(w.start, de);
  }
  return s;
}

/**
 * Teto de fala que uma remoção pode levar. Hesitação, muleta e repetição
 * cabem com folga (o "é" mais arrastado medido tinha 0,48 s; um recomeço de
 * três palavras, perto de 1 s). Acima disto a remoção está tirando CONTEÚDO, e
 * juntando o que vinha antes com o que vinha depois dela. Pausa não conta:
 * silêncio pode sair à vontade.
 */
export const FALA_MAXIMA_POR_REMOCAO_SEC = 1.2;

export type TextoFinal = {
  /** O que se ouve, com " / " onde houve emenda que tirou palavra. */
  texto: string;
  /** O mesmo, sem as marcas de emenda. */
  corrido: string;
  /** Índices (na lista `palavras`) das palavras que ficam. */
  indices: number[];
};

/**
 * As palavras que ficam: as que têm o MEIO dentro de um intervalo mantido.
 * `manter` vem no tempo do corte (0 = `inicio`), como o pedido manda ao worker.
 */
export function textoFinalDoCorte(
  palavras: Word[],
  inicio: number,
  manter: Array<{ de: number; ate: number }>
): TextoFinal {
  const indices: number[] = [];
  palavras.forEach((w, i) => {
    const meio = (w.start + w.end) / 2 - inicio;
    if (manter.some((m) => meio >= m.de && meio <= m.ate)) indices.push(i);
  });
  const partes: string[] = [];
  indices.forEach((idx, n) => {
    if (n > 0 && idx !== indices[n - 1] + 1) partes.push("/");
    partes.push(palavras[idx].word);
  });
  return {
    texto: partes.join(" "),
    corrido: indices.map((i) => palavras[i].word).join(" "),
    indices,
  };
}

/**
 * Os defeitos MECÂNICOS do texto final, em português, para log, Vera e teste.
 * Lista vazia quer dizer que o corte está de pé por construção; o julgamento
 * de sentido continua sendo da Vera.
 */
export function defeitosDoTextoFinal(
  palavras: Word[],
  inicio: number,
  fim: number,
  manter: Array<{ de: number; ate: number }>
): string[] {
  const { indices } = textoFinalDoCorte(palavras, inicio, manter);
  if (!indices.length) return ["o corte ficou sem fala"];
  const defeitos: string[] = [];

  const primeira = indices[0];
  const ultima = indices[indices.length - 1];
  if (primeira > 0 && !fechaFrase(palavras[primeira - 1].word)) {
    defeitos.push(`começa no meio de frase ("${palavras[primeira - 1].word} | ${palavras[primeira].word}")`);
  }
  // O "né?" final que a limpeza tira deixa a frase terminando em vírgula na
  // transcrição ("pra ele, né?" vira "pra ele,"), mas a frase está completa:
  // o que saiu depois é só muleta que fechava a frase.
  const tiradasNoFim = palavras.filter((w, i) => i > ultima && w.start < fim - 0.05);
  const soMuletaFechando =
    tiradasNoFim.length > 0 &&
    tiradasNoFim.length <= 2 &&
    tiradasNoFim.every((w) => MULETAS_DE_FIM.has(chave(w.word))) &&
    fechaFrase(tiradasNoFim[tiradasNoFim.length - 1].word) &&
    !NAO_FECHA.has(chave(palavras[ultima].word));
  if (!fechaCorte(palavras[ultima].word) && !soMuletaFechando) {
    defeitos.push(`termina pendurado em "${palavras[ultima].word}"`);
  }
  // Fala do trecho que ficou depois da última palavra mantida: o corte parou
  // antes do fim que ele mesmo prometia.
  const cortadasNoFim = soMuletaFechando ? [] : tiradasNoFim;
  if (cortadasNoFim.length) {
    defeitos.push(`o fim come ${cortadasNoFim.length} palavra(s): "${cortadasNoFim.map((w) => w.word).join(" ")}"`);
  }

  // Cada emenda que tirou palavra: quanto de fala saiu e se atravessou fim de frase.
  for (let n = 1; n < indices.length; n++) {
    const a = indices[n - 1];
    const b = indices[n];
    if (b === a + 1) continue;
    const tiradas = palavras.slice(a + 1, b);
    const fala = tiradas.reduce((s, w) => s + (w.end - w.start), 0);
    const texto = tiradas.map((w) => w.word).join(" ");
    if (fala > FALA_MAXIMA_POR_REMOCAO_SEC) {
      defeitos.push(`emenda tira ${fala.toFixed(1)}s de fala: "${texto}"`);
    }
    if ([palavras[a], ...tiradas.slice(0, -1)].some((w) => fechaFrase(w.word)) && tiradas.length > 3) {
      defeitos.push(`emenda atravessa fim de frase e junta ideias: "...${palavras[a].word} / ${palavras[b].word}..."`);
    }
  }
  return defeitos;
}
