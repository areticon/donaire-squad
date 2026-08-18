/**
 * Escolhe os nomes próprios que valem gastar no `keyterm` da transcrição.
 *
 * Por que no máximo 5, medido contra a API em 18/08/2026: o keyterm satura.
 * Com 2 e com 5 termos ele recupera as palavras que o modelo apagaria; com 10,
 * 20 ou 30 ele para de funcionar e as palavras somem de novo. Quanto mais
 * termos, menor o reforço em cada um. Mandar um glossário grande não adianta.
 *
 * Por isso o orçamento é gasto só com o que dá para saber de antemão, que são
 * os nomes próprios do cliente. O jargão em inglês, que é imprevisível, fica
 * por conta do `language=multi`.
 */

export const MAX_KEYTERMS = 5;

/** Palavras que começam com maiúscula por posição, não por serem nome próprio. */
const RUIDO = new Set([
  "a","o","as","os","um","uma","e","ou","mas","se","que","de","do","da","dos","das",
  "em","no","na","nos","nas","por","para","com","sem","sobre","entre","ao","aos",
  "eu","voce","você","nos","nós","ele","ela","eles","elas","isso","isto","aquilo",
  "quando","onde","como","porque","entao","então","tambem","também","ja","já",
  "hoje","ontem","amanha","amanhã","aqui","ali","la","lá","muito","mais","menos",
  "todo","toda","todos","todas","cada","outro","outra","nosso","nossa","seu","sua",
]);

/**
 * Devolve até MAX_KEYTERMS termos, o nome do projeto primeiro (é o que o
 * cliente mais fala e o que a transcrição mais erra), depois os nomes próprios
 * mais frequentes do contexto de marca.
 */
export function buildKeyterms(
  projectName: string,
  brandContext?: string | null
): string[] {
  const escolhidos: string[] = [];
  const vistos = new Set<string>();

  const adicionar = (termo: string) => {
    const limpo = termo.trim();
    const chave = limpo.toLowerCase();
    if (!limpo || vistos.has(chave) || escolhidos.length >= MAX_KEYTERMS) return;
    vistos.add(chave);
    escolhidos.push(limpo);
  };

  adicionar(projectName);

  if (brandContext) {
    const contagem = new Map<string, { termo: string; n: number }>();
    // Maiúscula seguida de minúsculas, com acentuação. Ignora a primeira
    // palavra de cada frase, que está em maiúscula por posição e não por ser
    // nome próprio.
    const frases = brandContext.split(/(?<=[.!?\n])\s+/);
    for (const frase of frases) {
      const palavras = frase.match(/[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][\wÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç]{2,}/g) ?? [];
      for (const p of palavras.slice(1)) {
        const chave = p.toLowerCase();
        if (RUIDO.has(chave)) continue;
        const atual = contagem.get(chave);
        if (atual) atual.n += 1;
        else contagem.set(chave, { termo: p, n: 1 });
      }
    }
    [...contagem.values()]
      .sort((a, b) => b.n - a.n || a.termo.localeCompare(b.termo))
      .forEach((x) => adicionar(x.termo));
  }

  return escolhidos;
}
