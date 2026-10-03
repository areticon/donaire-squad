/**
 * O QUE A PEÇA É, em duas palavras, no calendário.
 *
 * Pedido do Bruno em 21/09: "o card do dia precisa dizer que tipo de peça é".
 * O tipo sempre esteve no banco (`Post.mediaType` e `CampaignCard.mediaType`:
 * text, image, video, carousel, infographic, poll, article, thread) e nunca
 * foi desenhado no calendário. Ele aparecia só de lado, no rótulo do botão da
 * capa ("vídeo", "5 lâminas"), e sumia inteiro quando a peça era texto,
 * enquete ou artigo, que são justamente as que não têm capa.
 *
 * Quem olha a semana não conseguia responder "que dia sai o carrossel?" sem
 * abrir card por card.
 *
 * O FORMATO entra na mesma etiqueta desde o mesmo dia: dizer "Vídeo" quando a
 * peça vai para o reel do Instagram é meia verdade, e a outra metade é a que
 * muda a proporção e o alcance.
 */
import type { FormatoDeDestino } from "@/lib/publish/formato-de-destino";

/** O nome de cada tipo, curto o bastante para um cartão de 110 pixels. */
const NOME_DO_TIPO: Record<string, string> = {
  text: "Texto",
  image: "Imagem",
  video: "Vídeo",
  carousel: "Carrossel",
  infographic: "Infográfico",
  poll: "Enquete",
  article: "Artigo",
  thread: "Thread",
};

export interface EtiquetaDaPeca {
  /** "Carrossel", "Vídeo", "Enquete". */
  tipo: string;
  /** "5 lâminas", "60 s", quando o número muda a leitura da semana. */
  detalhe: string | null;
  /** "Reel", "Story". Nulo no feed, que é o destino comum e não precisa ser dito. */
  formato: string | null;
}

/**
 * A etiqueta de uma peça.
 *
 * O detalhe só aparece quando ele responde uma pergunta de quem olha a semana:
 * quantas lâminas tem o carrossel (é o que decide o custo e o trabalho de
 * revisar) e quantos segundos tem o vídeo. Escrever "Imagem · 1 imagem" seria
 * ocupar a linha para não dizer nada.
 */
export function etiquetaDaPeca(args: {
  mediaType: string | null | undefined;
  /** Quantas lâminas o carrossel tem de verdade, contadas na mídia. */
  laminas?: number;
  /** A duração do vídeo, quando conhecida. */
  segundos?: number | null;
  formato?: FormatoDeDestino | null;
}): EtiquetaDaPeca {
  const tipo = NOME_DO_TIPO[args.mediaType ?? "text"] ?? "Post";

  let detalhe: string | null = null;
  if (args.mediaType === "carousel" && args.laminas && args.laminas > 1) {
    detalhe = `${args.laminas} lâminas`;
  } else if (args.mediaType === "video" && args.segundos && args.segundos > 0) {
    detalhe = `${args.segundos} s`;
  }

  return {
    tipo,
    detalhe,
    formato: args.formato && args.formato !== "feed" ? (args.formato === "reel" ? "Reel" : "Story") : null,
  };
}

/** A etiqueta numa linha só, para título de acessibilidade e para o tooltip. */
export function etiquetaEmTexto(e: EtiquetaDaPeca): string {
  return [e.tipo, e.detalhe, e.formato].filter(Boolean).join(" · ");
}
