import { askClaude } from "@/lib/claude";

/**
 * A FRASE DA CAPA SEM ACENTO (02/10/2026).
 *
 * A capa do vídeo completo de 30/09 saiu com "SUA IA AINDA E ESTAGIARIA", e a
 * outra opção com "Jetro ja ensinou isso a Moises". A fonte da capa (Anton)
 * tem os glifos acentuados, e a capa de 30/09 à noite saiu certa com "SEU
 * NEGÓCIO É O BARCO DELE"; o texto em si é que veio sem acento, gravado assim
 * em `VideoJob.capas`.
 *
 * REPRODUZIDO em 02/10 com o insumo real do banco e o prompt de hoje
 * (scripts/tmp/capa-acento-reproduz-0210.mts): o Opus 5, que escrevia as
 * frases até 01/10, devolveu frase sem acento em 7 de 12 frases; o Sonnet 5,
 * o modelo de hoje, em 1 de 12 ("Delegar para IA como Jetro ensinou", que de
 * fato não leva acento). O insumo estava acentuado. Frase curta de miniatura
 * puxa o modelo para o registro de "texto de imagem", e ele larga o acento.
 *
 * Instrução no prompt ajuda e não garante, então a garantia é esta: quando uma
 * frase volta SEM NENHUM acento, uma chamada curta pede a mesma frase
 * acentuada, e o código só aceita a resposta se ela for a MESMA frase (tiradas
 * as marcas das duas, o texto tem que bater letra por letra). O corretor não
 * consegue trocar palavra, só pôr acento. Frase que legitimamente não leva
 * acento volta igual e segue.
 *
 * Custo: uma chamada de Sonnet 5 de umas 300 palavras, perto de US$ 0,002, e
 * só quando alguma frase chega sem acento.
 */

const TEM_ACENTO = /[áàâãéêíóôõúüç]/i;

/** O texto sem marca nenhuma, em minúsculas: a régua do "é a mesma frase?". */
export function semMarcas(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function temAcento(t: string): boolean {
  return TEM_ACENTO.test(t);
}

const SISTEMA = `Você revisa a acentuação de frases curtas em português do Brasil.

Recebe uma lista JSON de frases. Devolva a MESMA lista, na mesma ordem, com a acentuação e o cedilha corretos.

Regras:
- Não troque, não tire e não acrescente nenhuma palavra. Não mude a pontuação nem as maiúsculas.
- Só ponha os acentos que faltam: "Voce" vira "Você", "ja" vira "já", "e estagiaria" (verbo ser) vira "é estagiária", "Moises" vira "Moisés".
- Frase que já está certa volta igual.

Responda SOMENTE com o JSON da lista, sem cercas de código. Exemplo: ["Você usa só 5% da IA?","Sua IA ainda é estagiária"]`;

/**
 * Devolve as frases com acento, corrigindo só as que chegaram sem nenhum.
 * Nunca lança: se a correção falhar, as frases seguem como vieram.
 */
export async function acentuarFrases(frases: string[], usage?: { projectId?: string }): Promise<string[]> {
  const suspeitas = frases.map((f) => Boolean(f.trim()) && !temAcento(f));
  if (!suspeitas.some(Boolean)) return frases;
  try {
    const resposta = await askClaude(SISTEMA, JSON.stringify(frases), {
      maxTokens: 4000,
      effort: "low",
      usage: { operation: "capa_acentuacao", ...usage },
    });
    const limpo = resposta.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
    const corrigidas = JSON.parse(limpo) as unknown;
    if (!Array.isArray(corrigidas)) return frases;
    return frases.map((original, i) => {
      if (!suspeitas[i]) return original;
      const nova = typeof corrigidas[i] === "string" ? (corrigidas[i] as string).trim() : "";
      // A régua: a correção só passa se for a mesma frase com acento.
      return nova && semMarcas(nova) === semMarcas(original) ? nova : original;
    });
  } catch (e) {
    console.warn(`[acentuacao] a correção falhou, as frases seguem como vieram: ${e instanceof Error ? e.message : e}`);
    return frases;
  }
}
