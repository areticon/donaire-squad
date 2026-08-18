import { CREDIT_COSTS } from "@/lib/stripe";

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
};

/** Tipos de mídia que o pipeline produz e o que cada um custa. */
function custoPorMidia(mediaType: string | null): number {
  switch (mediaType) {
    case "image":
      return CREDIT_COSTS.post_image;
    case "carousel":
      return CREDIT_COSTS.carousel_3;
    case "infographic":
      // Infográfico é uma imagem gerada, mesma família de custo.
      return CREDIT_COSTS.post_image;
    // Enquete, artigo e thread não geram mídia: o custo é o do texto.
    case "poll":
    case "article":
    case "thread":
    case "text":
    default:
      return CREDIT_COSTS.post_text;
  }
}

export function custoDoItem(item: ItemCobravel): number {
  const base = custoPorMidia(item.mediaType);
  const linkNoX = item.platform === "twitter" && item.temLink;
  // O comentário de fontes no X é cobrado à parte porque o link custa US$ 0,20
  // na API deles, contra US$ 0,015 de um post sem link. É a operação de menor
  // margem do pipeline de texto, 23%.
  return base + (linkNoX ? CREDIT_COSTS.x_sources_comment : 0);
}

export function custoTotal(itens: ItemCobravel[]): number {
  return itens.reduce((soma, i) => soma + custoDoItem(i), 0);
}

/**
 * Estimativa antes de rodar, para checar saldo sem gastar com a API.
 *
 * Superestima de propósito: assume que todo dia agendado vira post nas redes
 * conectadas e que "free" custa como imagem, que é o cenário mais caro. Barrar
 * quem não tem saldo é o objetivo; deixar passar quem tem é o efeito colateral
 * aceitável, porque a cobrança real acontece depois, pelo que foi entregue.
 */
export function estimarCampanha(
  diasAgendados: Array<string | undefined>,
  redesConectadas: number
): number {
  const porDia = diasAgendados.reduce((soma, tipo) => {
    const midia = tipo === "free" ? "image" : (tipo ?? "text");
    return soma + custoPorMidia(midia);
  }, 0);
  return porDia * Math.max(1, redesConectadas);
}
