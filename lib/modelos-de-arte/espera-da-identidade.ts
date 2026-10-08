import { MENSAGEM_AGUARDANDO } from "@/lib/modelos-de-arte/identidade";

/**
 * A ESPERA DA IDENTIDADE, em um lugar só (05/10/2026, noite).
 *
 * O caso que motivou: o Bruno criou um carrossel para o X por "Nova
 * campanha" (post único). A esteira só chamava a Diana quando havia post do
 * LinkedIn no dia (`needsMedia = designer && liPost && ...`, desde o primeiro
 * commit), então o dia do X saiu sem arte, sem a marca de espera e sem o
 * card da Diana. O quadro disse "esperando você aprovar" sobre um post sem
 * arte, e ele perguntou "como eu aprovo?".
 *
 * Todo caminho que cria ou refaz uma peça com arte (esteira, campanha de um
 * post, "pôr algo aqui", semana do vídeo, chat do card, refazer peça) passa
 * por aqui para marcar a espera do mesmo jeito, e toda tela lê a espera com
 * a mesma função. Este arquivo é PURO (sem banco, sem fs): componente de
 * cliente importa daqui.
 *
 * As marcas no metadata do post (e do card da Diana):
 *   - `aguardandoIdentidade: true`: a arte não foi gerada de propósito, sem
 *     gastar, até o cliente aprovar modelo, letra e cores;
 *   - `gerandoArte: { desde }`: o "Aprovar e gerar" começou a desenhar esta
 *     arte (o quadro mostra "o squad está fazendo");
 *   - `arteFalhou: { motivo, em }`: a geração depois da aprovação não saiu;
 *     o quadro diz o motivo e oferece "Tentar de novo".
 * Quando a arte sai, as três somem (lib/media/artes-aguardando-identidade.ts).
 */

/** O texto do card da Diana quando a arte espera a identidade. A tela reconhece pelo começo. */
// 08/10: o estilo é escrito no chat ou escolhido na biblioteca (aba Estilo dos posts), e já fica aprovado.
export const TEXTO_DO_CARD_AGUARDANDO = `${MENSAGEM_AGUARDANDO}: escreva como quer o estilo dos posts ou escolha um da biblioteca em Configurações (aba Estilo dos posts). Nenhum crédito de imagem foi gasto; a arte sai depois da escolha.`;

/** O rótulo do botão que leva à escolha, igual em todo card. */
export const ROTULO_DO_BOTAO_ESCOLHER = "Escolher e aprovar";

/** O card da Diana com o prompt guardado depois do aviso (a tela separa pelo "Prompt: "). */
export function conteudoDoCardAguardando(prompt: string): string {
  return `${TEXTO_DO_CARD_AGUARDANDO}\n\nPrompt: ${prompt}`;
}

/** Os tipos de peça cuja mídia é uma arte gerada (e por isso espera a identidade). */
export const TIPOS_QUE_GERAM_ARTE: ReadonlySet<string> = new Set(["image", "infographic", "carousel"]);

export function tipoGeraArte(mediaType: string | null | undefined): boolean {
  return TIPOS_QUE_GERAM_ARTE.has(mediaType ?? "");
}

/**
 * O dia pede a Diana quando o tipo tem arte e o cliente não subiu material
 * próprio. Não depende de haver post do LinkedIn: o X sozinho também tem arte.
 */
export function diaPedeArte(resolvedType: string, temMaterialProprio: boolean): boolean {
  return !["text", "poll", "thread"].includes(resolvedType) && !temMaterialProprio;
}

/**
 * A peça de que a Diana parte no dia: o LinkedIn quando existe (o texto mais
 * longo), senão o X, senão qualquer peça do dia. Antes de 05/10 a Diana só
 * existia com o LinkedIn, e a campanha só de X saía sem arte nenhuma.
 */
export function pecaBaseDoDia<T>(liPost: T | undefined, twPost: T | undefined, outras: T[]): T | undefined {
  return liPost ?? twPost ?? outras[0];
}

type Meta = Record<string, unknown>;

function objeto(meta: unknown): Meta {
  return meta && typeof meta === "object" && !Array.isArray(meta) ? { ...(meta as Meta) } : {};
}

/** Marca a espera: a arte fica para depois da aprovação. */
export function marcarEspera(meta: unknown): Meta {
  const m = objeto(meta);
  delete m.gerandoArte;
  delete m.arteFalhou;
  return { ...m, aguardandoIdentidade: true };
}

/** Marca que o "Aprovar e gerar" começou a desenhar esta arte. */
export function marcarGerando(meta: unknown, agora: Date = new Date()): Meta {
  const m = objeto(meta);
  delete m.arteFalhou;
  return { ...m, aguardandoIdentidade: true, gerandoArte: { desde: agora.toISOString() } };
}

/** Marca que a geração depois da aprovação não saiu, com o motivo que o quadro mostra. */
export function marcarFalha(meta: unknown, motivo: string, agora: Date = new Date()): Meta {
  const m = objeto(meta);
  delete m.gerandoArte;
  return { ...m, aguardandoIdentidade: true, arteFalhou: { motivo: motivo.slice(0, 200), em: agora.toISOString() } };
}

/** Tira todas as marcas: a arte saiu. */
export function semEspera(meta: unknown): Meta {
  const m = objeto(meta);
  delete m.aguardandoIdentidade;
  delete m.gerandoArte;
  delete m.arteFalhou;
  return m;
}

export type EstadoDaEspera = "aguardando" | "gerando" | "falhou";

export interface EsperaDaIdentidade {
  estado: EstadoDaEspera;
  /** O motivo da falha, quando falhou. */
  motivo?: string;
  /**
   * Quando falhou (07/10): o post e a marca da ocorrência (`arteFalhou.em`, ou
   * o começo da geração que passou do teto). É a chave do descarte do aviso
   * "A arte não saiu" (lib/avisos/chaves.ts): uma falha nova volta a aparecer.
   */
  postId?: string;
  em?: string;
  /**
   * Quando aguarda (07/10): o LOTE de onde a peça veio (a campanha, ou o
   * vídeo, ou o próprio post avulso). É a ocorrência do aviso "Aguardando o
   * estilo dos posts": a leva nova, depois de a aprovação cair, volta a explicar.
   */
  lote?: string;
}

/** Depois disto sem terminar, a geração conta como falha: o cliente ganha o "Tentar de novo" em vez de um "fazendo" eterno. */
export const TETO_DA_GERACAO_MS = 20 * 60 * 1000;

/**
 * Como a tela lê a espera de um post: nulo quando a arte existe ou o post
 * nunca esperou. "gerando" vira "falhou" quando passou do teto sem terminar.
 */
export function esperaDaIdentidade(post: { id?: string; runId?: string | null; imageUrl?: string | null; metadata?: unknown }, agora: Date = new Date()): EsperaDaIdentidade | null {
  if (post.imageUrl) return null;
  const m = objeto(post.metadata) as { aguardandoIdentidade?: unknown; gerandoArte?: { desde?: unknown }; arteFalhou?: { motivo?: unknown; em?: unknown }; videoJobId?: unknown };
  if (m.aguardandoIdentidade !== true) return null;
  // De qual post e desde quando (07/10), só quando a tela mandou o id.
  const ocorrencia = (em: unknown) => (post.id ? { postId: post.id, ...(typeof em === "string" ? { em } : {}) } : {});
  if (m.arteFalhou && typeof m.arteFalhou === "object") {
    return { estado: "falhou", motivo: typeof m.arteFalhou.motivo === "string" ? m.arteFalhou.motivo : "a arte não saiu", ...ocorrencia(m.arteFalhou.em) };
  }
  if (m.gerandoArte && typeof m.gerandoArte === "object") {
    const desde = typeof m.gerandoArte.desde === "string" ? new Date(m.gerandoArte.desde).getTime() : NaN;
    if (Number.isNaN(desde) || agora.getTime() - desde > TETO_DA_GERACAO_MS) return { estado: "falhou", motivo: "a geração não terminou no tempo esperado", ...ocorrencia(m.gerandoArte.desde) };
    return { estado: "gerando" };
  }
  // O lote (07/10), só quando a tela mandou o id: a campanha, o vídeo ou o post.
  if (!post.id) return { estado: "aguardando" };
  return { estado: "aguardando", lote: post.runId || (typeof m.videoJobId === "string" && m.videoJobId) || post.id };
}

/**
 * A espera que manda numa peça com vários posts (as redes do dia): falhou
 * ganha de gerando, que ganha de aguardando.
 */
export function esperaDaPeca(posts: Array<{ id?: string; runId?: string | null; imageUrl?: string | null; metadata?: unknown }>, agora: Date = new Date()): EsperaDaIdentidade | null {
  const esperas = posts.map((p) => esperaDaIdentidade(p, agora)).filter((e): e is EsperaDaIdentidade => Boolean(e));
  if (!esperas.length) return null;
  return esperas.find((e) => e.estado === "falhou") ?? esperas.find((e) => e.estado === "gerando") ?? esperas[0];
}

/**
 * A chave do grupo de artes: as redes do mesmo dia da mesma campanha recebem
 * a mesma arte. O post avulso (sem campanha) é um grupo sozinho, e não um
 * balaio "sem-run" com todos os avulsos juntos.
 */
export function chaveDoGrupo(a: { postId: string; runId: string | null; dayOfWeek: number | null; mediaType: string }): string {
  return a.runId ? `${a.runId}:${a.dayOfWeek ?? 0}:${a.mediaType}` : `avulso:${a.postId}`;
}

/** Quantas ARTES (grupos) estão esperando, que é o número que a galeria mostra. */
export function contarArtesEsperando(artes: Array<{ postId: string; runId: string | null; dayOfWeek: number | null; mediaType: string }>): number {
  return new Set(artes.map(chaveDoGrupo)).size;
}

export type OQueMudou = "modelo" | "letra" | "cores" | "fotos";

/** O aviso na hora, quando o cliente troca algo depois de aprovar (ou com artes esperando). */
export function avisoDaTroca(oQue: OQueMudou, artesEsperando: number, estavaAprovada: boolean): string {
  const coisa = { modelo: "os modelos", letra: "a letra", cores: "as cores", fotos: "as fotos" }[oQue];
  const inicio = estavaAprovada ? `Você trocou ${coisa}: a identidade precisa ser aprovada de novo.` : `Você trocou ${coisa}.`;
  const espera = artesEsperando > 0 ? ` ${artesEsperando === 1 ? "1 arte está esperando" : `${artesEsperando} artes estão esperando`} a aprovação para sair.` : estavaAprovada ? " Nada é gerado até você aprovar." : "";
  return `${inicio}${espera}`;
}

/** A frase da caixa de confirmação depois de "Aprovar e gerar". */
export function fraseDaAprovacao(artesIniciadas: number): string {
  if (artesIniciadas <= 0) return "Identidade aprovada. As próximas artes já saem assim.";
  return artesIniciadas === 1
    ? "Identidade aprovada. 1 arte está sendo gerada e cai no quadro em alguns minutos."
    : `Identidade aprovada. ${artesIniciadas} artes estão sendo geradas e caem no quadro em alguns minutos.`;
}
