/**
 * O ALCANCE DA REPROVAÇÃO, num lugar só e provável.
 *
 * Existe por causa do relato do Bruno em 21/09: "reprovei um post, a mensagem
 * foi que eu rejeitei a campanha, não era isso". Eram três erros somados, e os
 * três vinham de a decisão morar solta dentro do modal:
 *
 *   1. o botão reprovava TODOS os posts do dia, sempre, ignorando a marcação
 *      que as ações vizinhas ("Publicar agora", "Deixar agendado") respeitam;
 *   2. o card virava `rejected` mesmo quando sobravam posts vivos, o que
 *      acendia o aviso vermelho e escondia a lista do dia;
 *   3. o aviso chamava um DIA de campanha, e quem lê acredita.
 *
 * O que fica: quem decide o alcance é a marcação, e o dia só cai quando não
 * sobra nada de pé nele. A frase da tela sai da mesma função que escolhe os
 * alvos, porque rótulo e ação calculados em lugares diferentes é como a tela
 * passa a prometer uma coisa e o clique fazer outra (a mesma lição do crédito
 * da janela, em `lib/credits/estimativa.ts`).
 */

/**
 * Quem já saiu da mesa: publicado não volta atrás, arquivado e reprovado já
 * foram decididos. Reprovar de novo o que já está reprovado não muda nada no
 * banco, e contá-los faria a tela dizer "4 posts reprovados" quando são 2.
 */
export const ESTADOS_MORTOS = new Set(["published", "cancelled", "rejected"]);

export interface PostDoDia {
  id: string;
  platform: string;
  status: string;
}

export interface AlcanceDaReprovacao {
  /** Os posts que serão reprovados neste clique. */
  alvos: PostDoDia[];
  /** Sobra algum post vivo depois? Se não sobra, o DIA é que foi reprovado. */
  sobrouVivo: boolean;
  /** true quando o alcance veio da marcação, e não do dia inteiro. */
  porMarcacao: boolean;
}

/**
 * O que este clique alcança: o que está MARCADO, e o dia inteiro quando não há
 * marcação nenhuma. Marcação em post já publicado ou arquivado é ignorada, em
 * vez de virar uma chamada que a rota recusa.
 */
export function alcanceDaReprovacao(
  postsDoDia: PostDoDia[],
  marcados: Set<string>
): AlcanceDaReprovacao {
  const vivos = postsDoDia.filter((p) => !ESTADOS_MORTOS.has(p.status));
  const marcadosVivos = vivos.filter((p) => marcados.has(p.id));
  const porMarcacao = marcadosVivos.length > 0;
  const alvos = porMarcacao ? marcadosVivos : vivos;
  const alcancados = new Set(alvos.map((p) => p.id));
  return {
    alvos,
    sobrouVivo: vivos.some((p) => !alcancados.has(p.id)),
    porMarcacao,
  };
}

/**
 * O rótulo do botão, que diz o alcance ANTES do clique.
 *
 * `nomeDaRede` entra por parâmetro porque a tradução de "twitter" para "X"
 * vive no componente e não vale duplicar aqui: duas tabelas de nome de rede
 * divergem do mesmo jeito que duas tabelas de preço.
 */
export function rotuloDaReprovacao(
  alcance: AlcanceDaReprovacao,
  nomeDaRede: (platform: string) => string
): string {
  const n = alcance.alvos.length;
  if (alcance.porMarcacao) {
    if (n === 1) return `Reprovar o post de ${nomeDaRede(alcance.alvos[0].platform)}`;
    return `Reprovar os ${n} posts marcados`;
  }
  return `Reprovar o dia inteiro (${n === 1 ? "1 post" : `${n} posts`})`;
}

/** A frase de depois, que precisa dizer o que sobrou de pé. */
export function avisoDaReprovacao(alcance: AlcanceDaReprovacao): string {
  const n = alcance.alvos.length;
  const pecas = n === 1 ? "1 post" : `${n} posts`;
  return alcance.sobrouVivo
    ? `${n === 1 ? "Post reprovado" : `${pecas} reprovados`}. O resto do dia continua de pé.`
    : `Dia reprovado (${pecas}). Só este dia: o resto da campanha continua de pé.`;
}
