/**
 * O veredito da Vera, lido do card que ela salva.
 *
 * ## De onde vem
 *
 * A Vera grava um card `preview` por dia com o texto final e, no fim,
 * `Veredito da Vera:` seguido da resposta inteira dela. A última linha dessa
 * resposta é `VEREDITO: APROVADO` (ou uma das reprovações), e antes dela vem a
 * lista de problemas que ela encontrou.
 *
 * ## Por que existe como módulo
 *
 * Pedido do Bruno em 18/09: a ficha do agente deve mostrar "se foi bom, ruim,
 * as notas que a Vera deu". A nota já existia, gravada, e nenhuma tela lia.
 */

export type ChaveDoVeredito = "aprovado" | "ressalvas" | "reprovado" | "corrigido" | "sem-veredito";

export type VereditoDaVera = {
  chave: ChaveDoVeredito;
  /** "aprovado", "aprovado com ressalvas", "reprovado". */
  rotulo: string;
  /** O que ela escreveu antes do veredito, resumido em uma ou duas frases. */
  nota: string | null;
};

const ROTULOS: Record<ChaveDoVeredito, string> = {
  aprovado: "aprovado",
  ressalvas: "aprovado com ressalvas",
  reprovado: "reprovado",
  /**
   * A Vera reprovou, o redator reescreveu, e a peca seguiu.
   *
   * Nasceu em 19/09: TODO parecer do banco dizia "reprovado", inclusive os de
   * pecas que foram corrigidas e aprovadas na sequencia. O desfecho e um
   * estado proprio, nao um meio-termo: quem le precisa saber que houve
   * reprovacao E que ela foi resolvida.
   */
  corrigido: "reprovado e corrigido",
  "sem-veredito": "sem veredito",
};

/**
 * Lê o card da Vera e devolve o veredito.
 *
 * Aceita o card inteiro (com o texto do post antes) porque é assim que ele
 * está gravado; procura o marcador e ignora o resto.
 */
export function lerVeredito(conteudoDoCardDaVera: string | null | undefined): VereditoDaVera {
  const texto = conteudoDoCardDaVera ?? "";
  if (!texto.trim()) return { chave: "sem-veredito", rotulo: ROTULOS["sem-veredito"], nota: null };

  const marcador = texto.lastIndexOf("Veredito da Vera:");
  const parecer = marcador >= 0 ? texto.slice(marcador + "Veredito da Vera:".length) : texto;

  /**
   * O ULTIMO `VEREDITO:`, e nao o primeiro.
   *
   * O card guarda a revisao inteira e, quando houve correcao automatica, o
   * desfecho e escrito no fim. Ler o primeiro devolvia sempre a reprovacao
   * inicial, e foi por isso que 12 de 12 pareceres apareciam como
   * "reprovado" na tela do Bruno em 19/09.
   */
  const todos = [...parecer.matchAll(/VEREDITO:\s*([A-Z_]+)/gi)];
  const achado = todos.length > 0 ? todos[todos.length - 1] : null;
  const bruto = (achado?.[1] ?? "").toUpperCase();
  const chave: ChaveDoVeredito = bruto === "CORRIGIDO"
    ? "corrigido"
    : bruto.startsWith("REPROVADO")
    ? "reprovado"
    : bruto === "APROVADO_COM_RESSALVAS"
      ? "ressalvas"
      : bruto === "APROVADO"
        ? "aprovado"
        : "sem-veredito";

  // A nota: o que ela escreveu antes de bater o martelo. As linhas de
  // cabeçalho e as marcas de lista saem, porque o que interessa é a frase.
  const antesDoVeredito = achado ? parecer.slice(0, parecer.indexOf(achado[0])) : parecer;
  const linhasBrutas = antesDoVeredito.split("\n").map((l) => l.trim());

  /**
   * O MOTIVO mora depois do título de problemas, quando ele existe.
   *
   * A Vera abre o parecer com o que está bom ("O QUE ESTÁ BOM, E É PRECISO
   * REGISTRAR") e só depois lista o que reprova ("PROBLEMAS QUE REPROVAM").
   * Lendo de cima, a nota de uma reprovação saía "Tema: o paradoxo dos 95%...
   * Mídia: gerada nos 4 formatos, margens aprovadas", que é o cabeçalho e diz
   * o contrário do veredito (visto na ficha da Diana em 19/09). Quando há um
   * título em caixa alta falando de problema, a nota começa dali.
   */
  //
  // O próprio marcador `VEREDITO: REPROVADO` é uma linha em caixa alta com a
  // palavra REPROVADO dentro, e ele fica no FIM: lido como título, jogava o
  // corte para depois de tudo e a nota saía vazia. Ele nunca é título.
  const ehTitulo = (l: string) =>
    l.length >= 8 && l === l.toUpperCase() && /[A-ZÀ-Ú]/.test(l) && !/^VEREDITO\s*:/i.test(l);
  const idxDosProblemas = linhasBrutas.findIndex((l) => ehTitulo(l) && /PROBLEM|REPROV|MUDAR|CORRIG|AJUST|ERRO/.test(l));
  const base = idxDosProblemas >= 0 ? linhasBrutas.slice(idxDosProblemas + 1) : linhasBrutas;

  const linhas = base
    .filter((l) => !ehTitulo(l))
    .map((l) => l.replace(/^[\s\-*•\d.)#]+/, "").trim())
    .filter(
      (l) =>
        l.length > 25 &&
        // Cabeçalhos que a Vera escreve antes de começar o parecer de verdade.
        // "PARECER DE REVISÃO EDITORIAL, SEXTA-FEIRA" não é uma nota, nem
        // "Tema: ..." ou "Peças analisadas: ...".
        !/^(parecer|revis|an[aá]lise|conte[uú]do|crit[eé]rio|status|tema\s*:|pe[cç]as?\b|m[ií]dia\s*:|linkedin:|x \(twitter\):)/i.test(l)
    );

  const nota = linhas.slice(0, 2).join(" ").trim();
  return {
    chave,
    rotulo: ROTULOS[chave],
    nota: nota ? (nota.length > 300 ? `${nota.slice(0, 300)}…` : nota) : null,
  };
}
