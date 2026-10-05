/**
 * A FRASE DA ARTE NUNCA SAI TRUNCADA (05/10/2026).
 *
 * O post de Fé & Gestão de 05/10 foi ao quadro com "Você defende que cada
 * avanço precisa ser 'fincado como estaca' (relações, valores." escrito na
 * arte: a tese do Roberto era longa, e o corte antigo (`fraseDaArte`) cortava
 * na última vírgula e pregava um ponto. Regra nova:
 *
 *   1. a frase inteira cabe no teto? vai inteira;
 *   2. não cabe? fica a maior sequência de FRASES COMPLETAS (até o ponto
 *      final, interrogação ou exclamação) que cabe;
 *   3. nenhuma frase completa cabe? `fraseCompleta` devolve null, e quem chama
 *      pede ao redator uma MANCHETE CURTA (`mancheteCurta`), dentro do teto
 *      do modelo. Nunca mais um pedaço de frase com reticências.
 *
 * O teto vem do modelo do book (`maxPalavras`) e do tamanho da peça; a
 * checagem de que o texto cabe (`textoCabe`) roda ANTES de compor.
 */

/** O teto padrão de caracteres de uma frase escrita na arte. */
export const TETO_DA_FRASE = 140;

/** O texto só com espaços simples. */
function limpar(t: string): string {
  return t.replace(/\s+/g, " ").trim();
}

/** Parte um texto em frases completas (terminadas em . ? ! ou …). */
export function frasesCompletas(texto: string): string[] {
  const t = limpar(texto);
  const saida: string[] = [];
  const re = /[^.!?…]+[.!?…]+["”')\]]?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const f = m[0].trim();
    if (f.length > 1) saida.push(f);
  }
  return saida;
}

/** O texto cabe no teto de caracteres e, quando dado, no teto de palavras? */
export function textoCabe(texto: string, teto: { caracteres?: number; palavras?: number }): boolean {
  const t = limpar(texto);
  if (!t) return false;
  if (teto.caracteres && t.length > teto.caracteres) return false;
  if (teto.palavras && t.split(" ").length > teto.palavras) return false;
  return true;
}

/**
 * A frase da arte, inteira ou em frases completas. Null quando nem a primeira
 * frase completa cabe: quem chama pede a manchete curta ao redator.
 */
export function fraseCompleta(bruta: string, teto: { caracteres?: number; palavras?: number } = { caracteres: TETO_DA_FRASE }): string | null {
  const t = limpar(bruta);
  if (!t) return null;
  if (textoCabe(t, teto)) return t;
  const frases = frasesCompletas(t);
  // A maior sequência de frases completas, do começo, que cabe.
  let acumulado = "";
  let melhor: string | null = null;
  for (const f of frases) {
    const tentativa = acumulado ? `${acumulado} ${f}` : f;
    if (!textoCabe(tentativa, teto)) break;
    acumulado = tentativa;
    melhor = tentativa;
  }
  return melhor;
}

/** A frase parece truncada (termina sem pontuação de fim, ou com reticências, ou com parêntese aberto)? */
export function pareceTruncada(frase: string): boolean {
  const t = limpar(frase);
  if (!t) return true;
  if (/[…]$/.test(t)) return true;
  const abertos = (t.match(/\(/g) ?? []).length;
  const fechados = (t.match(/\)/g) ?? []).length;
  if (abertos > fechados) return true;
  // Termina em vírgula, dois-pontos ou ponto e vírgula: pedaço de frase.
  if (/[,;:]\.?$/.test(t)) return true;
  // "(relações, valores." : ponto pregado depois de uma lista que não fechou.
  if (/\([^)]*\.$/.test(t)) return true;
  return false;
}

/**
 * A MANCHETE CURTA pelo redator: quando nenhuma frase completa cabe no teto.
 * É escrita (texto), então é do Claude; a decisão de pedir é do código.
 */
export async function mancheteCurta(o: {
  fraseLonga: string;
  maxPalavras: number;
  maxCaracteres?: number;
  contexto?: string;
  usage?: { projectId?: string; runId?: string };
}): Promise<string> {
  const { askClaude } = await import("@/lib/claude");
  const maxCaracteres = o.maxCaracteres ?? TETO_DA_FRASE;
  const bruto = await askClaude(
    "Você escreve a manchete de uma arte de rede social em português do Brasil. Devolva SÓ a manchete, sem aspas, sem comentário. Nunca use travessão. Nunca invente número, nome ou dado que não esteja no texto.",
    `A frase abaixo é longa demais para caber na arte. Reescreva-a como UMA manchete completa, com sentido fechado, de no máximo ${o.maxPalavras} palavras e ${maxCaracteres} caracteres, mantendo a ideia e as palavras fortes dela. Nunca uma frase cortada pela metade.

FRASE LONGA:
${o.fraseLonga}
${o.contexto ? `\nCONTEXTO (de onde a frase veio):\n${o.contexto.slice(0, 1500)}` : ""}`,
    { maxTokens: 400, effort: "low", usage: { operation: "manchete_curta", ...o.usage } }
  );
  const manchete = limpar(bruto.split("\n")[0]).replace(/^["“]|["”]$/g, "").replace(/\s*[—–]\s*/g, ", ");
  // O redator estourou o teto: fica a primeira frase completa dele que cabe, ou o corte na última palavra inteira (sem reticências).
  if (textoCabe(manchete, { caracteres: maxCaracteres, palavras: o.maxPalavras })) return manchete;
  const completa = fraseCompleta(manchete, { caracteres: maxCaracteres, palavras: o.maxPalavras });
  if (completa) return completa;
  const palavras = manchete.split(" ").slice(0, o.maxPalavras);
  let curta = palavras.join(" ");
  while (curta.length > maxCaracteres && palavras.length > 1) {
    palavras.pop();
    curta = palavras.join(" ");
  }
  return curta.replace(/[,;:]$/, "");
}

/**
 * A frase da arte, garantida: inteira, em frases completas, ou a manchete
 * curta do redator. Nunca truncada.
 */
export async function fraseGarantida(o: {
  bruta: string;
  maxPalavras?: number;
  maxCaracteres?: number;
  contexto?: string;
  usage?: { projectId?: string; runId?: string };
}): Promise<string> {
  const teto = { caracteres: o.maxCaracteres ?? TETO_DA_FRASE, palavras: o.maxPalavras };
  const pronta = fraseCompleta(o.bruta, teto);
  if (pronta && !pareceTruncada(pronta)) return pronta;
  return mancheteCurta({ fraseLonga: o.bruta, maxPalavras: o.maxPalavras ?? 12, maxCaracteres: teto.caracteres, contexto: o.contexto, usage: o.usage });
}
