/**
 * ONDE A PEÇA CAI DENTRO DA REDE: feed, reel ou story.
 *
 * Pedido do Bruno em 21/09, e o maior dos três daquele dia: até aqui TODA peça
 * saía no feed, porque o publicador escolhia o endpoint só pelo `mediaType`.
 *
 * Duas ideias diferentes, e confundi-las é o que faz a tela prometer o que a
 * rede não aceita:
 *
 *   • `mediaType` é o que a peça É (texto, imagem, carrossel, vídeo);
 *   • o FORMATO é para onde ela vai (feed, reel, story).
 *
 * A MATRIZ NÃO É SIMÉTRICA, e este arquivo existe para que ela seja dita uma
 * vez só. Instagram e Facebook têm os três; LinkedIn e X só têm feed, porque o
 * LinkedIn desligou stories em 2021 e nenhum dos dois tem reels. Oferecer três
 * opções em todas as redes seria vender duas falhas.
 *
 * Nada disso é coluna nova: o destino vive em `metadata.formato`, do mesmo
 * jeito que `metadata.rede` já guarda a rede da adaptação.
 */

export type FormatoDeDestino = "feed" | "reel" | "story";

/**
 * O que cada rede aceita, conferido na doc das APIs em 21/09.
 *
 * Instagram: feed e reels já publicam (`publishInstagramReels`); story é
 * `media_type: STORIES` no mesmo endpoint de container.
 * Facebook: feed já publica; reels de página (`/video_reels`) e stories de
 * página (`/photo_stories`, `/video_stories`) existem na Graph API.
 * LinkedIn e X: feed, e nada além dele.
 * YouTube: a esteira de gravação publica vídeo, e "feed" aqui é o canal.
 */
export const FORMATOS_DA_REDE: Record<string, FormatoDeDestino[]> = {
  instagram: ["feed", "reel", "story"],
  facebook: ["feed", "reel", "story"],
  linkedin: ["feed"],
  twitter: ["feed"],
  x: ["feed"],
  // Desde 29/09 o YouTube tem dois lugares: o vídeo do canal ("feed") e o
  // Shorts, que aqui mora como "reel" porque é a mesma coisa para a esteira:
  // vertical e curto. A API do YouTube não tem um campo "Shorts"; o vídeo em
  // pé e de até 3 minutos vira Shorts sozinho, então o que a escolha muda é a
  // proporção pedida na geração (ver `proporcaoDoDia`).
  youtube: ["feed", "reel"],
  // O TikTok é vídeo vertical e nada mais; "feed" aqui é o perfil.
  tiktok: ["feed"],
};

/** O que a rede aceita. Rede desconhecida só recebe feed, que toda rede tem. */
export function formatosDaRede(platform: string): FormatoDeDestino[] {
  return FORMATOS_DA_REDE[(platform ?? "").toLowerCase()] ?? ["feed"];
}

export function redeAceitaFormato(platform: string, formato: FormatoDeDestino): boolean {
  return formatosDaRede(platform).includes(formato);
}

/**
 * O formato que vale de verdade para esta rede.
 *
 * Pedido inválido cai em feed em vez de estourar: a escolha pode ter vindo de
 * uma campanha antiga, de uma rede que o cliente conectou depois, ou de um
 * post levado para outra rede (o "adaptar para outra rede" de 21/09). Feed é o
 * único destino que todas as redes têm, então é o fundo seguro.
 */
export function formatoValido(platform: string, formato: unknown): FormatoDeDestino {
  const f = typeof formato === "string" ? (formato.toLowerCase() as FormatoDeDestino) : "feed";
  return redeAceitaFormato(platform, f) ? f : "feed";
}

/**
 * OS DESTINOS ESCOLHIDOS para a rede, que podem ser vários (28/09).
 *
 * Pedido do Bruno: "para as redes que têm mais de um lugar (story, reel e
 * feed) ele deve conseguir marcar e postar nos 3 lugares se quiser". A janela
 * passou a mandar uma lista; campanha antiga mandava um texto só. Os dois
 * viram lista aqui, sem repetido, só com o que a rede aceita, e nunca vazia.
 */
export function destinosDaRede(platform: string, valor: unknown): FormatoDeDestino[] {
  const lista = Array.isArray(valor) ? valor : valor ? [valor] : [];
  const validos = [...new Set(lista.map((v) => formatoValido(platform, v)))];
  return validos.length ? validos : ["feed"];
}

/** O formato guardado no post, lido de onde ele mora. */
export function formatoDoPost(metadata: unknown, platform: string): FormatoDeDestino {
  const meta = (metadata ?? null) as { formato?: unknown } | null;
  return formatoValido(platform, meta?.formato);
}

/* ── O que o formato muda ANTES da publicação ────────────────────────────── */

/**
 * REEL E STORY SÃO VERTICAIS, e isso muda a GERAÇÃO, não só o endpoint.
 *
 * O reel do Instagram pede 9:16 e de 5 a 90 segundos; story é 9:16 também. A
 * esteira gera vídeo em 16:9 por padrão (`proporcao: "16:9"` em executar.ts),
 * então escolher reel sem mexer na geração entregaria um vídeo deitado dentro
 * de uma moldura em pé, com tarja em cima e embaixo, que é a cara de conteúdo
 * reaproveitado sem cuidado.
 */
export function ehVertical(formato: FormatoDeDestino): boolean {
  return formato === "reel" || formato === "story";
}

/**
 * A PROPORÇÃO DO VÍDEO DO DIA, quando as redes do dia querem coisas
 * diferentes.
 *
 * O dia gera UM vídeo e as quatro redes o dividem. Se o Instagram vai de reel
 * e o LinkedIn de feed, alguém cede: gerar dois vídeos seria pagar duas vezes
 * (um vídeo de 64 s custa R$ 51,84, então o dia passaria de R$ 100).
 *
 * Cede o feed, e por um motivo que não é gosto: vídeo vertical PUBLICA no feed
 * do LinkedIn e do X, só ocupando menos largura; vídeo deitado num reel é
 * recusado ou tarjado. Entre perder um pouco de largura e não publicar, a
 * escolha se faz sozinha. A tela avisa antes, porque é consequência que o
 * cliente precisa saber quando marca reel numa rede só.
 */
export function proporcaoDoDia(formatos: FormatoDeDestino[]): "16:9" | "9:16" {
  return formatos.some(ehVertical) ? "9:16" : "16:9";
}

/* ── O que o cliente precisa ler ANTES de escolher ───────────────────────── */

export const ROTULO_DO_FORMATO: Record<FormatoDeDestino, string> = {
  feed: "Feed",
  reel: "Reel",
  story: "Story",
};

/**
 * O NOME DO LUGAR DITO COMO A REDE DIZ (29/09, item 13).
 *
 * "Feed" é a palavra da Meta. No YouTube o feed é o vídeo do canal e o reel
 * é o Shorts; no TikTok é o vídeo; no LinkedIn é o post; no X, post ou
 * thread. O valor gravado continua o mesmo (`metadata.formato`), porque é
 * ele que o publicador lê: só o rótulo muda, para o cliente reconhecer a
 * rede dele na tela em vez de aprender o vocabulário de outra.
 */
export function rotuloDoFormatoNaRede(platform: string, formato: FormatoDeDestino): string {
  const rede = (platform ?? "").toLowerCase();
  if (rede === "youtube") return formato === "reel" ? "Shorts" : "Vídeo";
  if (rede === "tiktok") return "Vídeo";
  if (rede === "linkedin") return "Post";
  if (rede === "twitter" || rede === "x") return "Post ou thread";
  if (formato === "reel") return "Reels";
  if (formato === "story") return "Stories";
  return ROTULO_DO_FORMATO[formato];
}

/**
 * O aviso de cada formato, dito antes da escolha e não depois.
 *
 * O do story é o que importa: 24 horas. Um carrossel de cinco lâminas ou um
 * vídeo de 60 s publicado ali é peça cara num destino que apaga, e quem paga
 * por geração precisa saber disso antes de gastar, e não no dia seguinte.
 */
export function avisoDoFormato(formato: FormatoDeDestino): string | null {
  switch (formato) {
    case "story":
      return "Story some em 24 horas. Peça cara (carrossel ou vídeo longo) publicada aqui não fica no perfil.";
    case "reel":
      return "Reel é vertical (9:16) e de 5 a 90 segundos. O vídeo do dia passa a ser gerado em pé, inclusive para as outras redes.";
    default:
      return null;
  }
}

/**
 * O que vale por rede numa campanha, a partir da escolha da janela.
 *
 * A escolha é um PADRÃO POR REDE que vale a semana inteira (decisão do Bruno
 * em 21/09), e não uma grade de sete dias por quatro redes: são 4 escolhas em
 * vez de 28, e a esteira já sabe a proporção do vídeo antes de gerar. Um dia
 * específico que saia errado se conserta refazendo aquela peça.
 */
export function formatosEscolhidos(
  redes: string[],
  escolha: Record<string, string> | undefined
): Record<string, FormatoDeDestino> {
  const saida: Record<string, FormatoDeDestino> = {};
  for (const rede of redes) saida[rede] = formatoValido(rede, escolha?.[rede]);
  return saida;
}
