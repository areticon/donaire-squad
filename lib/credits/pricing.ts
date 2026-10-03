import { CREDIT_COSTS } from "@/lib/credits/tabela";
import { formatoDaPeca, gruposDeFormato } from "@/lib/media/formatos-das-redes";

/**
 * Quanto custa cada coisa que o pipeline entrega.
 *
 * A `CREDIT_COSTS` existia desde agosto e **não era usada por ninguém**: o
 * pipeline gerava texto, imagem e carrossel sem cobrar nada. Enquanto foi
 * assim, o plano era ilimitado na prática e a margem por plano do modelo de
 * negócio não valia.
 *
 * A cobrança é pelo que foi entregue, não pelo que foi planejado. Se a geração
 * de imagem falhar e o post sair só com texto, o cliente paga texto.
 */

export type ItemCobravel = {
  mediaType: string | null;
  platform: string;
  /** Post no X que leva link paga a mais, porque a API do X cobra US$ 0,20. */
  temLink?: boolean;
  /**
   * O dia da campanha a que este item pertence.
   *
   * Existe por causa do carrossel (19/09). Todo o resto da tabela é cobrado
   * por PEÇA, e está certo: um post de texto no LinkedIn e outro no Facebook
   * são duas redações, dois debitos. O carrossel não: as três redes que o
   * aceitam usam a mesma proporção e recebem a MESMA arte, gerada uma vez só.
   * Sem esta chave, um carrossel de cinco lâminas em três redes cobraria três
   * vezes por uma geração, treze vezes o custo real.
   */
  dia?: string | number | null;
  /** Quantas lâminas o carrossel daquele dia tem. Padrão histórico: 3. */
  laminas?: number;
};

/** O custo do TEXTO da peça, que é por rede sempre. */
function custoDoTexto(item: ItemCobravel): number {
  const linkNoX = item.platform === "twitter" && item.temLink;
  // O comentário de fontes no X é cobrado à parte porque o link custa US$ 0,20
  // na API deles, contra US$ 0,015 de um post sem link. É a operação de menor
  // margem do pipeline de texto, 23%.
  return CREDIT_COSTS.post_text + (linkNoX ? CREDIT_COSTS.x_sources_comment : 0);
}

/**
 * O custo da MÍDIA, e a unidade dele é a GERAÇÃO, nunca a rede.
 *
 * Esta é a regra que o carrossel já seguia e a imagem não seguia, e a
 * diferença entre as duas custava dinheiro do cliente. A esteira gera UMA arte
 * por PROPORÇÃO e recorta para cada rede do grupo (ver
 * lib/media/arte-por-rede.ts): um dia com Instagram, LinkedIn, Facebook e X
 * são duas gerações, 4:5 e 16:9, e dois recortes de cada.
 *
 * Até 19/09 a imagem era cobrada por rede, com um comentário aqui dizendo que
 * "cada proporção é uma geração de verdade". As duas coisas não podiam ser
 * verdade ao mesmo tempo, e era a cobrança que estava errada. Com o Gemini a
 * diferença era de centavos; com o GPT Image 2, a R$ 0,89 por geração, seriam
 * 168 créditos por um dia que custa R$ 1,78.
 *
 * Quem recebe recorte não paga geração.
 */
function custoDaMidia(mediaType: string | null, laminas?: number): number {
  switch (mediaType) {
    case "image":
    case "infographic":
      // Uma geração. Quantas delas o dia tem é decidido por quem soma, não
      // aqui: depende das redes do dia e da tabela de formatos.
      return CREDIT_COSTS.imagem_geracao;
    case "carousel":
      return CREDIT_COSTS.carousel_lamina * Math.max(3, laminas ?? 3);
    // Enquete, artigo e thread não geram mídia: o custo é só o do texto.
    default:
      return 0;
  }
}

/** Os tipos cuja mídia é uma arte por proporção. */
const GERA_ARTE = new Set(["image", "infographic"]);

export function custoDoItem(item: ItemCobravel): number {
  return custoDoTexto(item) + custoDaMidia(item.mediaType, item.laminas);
}

export function custoTotal(itens: ItemCobravel[]): number {
  /**
   * O TEXTO é por peça; a MÍDIA é por geração.
   *
   * Duas chaves de deduplicação, e as duas existem pelo mesmo motivo:
   *   . carrossel, uma arte por DIA (as três redes que o aceitam usam a mesma
   *     proporção, então recebem a mesma arte);
   *   . imagem, uma arte por DIA e PROPORÇÃO (quem cai no mesmo grupo de
   *     formato recebe recorte da mesma geração).
   */
  const midiaJaCobrada = new Set<string>();
  return itens.reduce((soma, item) => {
    const texto = custoDoTexto(item);

    if (item.mediaType === "carousel") {
      const chave = `carousel:${item.dia ?? "sem-dia"}`;
      if (midiaJaCobrada.has(chave)) return soma + texto;
      midiaJaCobrada.add(chave);
      return soma + texto + custoDaMidia("carousel", item.laminas);
    }

    if (GERA_ARTE.has(item.mediaType ?? "")) {
      const proporcao = formatoDaPeca(item.platform, item.mediaType!).proporcao;
      const chave = `arte:${item.dia ?? "sem-dia"}:${proporcao}`;
      if (midiaJaCobrada.has(chave)) return soma + texto;
      midiaJaCobrada.add(chave);
      return soma + texto + custoDaMidia(item.mediaType);
    }

    return soma + custoDoItem(item);
  }, 0);
}

/**
 * A ESTIMATIVA MUDOU DE CASA em 21/09, e o motivo esta em
 * `lib/credits/estimativa.ts`: a janela da campanha precisa da MESMA conta que
 * o servidor usa para recusar, e este arquivo importa coisas que nao entram
 * num componente cliente. Aqui fica a reexportacao, para quem ja chamava
 * `estimarCampanha` daqui continuar valendo.
 */
export { estimarCampanha, detalharCampanha, type DiaDaCampanha } from "@/lib/credits/estimativa";
