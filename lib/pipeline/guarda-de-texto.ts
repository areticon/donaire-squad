/**
 * A GUARDA: nada que seja bastidor vira peça publicada.
 *
 * ## O que aconteceu em 18/09
 *
 * A correção da rede errada mandava, no mesmo prompt, o parecer da Vera e o
 * texto a corrigir, separados pelo rótulo `TEXTO ATUAL:`. O modelo devolveu o
 * prompt inteiro de volta, e o conteúdo gravado na peça do Instagram ficou:
 *
 * ```
 * Revisão de Vera Veredito, Sábado
 * Tom de voz
 * O tom geral está alinhado à marca...
 * TEXTO ATUAL:
 * Janeiro: post todo dia. Fotos cuidadas...
 * ```
 *
 * O parecer interno ia para o Instagram no nome do cliente.
 *
 * ## Por que uma guarda, e não só um prompt melhor
 *
 * O prompt foi corrigido (marcas `<POST>`, como no resto do fluxo). Mas
 * **nenhum prompt é garantia**: o modelo pode ecoar, concatenar ou explicar em
 * qualquer chamada, e já fez isso em 09/09 ("Segue a thread corrigida" como
 * primeiro tweet), em 10/09 (três posts abrindo com a explicação da correção)
 * e agora aqui. O que separa um defeito de um desastre é existir uma última
 * conferência entre o modelo e o banco.
 *
 * Esta guarda é essa conferência. Ela é burra de propósito: procura marcas que
 * **só existem em texto de bastidor** e nunca num post de verdade.
 */

/** Os rótulos dos NOSSOS prompts. Se aparecem na resposta, houve eco. */
const ROTULOS_DE_PROMPT = [
  "TEXTO ATUAL:",
  "POST ORIGINAL:",
  "THREAD ATUAL:",
  "FEEDBACK DA VERA:",
  "FRASES APONTADAS:",
  "O QUE A VERA ESCREVEU:",
  "O QUE FAZER:",
  "CONTEÚDO PARA REVISAR:",
];

/**
 * O CHANGELOG DO REDATOR, que foi ao ar em 21/09.
 *
 * Quando a Vera reprova, o redator corrige e explica o que mudou. Em duas
 * threads do X essa explicação foi PUBLICADA, colada no último tweet e
 * cortada no meio, e um amigo do Bruno avisou que o post "terminou sem eira
 * nem beira". A limpeza de bastidor não pegava porque exige duas travas ao
 * mesmo tempo (começar como entrega E falar do próprio texto), e "Ajustes
 * feitos: saíram '3 semanas seguidas', '3 frases'" fala das FRASES, não do
 * texto.
 *
 * Aqui a trava é uma só, e pode ser: nenhuma peça publicada começa uma linha
 * com "Ajustes feitos:" ou "O que mudou nesta versão".
 */
const MARCAS_DE_CHANGELOG = [
  /^\s*(ajustes?|altera[çc][õo]es|mudan[çc]as|corre[çc][õo]es)\s+(feitas?|feitos?|realizad[ao]s?|aplicad[ao]s?)\s*:/im,
  /^\s*o que mudou( nesta vers[ãa]o)?\s*:?\s*$/im,
];

/** Marcas de parecer. Nenhuma delas cabe numa peça publicada. */
const MARCAS_DE_PARECER = [
  /VEREDITO:\s*(APROVADO|REPROVADO)/i,
  /^Revisão de [A-ZÁÂÃÉÊÍÓÔÕÚ][\wÀ-ÿ]+ [A-ZÁÂÃÉÊÍÓÔÕÚ][\wÀ-ÿ]+,/m,
  /^Parecer de revisão/im,
  /CRITÉRIOS DE ACEITE/i,
  /LASTRO DOS NÚMEROS/i,
  /REPROVADO_TEXTO|REPROVADO_MIDIA|REPROVADO_AMBOS|APROVADO_COM_RESSALVAS/,
];

/**
 * Corta o eco do prompt: quando a resposta repete um rótulo nosso, o que vale
 * é o que vem DEPOIS do último rótulo.
 *
 * Recuperar é melhor que descartar. Na peça de 18/09 o texto certo estava
 * inteiro logo abaixo do rótulo, e jogar tudo fora perderia o trabalho.
 */
export function limparEcoDoPrompt(texto: string): string {
  let saida = texto;
  for (const rotulo of ROTULOS_DE_PROMPT) {
    const i = saida.lastIndexOf(rotulo);
    if (i >= 0) {
      const depois = saida.slice(i + rotulo.length).trim();
      // Só corta se o que sobra tem corpo de peça. Um rótulo no fim do texto
      // significa que o modelo terminou explicando, e aí o corte apagaria tudo.
      if (depois.length >= 200) saida = depois;
    }
  }
  return saida.trim();
}

/**
 * O texto é bastidor (parecer, checklist, explicação) em vez de peça?
 *
 * @returns o motivo, ou `null` quando o texto está limpo.
 */
export function motivoDeBastidor(texto: string): string | null {
  const t = texto ?? "";
  if (!t.trim()) return "texto vazio";

  for (const rotulo of ROTULOS_DE_PROMPT) {
    if (t.includes(rotulo)) return `repetiu o rótulo do prompt "${rotulo}"`;
  }
  for (const marca of MARCAS_DE_PARECER) {
    if (marca.test(t)) return `contém marca de parecer (${marca.source.slice(0, 40)})`;
  }
  for (const marca of MARCAS_DE_CHANGELOG) {
    if (marca.test(t)) return "contém o changelog do redator (ajustes feitos, o que mudou)";
  }
  return null;
}

/** Atalho booleano de `motivoDeBastidor`. */
export function ehBastidor(texto: string): boolean {
  return motivoDeBastidor(texto) !== null;
}

/**
 * O caminho completo, para usar antes de gravar qualquer texto de agente:
 * tenta recuperar a peça do eco e, se ainda for bastidor, recusa.
 *
 * @returns `{ texto }` quando dá para gravar, `{ recusado }` quando não dá.
 */
export function pecaPublicavel(bruto: string): { texto: string } | { recusado: string } {
  const limpo = limparEcoDoPrompt(bruto);
  const motivo = motivoDeBastidor(limpo);
  return motivo ? { recusado: motivo } : { texto: limpo };
}
