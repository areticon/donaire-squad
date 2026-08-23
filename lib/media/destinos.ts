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
  /**
   * A publicação de VÍDEO existe para esta rede?
   *
   * Não é firula, e o campo nasceu de um erro real: em 23/08, das cinco redes
   * que a tela oferecia, só o YouTube publicava vídeo. O Reels, o LinkedIn, o X
   * e o Facebook entraram no mesmo dia, cada um com o protocolo que a rede
   * exige (busca por URL na Meta, envio em pedaços no LinkedIn e no X).
   *
   * O campo continua porque a próxima rede vai nascer sem publicação de vídeo
   * também, e é melhor ela aparecer como "em breve" do que aceitar o clique e
   * falhar depois de o cliente aprovar.
   *
   * Oferecer destino que não publica é o mesmo erro que deixou o ramo do
   * YouTube inalcançável por dias sem ninguém notar. Aqui o destino aparece
   * como "em breve" em vez de aceitar o clique e falhar depois.
   */
  publicaVideo: boolean;
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
    publicaVideo: true,
  },
  {
    id: "instagram_reels",
    rotulo: "Instagram Reels",
    plataforma: "instagram",
    formato: "vertical",
    limiteSegundos: 90,
    publicaVideo: true,
  },
  {
    id: "linkedin",
    rotulo: "LinkedIn",
    plataforma: "linkedin",
    formato: "vertical",
    limiteSegundos: 600,
    publicaVideo: true,
  },
  {
    id: "x",
    rotulo: "X",
    plataforma: "twitter",
    formato: "vertical",
    // 140s é o teto de conta comum. Acima disso só assinante paga, e prometer
    // o que a conta do cliente não faz é pior que avisar antes.
    limiteSegundos: 140,
    publicaVideo: true,
  },
  {
    id: "facebook",
    rotulo: "Facebook",
    plataforma: "facebook",
    formato: "vertical",
    // A página aceita vídeo bem mais longo, mas 90s é o que rende: acima disso
    // o alcance cai porque deixa de competir como conteúdo curto.
    limiteSegundos: 90,
    publicaVideo: true,
  },
];

export const DESTINO_COMPLETO: Destino = {
  id: "youtube",
  rotulo: "YouTube",
  plataforma: "youtube",
  formato: "horizontal",
  limiteSegundos: null,
  publicaVideo: true,
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
