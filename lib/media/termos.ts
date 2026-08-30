import type { Word } from "@/lib/media/transcribe";

/**
 * Os termos do negócio do cliente, e a correção determinística da transcrição.
 *
 * Nasceu do teste do Bruno em 30/08: a legenda escreveu "Arétcon" para
 * Areticon e "dois reais" para "dor real". O modelo de transcrição não conhece
 * o vocabulário de cada cliente, e o `keyterm` da Deepgram satura com mais de
 * cinco termos (medido em 18/08), então o glossário precisa de uma segunda
 * camada que não dependa do modelo: comparar cada palavra transcrita com os
 * termos e trocar a que ficou perto o bastante.
 *
 * É a regra deste projeto: decisão de modelo sempre com rede determinística
 * por baixo. O keyterm ajuda a Deepgram a acertar; esta função conserta o que
 * ela ainda errar, e vale também para transcrição antiga, sem transcrever de
 * novo.
 */

/** Quantos termos o cliente pode cadastrar. Acima disso é lista, não glossário. */
export const MAX_TERMOS = 30;

export function parseTermos(texto: string | null | undefined): string[] {
  if (!texto) return [];
  const vistos = new Set<string>();
  const termos: string[] = [];
  for (const bruto of texto.split(/[,\n;]+/)) {
    const t = bruto.trim().replace(/\s+/g, " ");
    if (t.length < 2) continue;
    const chave = normalizar(t);
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    termos.push(t);
    if (termos.length >= MAX_TERMOS) break;
  }
  return termos;
}

/** Minúsculas, sem acento, só letras e números. */
export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 1 é igual, 0 é nada a ver. */
function semelhanca(a: string, b: string): number {
  const maior = Math.max(a.length, b.length);
  if (!maior) return 0;
  return 1 - levenshtein(a, b) / maior;
}

/**
 * O quão perto uma palavra transcrita precisa chegar do termo para ser
 * trocada. Termo curto exige mais, porque "sas" e "saas" são vizinhos mas
 * "casa" e "caso" também são, e trocar palavra comum por termo do cliente
 * seria pior que o erro original.
 */
function limiar(termoNormalizado: string): number {
  if (termoNormalizado.length <= 5) return 0.74;
  if (termoNormalizado.length <= 8) return 0.75;
  return 0.7;
}

/** Separa a pontuação que fica grudada na palavra transcrita. */
function partir(palavra: string): { miolo: string; antes: string; depois: string } {
  const m = palavra.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u);
  return m ? { antes: m[1], miolo: m[2], depois: m[3] } : { antes: "", miolo: palavra, depois: "" };
}

/**
 * Devolve as palavras com os termos do cliente aplicados. Cada termo é
 * comparado com janelas de 1 a N palavras (N = quantas palavras o termo tem,
 * mais uma, porque "Areticon" às vezes sai como "arete com"). Quando uma
 * janela casa, a primeira palavra recebe o termo e as outras somem, com o
 * tempo de fim da última preservado, para a legenda continuar sincronizada.
 */
export function aplicarTermos(palavras: Word[], termos: string[]): Word[] {
  const lista = termos
    .map((t) => ({ termo: t, chave: normalizar(t), n: t.split(/\s+/).length }))
    .filter((t) => t.chave.length >= 3);
  if (!lista.length || !palavras.length) return palavras;

  const saida: Word[] = [];
  let i = 0;
  while (i < palavras.length) {
    let melhor: { fim: number; termo: string; nota: number; chave: string } | null = null;
    for (const t of lista) {
      const maxJanela = Math.min(t.n + 1, palavras.length - i);
      for (let n = 1; n <= maxJanela; n++) {
        const janela = palavras.slice(i, i + n);
        const chave = normalizar(janela.map((w) => partir(w.word).miolo).join(""));
        if (!chave) continue;
        // Janela de várias palavras só vale se cada pedaço for curto: juntar
        // duas palavras inteiras e comuns para casar um termo é falso positivo.
        if (n > t.n && chave.length > t.chave.length + 2) continue;
        // Termo curto exige a mesma letra inicial: "sas" vira SaaS, "casa" não.
        if (t.chave.length <= 5 && chave[0] !== t.chave[0]) continue;
        const nota = semelhanca(chave, t.chave);
        if (nota >= limiar(t.chave) && (!melhor || nota > melhor.nota)) {
          melhor = { fim: i + n, termo: t.termo, nota, chave: t.chave };
        }
      }
    }
    // Lookahead: se a mesma janela SEM a primeira palavra casa tão bem ou
    // melhor, a primeira palavra é artigo ou preposição e fica onde está.
    // Sem isto "a Areticon" virava "Areticon" e sumia o "a".
    if (melhor && melhor.fim - i > 1) {
      const semPrimeira = normalizar(
        palavras.slice(i + 1, melhor.fim).map((w) => partir(w.word).miolo).join("")
      );
      if (semPrimeira && semelhanca(semPrimeira, melhor.chave) >= melhor.nota) melhor = null;
    }
    if (!melhor) {
      saida.push(palavras[i]);
      i += 1;
      continue;
    }
    const primeira = palavras[i];
    const ultima = palavras[melhor.fim - 1];
    const { antes } = partir(primeira.word);
    const { depois } = partir(ultima.word);
    saida.push({
      ...primeira,
      word: `${antes}${melhor.termo}${depois}`,
      end: ultima.end,
    });
    i = melhor.fim;
  }
  return saida;
}
