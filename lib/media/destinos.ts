/**
 * Para onde cada corte pode ir, e em que formato.
 *
 * Decisão do Bruno em 23/08: **corte sempre na vertical, e o vídeo completo do
 * YouTube na horizontal.** Por isso a lista abaixo não oferece escolha de
 * formato ao cliente: cada destino já sabe o que consome. Perguntar "vertical
 * ou horizontal?" seria empurrar para ele uma decisão que o produto tem que
 * tomar sozinho.
 *
 * Mora em módulo sem import de servidor porque a tela usa: puxar o Prisma para
 * cá mandaria o driver do banco para o bundle do navegador, armadilha que este
 * projeto já pagou.
 */

export type Destino = {
  id: string;
  rotulo: string;
  /** A plataforma como o resto do sistema a chama, para casar com a conexão. */
  plataforma: string;
  formato: "vertical" | "horizontal";
  /** Teto de duração da plataforma, em segundos. Null quando não há. */
  limiteSegundos: number | null;
};

export const DESTINOS_DE_CORTE: Destino[] = [
  {
    id: "youtube_shorts",
    rotulo: "YouTube Shorts",
    plataforma: "youtube",
    formato: "vertical",
    // O Shorts corta em 3 minutos. Acima disso o vídeo entra como vídeo comum,
    // sem o alcance do formato, que é o motivo de alguém escolher Shorts.
    limiteSegundos: 180,
  },
  {
    id: "instagram_reels",
    rotulo: "Instagram Reels",
    plataforma: "instagram",
    formato: "vertical",
    limiteSegundos: 90,
  },
  {
    id: "linkedin",
    rotulo: "LinkedIn",
    plataforma: "linkedin",
    formato: "vertical",
    limiteSegundos: 600,
  },
  {
    id: "x",
    rotulo: "X",
    plataforma: "twitter",
    formato: "vertical",
    // 140s é o teto de conta comum. Acima disso só assinante paga, e prometer
    // o que a conta do cliente não faz é pior que avisar antes.
    limiteSegundos: 140,
  },
  {
    id: "facebook",
    rotulo: "Facebook",
    plataforma: "facebook",
    formato: "vertical",
    limiteSegundos: 90,
  },
];

export const DESTINO_COMPLETO: Destino = {
  id: "youtube",
  rotulo: "YouTube",
  plataforma: "youtube",
  formato: "horizontal",
  limiteSegundos: null,
};

export function destinoPorId(id: string): Destino | undefined {
  return id === DESTINO_COMPLETO.id
    ? DESTINO_COMPLETO
    : DESTINOS_DE_CORTE.find((d) => d.id === id);
}

/**
 * O corte cabe neste destino?
 *
 * Avisar antes vale mais que falhar na publicação: o cliente descobre na hora
 * de escolher, e não depois de aprovar e esperar.
 */
export function cabeNoDestino(duracaoSec: number, destino: Destino): boolean {
  return destino.limiteSegundos === null || duracaoSec <= destino.limiteSegundos;
}
