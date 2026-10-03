/**
 * A régua da REDE ERRADA: frases de um post que falam de outra rede social.
 *
 * ## Por que existe
 *
 * Em 18/09 o Bruno leu o post do Facebook e do Instagram do projeto dele. Os
 * dois abriam com "O LinkedIn não penaliza inteligência artificial", porque
 * são adaptações do post do LinkedIn e o prompt de adaptação mandava manter
 * "a tese, os dados e as fontes exatamente como estão". A frase é impecável
 * no LinkedIn e sem sentido no Instagram.
 *
 * A pergunta dele foi sobre a revisora: "a Vera deveria ter negado, como ela
 * não pegou isso?". **Ela não pegou porque nunca viu**: as derivadas são
 * criadas depois do post do LinkedIn e a revisão só recebia LinkedIn e X.
 *
 * ## O que esta régua faz, e o que ela NÃO faz
 *
 * Ela **mede**: lista as frases que citam uma rede que não é a do post. Ela
 * não julga, porque julgar aqui é mesmo trabalho de leitura: "uma pesquisa
 * ouviu 16 mil criadores do LinkedIn" é um fato legítimo dentro de um post de
 * Instagram, e "seu post no LinkedIn está competindo" não é. A diferença é de
 * sentido, não de palavra.
 *
 * É o mesmo padrão dos limites da rede e do lastro dos números: o que dá para
 * medir vai medido para a Vera, e o veredito continua dela.
 */

/** Como cada rede é chamada em português, do jeito que um texto a escreveria. */
const APELIDOS: Record<string, RegExp> = {
  linkedin: /\bLinked\s?-?In\b/gi,
  facebook: /\bFace\s?book\b/gi,
  instagram: /\b(Instagram|Insta(?!\w))\b/gi,
  // "X" sozinho é letra demais para virar regra; só as formas que não deixam
  // dúvida de que se fala da rede.
  twitter: /\b(Twitter|no X\b|do X\b|Tweet(s|ar)?\b|thread do X\b)/gi,
  tiktok: /\bTik\s?Tok\b/gi,
  youtube: /\bYou\s?Tube\b/gi,
};

/** Quebra em frases sem perder a pontuação, para a citação ficar legível. */
function frases(texto: string): string[] {
  return texto
    .split(/(?<=[.!?])\s+|\n+/)
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}

export type MencaoDeRede = {
  /** A rede citada, em minúsculas: "linkedin". */
  rede: string;
  /** A frase inteira onde ela aparece. */
  frase: string;
};

/**
 * As frases de `texto` que citam alguma rede diferente de `redeDoPost`.
 *
 * @param redeDoPost "facebook", "instagram", "linkedin", "twitter"…
 */
export function mencoesDeOutraRede(texto: string, redeDoPost: string): MencaoDeRede[] {
  const achados: MencaoDeRede[] = [];
  const minha = redeDoPost.toLowerCase();

  for (const f of frases(texto)) {
    for (const [rede, padrao] of Object.entries(APELIDOS)) {
      if (rede === minha) continue;
      padrao.lastIndex = 0;
      if (padrao.test(f)) {
        achados.push({ rede, frase: f.length > 240 ? `${f.slice(0, 240)}…` : f });
        break; // uma frase entra na lista uma vez, mesmo citando duas redes
      }
    }
  }
  return achados;
}

/** O nome da rede como se escreve num texto. */
export const NOME_DA_REDE: Record<string, string> = {
  linkedin: "LinkedIn",
  facebook: "Facebook",
  instagram: "Instagram",
  twitter: "X",
  tiktok: "TikTok",
  youtube: "YouTube",
};
