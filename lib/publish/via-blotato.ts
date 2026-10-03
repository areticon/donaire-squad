import type { Post, SocialAccount } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  chaveDoBlotato,
  criarPost,
  enviarArquivo,
  ErroDoBlotato,
  esperarEnvio,
  statusDoPost,
  type AlvoDoBlotato,
  type PedidoDePost,
  type RedeDoBlotato,
  type StatusDoEnvio,
} from "@/lib/blotato";
import { lerVinculo, type VinculoBlotato } from "@/lib/publish/roteador";
import { formatoDoPost, type FormatoDeDestino } from "@/lib/publish/formato-de-destino";
import { parseTwitterThread } from "@/lib/oauth/twitter";
import { INSTAGRAM_MAX_CAPTION } from "@/lib/oauth/instagram";
import type { OpcoesDoTikTok } from "@/lib/oauth/tiktok";
import {
  buildArticlePublicUrl,
  newArticlePublicToken,
  parseLinkedInArticleContent,
} from "@/lib/articles/linkedin-article";
import { abrirMidia, ehPublica } from "@/lib/media/storage";

/**
 * PUBLICAR PELO BLOTATO, gravando no post o MESMO que a API própria grava
 * (30/09): status, `externalUrl`, `externalId`, `publishedAt` e o motivo da
 * falha em `metadata.error`. A tela não sabe por onde o post saiu, e não
 * precisa saber.
 *
 * ## O NOME DO FORNECEDOR NÃO VAI PARA O POST
 *
 * Regra do Bruno de 21/09: o cliente não lê operação interna (qual fornecedor,
 * chave, assinatura). Tudo que fica gravado no post e chega à tela usa nomes
 * neutros: o envio em andamento é `externalId = "ponte:<número>"` e
 * `metadata.ponte`, e o erro é uma frase com CÓDIGO (PUB-...). O detalhe de
 * verdade vai para o log do servidor com o prefixo [blotato], e o painel do
 * Blotato guarda cada falha em my.blotato.com/failed.
 *
 * ## A PUBLICAÇÃO DELES É ASSÍNCRONA
 *
 * O POST /posts só devolve o número do envio. A rede publica depois, e o
 * resultado (link ou motivo) vem na consulta de status. Aqui se espera um
 * teto curto; o que não terminar fica "publishing" com o número gravado, e o
 * cron confere a cada 5 minutos (`conferirEnviosPendentes`). Gravar o número
 * ANTES de esperar é o que impede o post repetido: a API não tem chave de
 * idempotência, e uma nova tentativa sem olhar o envio anterior publicaria
 * duas vezes no perfil do cliente.
 */

export const PREFIXO_DO_ENVIO = "ponte:";

/** Envio que a rede não confirmou neste prazo vira falha, com aviso de conferir. */
const PRAZO_DO_ENVIO_MS = 3 * 60 * 60 * 1000;

/** Teto de arquivo no plano Starter do Blotato (Creator e Agency: 1 GB). */
const TETO_DE_ARQUIVO = 400 * 1024 * 1024;

export type CodigoDaPonte = "PUB-INT" | "PUB-CFG" | "PUB-LIM" | "PUB-MID" | "PUB-FMT" | "PUB-REDE" | "PUB-ESP";

/**
 * Falha com duas faces: `message` é o que a tela mostra (sem fornecedor),
 * `interno` é o diagnóstico para o log.
 */
export class FalhaNaPonte extends Error {
  constructor(
    readonly codigo: CodigoDaPonte,
    mensagem: string,
    readonly interno: string
  ) {
    super(`${mensagem} (código ${codigo})`);
    this.name = "FalhaNaPonte";
  }
}

const FRASE_INDISPONIVEL =
  "A publicação nesta rede está indisponível no momento. Já estamos tratando, e tentar de novo agora não muda o resultado";

/** Traduz erro da API para a frase da tela, guardando o bruto para o log. */
function falhaDaApi(e: unknown, etapa: string): FalhaNaPonte {
  if (e instanceof FalhaNaPonte) return e;
  const bruto = e instanceof Error ? e.message : String(e);
  const status = e instanceof ErroDoBlotato ? e.status : -1;
  const interno = `[${etapa}] ${bruto}${e instanceof ErroDoBlotato && e.corpo ? ` | corpo: ${e.corpo.slice(0, 500)}` : ""}`;
  if (status === 0 || status === 401 || status === 403) return new FalhaNaPonte("PUB-INT", FRASE_INDISPONIVEL, interno);
  if (status === 429) {
    return new FalhaNaPonte("PUB-LIM", "A rede está recebendo muitas publicações agora. Tente de novo em alguns minutos", interno);
  }
  if (status === 400 || status === 422) {
    return new FalhaNaPonte("PUB-FMT", "A rede recusou o formato desta peça. Abra um chamado com o código para revisarmos", interno);
  }
  return new FalhaNaPonte("PUB-INT", FRASE_INDISPONIVEL, interno);
}

/**
 * O motivo que a REDE deu, quando ele serve ao cliente ("vídeo curto demais",
 * "proporção não aceita"). Some quando fala de coisa nossa (fornecedor, plano,
 * chave, crédito), porque aí não é informação dele.
 */
function motivoDaRede(msg: string | undefined): string {
  const m = (msg ?? "").trim();
  if (!m) return "";
  if (/blotato|subscription|billing|plan\b|credit|api key|apikey|\b40[13]\b|\b429\b/i.test(m)) return "";
  return ` Motivo informado pela rede: ${m.slice(0, 200)}.`;
}

/* ── O que cada rede recebe ─────────────────────────────────────────────── */

/** O que esta ponte não sabe fazer. Com token próprio, a peça sai pela API da rede. */
export function naoFazPelaPonte(post: Pick<Post, "mediaType">, platform: string): string | null {
  if (platform === "linkedin" && post.mediaType === "poll") return "enquete do LinkedIn";
  return null;
}

/** As mídias da peça, na ordem em que a rede vai recebê-las, ainda sem URL pública. */
export function fontesDaPeca(
  post: Pick<Post, "imageUrl" | "mediaType">,
  platform: string,
  formato: FormatoDeDestino
): string[] {
  const mediaType = post.mediaType ?? "text";
  const todas = (post.imageUrl ?? "").split("|").filter(Boolean);
  const usaveis = todas.filter((u) => u.startsWith("https://") || u.startsWith("data:"));
  if (mediaType === "video") return usaveis.slice(0, 1);
  if (mediaType === "article" || mediaType === "poll") return [];
  if (platform === "youtube" || platform === "tiktok") return [];
  if (formato === "story" && (platform === "instagram" || platform === "facebook")) return usaveis.slice(0, 1);
  if (platform === "twitter") {
    if (mediaType === "carousel") return usaveis.slice(0, 4);
    return mediaType === "image" || mediaType === "infographic" ? usaveis.slice(0, 1) : [];
  }
  if (platform === "linkedin") {
    // Carrossel do LinkedIn pelo Blotato é documento de 2 a 10 páginas.
    if (mediaType === "carousel") return usaveis.slice(0, 10);
    return mediaType === "image" || mediaType === "infographic" ? usaveis.slice(0, 1) : [];
  }
  // Instagram e Facebook: carrossel de até 10.
  return usaveis.slice(0, 10);
}

type Montagem = { pedido: PedidoDePost; avisos: string[] };

/**
 * Monta o corpo do POST /posts. Função pura: recebe as mídias JÁ com URL
 * pública, para o teste conferir o corpo sem rede.
 */
export function montarPedido(args: {
  post: Pick<Post, "content" | "mediaType" | "imageUrl" | "metadata">;
  conta: Pick<SocialAccount, "platform" | "accountType">;
  vinculo: VinculoBlotato;
  midias: string[];
  /** LinkedIn artigo: a página pública do artigo, que vai no texto. */
  urlDoArtigo?: string | null;
  /** YouTube: a capa escolhida, já pública. */
  capa?: string | null;
}): Montagem {
  const { post, conta, vinculo, midias } = args;
  const plataforma = conta.platform as RedeDoBlotato;
  const texto = post.content ?? "";
  const mediaType = post.mediaType ?? "text";
  const metadata = (post.metadata ?? null) as Record<string, unknown> | null;
  const formato = formatoDoPost(metadata, conta.platform);
  const avisos: string[] = [];

  const pedido = (text: string, target: AlvoDoBlotato, extra: Partial<PedidoDePost["post"]["content"]> = {}): PedidoDePost => ({
    post: {
      accountId: vinculo.contaId,
      content: { text, mediaUrls: midias, platform: plataforma, ...extra },
      target,
    },
  });

  switch (conta.platform) {
    case "twitter": {
      // A mesma leitura de thread da API própria (oauth-post.ts), para a peça
      // sair igual pelos dois caminhos.
      if (mediaType === "thread" || /\n\d+[\/\)]\s/.test(texto)) {
        const tweets = parseTwitterThread(texto).map((t) => t.slice(0, 280));
        if (tweets.length > 1) {
          return {
            pedido: pedido(tweets[0], { targetType: "twitter" }, {
              // A mídia vai só no primeiro tweet, como na API própria.
              additionalPosts: tweets.slice(1).map((t) => ({ text: t, mediaUrls: [] })),
            }),
            avisos,
          };
        }
      }
      const principal = texto.split(/\n(?=\d+\/)/).map((t) => t.trim()).filter(Boolean)[0] ?? texto;
      return { pedido: pedido(principal.slice(0, 280), { targetType: "twitter" }), avisos };
    }

    case "linkedin": {
      if (conta.accountType === "organization" && !vinculo.paginaId) {
        // Sem a página, o Blotato publica no PERFIL de quem conectou: a peça da
        // empresa sairia no nome de uma pessoa. Melhor parar.
        throw new FalhaNaPonte(
          "PUB-CFG",
          "Esta página do LinkedIn ainda não está pronta para publicar. Abra um chamado com o código",
          "Conta LinkedIn de organização ligada sem a página: rode scripts/blotato-contas.mts ligar com --pagina."
        );
      }
      const alvo: AlvoDoBlotato = { targetType: "linkedin", ...(vinculo.paginaId ? { pageId: vinculo.paginaId } : {}) };
      if (typeof metadata?.firstComment === "string" && metadata.firstComment.trim()) {
        avisos.push("O primeiro comentário com as fontes não sai por esta conexão: cole-o no post, se quiser.");
      }
      if (mediaType === "article" && args.urlDoArtigo) {
        // A API própria publica o artigo como cartão de link; aqui o link vai
        // no fim do texto, e o LinkedIn monta o cartão sozinho pela página.
        const meta = metadata as { articleTitle?: string; articleTeaser?: string; linkedinFeedIntro?: string } | null;
        const parsed = parseLinkedInArticleContent(texto);
        const intro = meta?.linkedinFeedIntro?.trim() || meta?.articleTeaser?.trim() || parsed.teaser || `Artigo: ${meta?.articleTitle ?? parsed.title}`;
        return { pedido: pedido(`${intro}\n\n${args.urlDoArtigo}`, alvo), avisos };
      }
      // Carrossel de uma lâmina só sai como imagem, sozinho: o Blotato só monta
      // o documento a partir de 2 imagens.
      return { pedido: pedido(texto, alvo), avisos };
    }

    case "instagram": {
      if (midias.length === 0) {
        throw new FalhaNaPonte("PUB-FMT", "O Instagram exige imagem no post. Gere o post com imagem ou carrossel para publicar lá", "Instagram sem mídia.");
      }
      const legenda = texto.slice(0, INSTAGRAM_MAX_CAPTION);
      if (formato === "story") {
        avisos.push(
          (fontesDaPecaTinhaMais(post) ? "Story recebe uma mídia só: saiu a primeira lâmina do carrossel. " : "") +
            "Story não tem legenda, então o texto da peça não foi publicado, e ele some em 24 horas."
        );
        // Story não aceita legenda pela API da Meta: o texto vai vazio.
        return { pedido: pedido("", { targetType: "instagram", mediaType: "story" }), avisos };
      }
      if (mediaType === "video") {
        return { pedido: pedido(legenda, { targetType: "instagram", mediaType: "reel", shareToFeed: true }), avisos };
      }
      if (formato === "reel") avisos.push("Esta peça não é vídeo, então não podia sair como reel: ela foi publicada no feed.");
      return { pedido: pedido(legenda, { targetType: "instagram" }), avisos };
    }

    case "facebook": {
      if (!vinculo.paginaId) {
        throw new FalhaNaPonte(
          "PUB-CFG",
          "Esta página do Facebook ainda não está pronta para publicar. Abra um chamado com o código",
          "Conta Facebook ligada sem a página (o Blotato exige pageId): rode scripts/blotato-contas.mts ligar com --pagina."
        );
      }
      const base = { targetType: "facebook" as const, pageId: vinculo.paginaId };
      if (mediaType === "video" && midias.length) {
        if (formato === "story") {
          avisos.push("Story não tem legenda, então o texto da peça não foi publicado, e ele some em 24 horas.");
          return { pedido: pedido("", { ...base, mediaType: "story" }), avisos };
        }
        // O Blotato não publica mais vídeo de feed em página, só reel
        // (documentação de 30/09). O vídeo sai, e a tela diz onde.
        if (formato !== "reel") avisos.push("Vídeo de página sai como reel por esta conexão: ele aparece na aba de reels e no feed.");
        return { pedido: pedido(texto, { ...base, mediaType: "reel" }), avisos };
      }
      if (formato === "story" && midias.length) {
        avisos.push(
          (fontesDaPecaTinhaMais(post) ? "Story recebe uma mídia só: saiu a primeira lâmina. " : "") +
            "Story não tem legenda, então o texto da peça não foi publicado, e ele some em 24 horas."
        );
        return { pedido: pedido("", { ...base, mediaType: "story" }), avisos };
      }
      if (formato === "story") avisos.push("Story precisa de imagem ou vídeo, e esta peça é de texto: ela foi publicada no feed.");
      else if (formato === "reel") avisos.push("Esta peça não é vídeo, então não podia sair como reel: ela foi publicada no feed.");
      return { pedido: pedido(texto, base), avisos };
    }

    case "youtube": {
      if (mediaType !== "video" || midias.length === 0) {
        throw new FalhaNaPonte("PUB-FMT", "O YouTube só recebe posts de vídeo. Gere o post com vídeo para publicar lá", "YouTube sem vídeo.");
      }
      // Título na primeira linha e o resto na descrição, igual à API própria.
      const [primeiraLinha, ...resto] = texto.split("\n");
      const descricao = resto.join("\n").trim() || texto;
      const geradoPorIa = metadata?.origem !== "video" && (post.imageUrl ?? "").includes("/videos-ia/");
      const alvo: AlvoDoBlotato = {
        targetType: "youtube",
        title: (primeiraLinha || "Vídeo").slice(0, 100),
        privacyStatus: "public",
        shouldNotifySubscribers: true,
        isMadeForKids: false,
        containsSyntheticMedia: geradoPorIa,
        ...(args.capa ? { thumbnailUrl: args.capa } : {}),
      };
      if (!args.capa) avisos.push("O vídeo subiu sem capa escolhida; escolha uma no card do vídeo.");
      avisos.push("O YouTube mostra o vídeo em baixa qualidade nos primeiros minutos e libera o HD depois de processar (pode levar até algumas horas).");
      return { pedido: pedido(descricao.slice(0, 5000), alvo), avisos };
    }

    case "tiktok": {
      if (mediaType !== "video" || midias.length === 0) {
        throw new FalhaNaPonte("PUB-FMT", "O TikTok só recebe posts de vídeo. Gere o post com vídeo para publicar lá", "TikTok sem vídeo.");
      }
      // As escolhas que a pessoa fez na janela do TikTok, quando existem. Sem
      // elas (post que não passou pela janela), sai público com interações
      // ligadas e sem rótulo comercial, e a tela diz que foi o padrão.
      const o = (metadata?.tiktok ?? null) as Partial<OpcoesDoTikTok> | null;
      if (!o?.privacidade) {
        avisos.push("Saiu público, com comentários, dueto e costura liberados, porque a peça não tinha as escolhas do TikTok.");
      } else if (o.privacidade === "SELF_ONLY") {
        avisos.push("Publicado como \"somente eu\": o vídeo está no seu perfil do TikTok, visível só para você.");
      }
      const geradoPorIa = metadata?.origem !== "video" && (post.imageUrl ?? "").includes("/videos-ia/");
      return {
        pedido: pedido(texto.slice(0, 2200), {
          targetType: "tiktok",
          privacyLevel: o?.privacidade ?? "PUBLIC_TO_EVERYONE",
          disabledComments: o?.privacidade ? !o.permitirComentario : false,
          disabledDuet: o?.privacidade ? !o.permitirDueto : false,
          disabledStitch: o?.privacidade ? !o.permitirCostura : false,
          isBrandedContent: Boolean(o?.conteudoDeMarca),
          isYourBrand: Boolean(o?.suaMarca),
          isAiGenerated: geradoPorIa,
        }),
        avisos,
      };
    }
  }
  throw new FalhaNaPonte("PUB-CFG", `A rede "${conta.platform}" ainda não publica por esta conexão`, `Plataforma ${conta.platform} sem montagem.`);
}

function fontesDaPecaTinhaMais(post: Pick<Post, "imageUrl">): boolean {
  return (post.imageUrl ?? "").split("|").filter(Boolean).length > 1;
}

/* ── Mídia com URL pública ──────────────────────────────────────────────── */

const EXTENSAO: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

/**
 * A URL que o Blotato consegue baixar sem login.
 *
 * Blob PÚBLICO (toda mídia produzida desde 01/09) e qualquer https de fora do
 * Blob vão direto: é o caso comum e não custa nada. Data URL (arte gravada no
 * banco) e Blob PRIVADO (acervo anterior) sobem para o armazenamento deles,
 * porque o Blob privado responde 403 a quem não tem o token, e a rota assinada
 * da Meta não tem extensão no endereço.
 */
export async function urlPublicaDaMidia(fonte: string, nome: string): Promise<string> {
  if (fonte.startsWith("https://")) {
    const ehDoBlob = fonte.includes(".blob.vercel-storage.com");
    if (!ehDoBlob || ehPublica(fonte)) return fonte;
    const midia = await abrirMidia(fonte);
    if (!midia) {
      throw new FalhaNaPonte("PUB-MID", "Não consegui preparar a mídia desta peça para a rede. Tente de novo; se repetir, abra um chamado com o código", `abrirMidia devolveu nada para ${fonte}`);
    }
    if (midia.size > TETO_DE_ARQUIVO) {
      throw new FalhaNaPonte("PUB-MID", "O arquivo desta peça é grande demais para esta conexão. Abra um chamado com o código", `Arquivo de ${Math.round(midia.size / 1048576)} MB passa do teto de 400 MB do plano Starter.`);
    }
    const bytes = Buffer.from(await new Response(midia.stream).arrayBuffer());
    const mime = midia.mimeType.split(";")[0].trim();
    return enviarArquivo(`${nome}.${EXTENSAO[mime] ?? "bin"}`, bytes, mime);
  }
  if (fonte.startsWith("data:")) {
    const virgula = fonte.indexOf(",");
    const mime = fonte.slice(5, virgula).replace(";base64", "") || "image/jpeg";
    const bytes = Buffer.from(fonte.slice(virgula + 1), "base64");
    return enviarArquivo(`${nome}.${EXTENSAO[mime] ?? "bin"}`, bytes, mime);
  }
  throw new FalhaNaPonte("PUB-MID", "A mídia desta peça está num formato que a rede não aceita", `Fonte não reconhecida: ${fonte.slice(0, 60)}`);
}

/* ── O id da rede, quando o link deixa ler ──────────────────────────────── */

/**
 * O id que a API própria gravaria, lido do link publicado. Serve para a capa
 * do YouTube (capas-do-completo.ts usa o `externalId` como id do vídeo) e para
 * os números do X e do TikTok quando a conta também tem token próprio. Rede cujo
 * link não traz o id (Instagram, Facebook) fica com o número do envio.
 */
export function idDaRedePeloLink(platform: string, url: string | undefined | null): string | null {
  if (!url) return null;
  let u = url;
  try {
    // O LinkedIn devolve o urn codificado no link (urn%3Ali%3Ashare%3A...).
    u = decodeURIComponent(url);
  } catch {
    // link com % solto: lê como veio
  }
  const casar = (re: RegExp) => u.match(re)?.[1] ?? null;
  switch (platform) {
    case "twitter":
      return casar(/\/status(?:es)?\/(\d+)/);
    case "youtube":
      return casar(/[?&]v=([\w-]{11})/) ?? casar(/youtu\.be\/([\w-]{11})/) ?? casar(/\/shorts\/([\w-]{11})/);
    case "tiktok":
      return casar(/\/video\/(\d+)/);
    case "linkedin":
      return casar(/(urn:li:(?:share|ugcPost|activity):\d+)/);
    default:
      return null;
  }
}

/* ── Gravação no post ───────────────────────────────────────────────────── */

type Resultado = { url: string | null; externalId: string | null; aviso?: string };

function semErro(metadata: unknown): Record<string, unknown> {
  // O motivo da falha anterior sai quando a publicação dá certo (regra de
  // 21/09 em oauth-post.ts: post publicado com erro na cara é a tela dizendo
  // duas coisas, e o cliente acredita na pior).
  const { error: _e, ...resto } = (metadata ?? {}) as Record<string, unknown>;
  void _e;
  return resto;
}

async function gravarPublicado(postId: string, conta: SocialAccount, envio: StatusDoEnvio, avisos: string[]): Promise<Resultado> {
  const atual = await prisma.post.findUnique({ where: { id: postId }, select: { metadata: true, imageUrl: true, mediaType: true } });
  const externalUrl = envio.publicUrl ?? null;
  const externalId = idDaRedePeloLink(conta.platform, externalUrl) ?? `${PREFIXO_DO_ENVIO}${envio.postSubmissionId}`;
  const metadata = semErro(atual?.metadata);
  await prisma.post.update({
    where: { id: postId },
    data: {
      status: "published",
      publishedAt: new Date(),
      externalUrl,
      externalId,
      // Mesma limpeza da API própria: some só a data URL, que pesa; link fica.
      imageUrl: atual?.mediaType === "article" || !atual?.imageUrl?.startsWith("data:") ? atual?.imageUrl ?? null : null,
      socialAccountId: conta.id,
      metadata: {
        ...metadata,
        ponte: { ...((metadata.ponte as object) ?? {}), envio: envio.postSubmissionId, estado: "published", concluidoEm: new Date().toISOString() },
      } as never,
    },
  });
  if (!externalUrl) avisos.push("A rede confirmou a publicação, mas não devolveu o link do post.");
  return { url: externalUrl, externalId, aviso: avisos.length ? avisos.join(" ") : undefined };
}

async function gravarFalha(postId: string, falha: FalhaNaPonte): Promise<void> {
  const atual = await prisma.post.findUnique({ where: { id: postId }, select: { metadata: true } });
  const metadata = (atual?.metadata ?? {}) as Record<string, unknown>;
  await prisma.post.update({
    where: { id: postId },
    data: {
      status: "failed",
      metadata: {
        ...metadata,
        error: falha.message.slice(0, 300),
        ponte: { ...((metadata.ponte as object) ?? {}), estado: "failed", codigo: falha.codigo },
      } as never,
    },
  });
}

/** O status final vira resultado, falha ou "ainda processando". */
async function concluir(postId: string, conta: SocialAccount, envio: StatusDoEnvio, avisos: string[]): Promise<Resultado> {
  if (envio.status === "published") return gravarPublicado(postId, conta, envio, avisos);
  if (envio.status === "failed") {
    throw new FalhaNaPonte(
      "PUB-REDE",
      `A rede não aceitou esta publicação.${motivoDaRede(envio.errorMessage)} Ajuste a peça e publique de novo; se repetir, abra um chamado com o código`,
      `Envio ${envio.postSubmissionId} falhou: ${envio.errorMessage ?? "(sem motivo)"}. Detalhe em my.blotato.com/failed.`
    );
  }
  // Ainda em andamento: o post fica "publishing" com o número gravado, e o cron
  // termina o serviço. A tela já trata "publishing" como "na fila".
  return {
    url: null,
    externalId: `${PREFIXO_DO_ENVIO}${envio.postSubmissionId}`,
    aviso: [...avisos, "A rede recebeu a peça e ainda está processando; o link aparece aqui quando terminar."].join(" "),
  };
}

/**
 * Publica o post pela conta do Blotato ligada à SocialAccount. Lança
 * `FalhaNaPonte` (mensagem para a tela) em qualquer falha; quem chama grava o
 * `failed` com a mensagem, como faz com a API própria.
 */
export async function publicarPeloBlotato(
  post: Post,
  conta: SocialAccount,
  opcoes: { tetoMs?: number; intervaloMs?: number } = {}
): Promise<Resultado> {
  try {
    if (!chaveDoBlotato()) {
      throw new FalhaNaPonte("PUB-INT", FRASE_INDISPONIVEL, "Conta roteada pelo Blotato sem BLOTATO_API_KEY no ambiente.");
    }
    const vinculo = lerVinculo(conta.blotatoAccountId);
    if (!vinculo) {
      throw new FalhaNaPonte("PUB-CFG", "Esta conta ainda não está pronta para publicar. Abra um chamado com o código", `SocialAccount ${conta.id} sem blotatoAccountId.`);
    }
    const espera = { tetoMs: opcoes.tetoMs, intervaloMs: opcoes.intervaloMs };

    // ENVIO ANTERIOR AINDA VIVO: confere antes de mandar de novo. Repetir o
    // POST criaria um segundo post igual no perfil do cliente.
    if (post.externalId?.startsWith(PREFIXO_DO_ENVIO)) {
      const anterior = post.externalId.slice(PREFIXO_DO_ENVIO.length);
      const st = await statusDoPost(anterior).catch(() => null);
      if (st && st.status !== "failed") {
        console.log(`[blotato][${post.id}] envio ${anterior} já existe (${st.status}); confiro em vez de reenviar`);
        const fim = st.status === "in-progress" ? await esperarEnvio(anterior, espera) : st;
        return await concluir(post.id, conta, fim, []);
      }
      if (!st) {
        // Sem conseguir ler o anterior, reenviar arrisca o post repetido. Fica
        // como está; o cron tenta ler de novo.
        throw new FalhaNaPonte("PUB-ESP", "Esta peça já foi enviada e a rede ainda não confirmou. Confira o perfil antes de publicar de novo, para não sair repetida", `Não consegui ler o envio anterior ${anterior}.`);
      }
    }

    const formato = formatoDoPost(post.metadata, conta.platform);
    const fontes = fontesDaPeca(post, conta.platform, formato);
    const midias: string[] = [];
    for (let i = 0; i < fontes.length; i++) {
      midias.push(await urlPublicaDaMidia(fontes[i], `demandou-${post.id}-${i}`));
    }

    let urlDoArtigo: string | null = null;
    if (conta.platform === "linkedin" && post.mediaType === "article") {
      let token = post.articlePublicToken;
      if (!token) {
        token = newArticlePublicToken();
        await prisma.post.update({ where: { id: post.id }, data: { articlePublicToken: token } });
      }
      urlDoArtigo = buildArticlePublicUrl(token);
    }

    let capa: string | null = null;
    const capaUrl = (post.metadata as Record<string, unknown> | null)?.capaUrl;
    if (conta.platform === "youtube" && typeof capaUrl === "string" && capaUrl.startsWith("https://")) {
      // Capa que não sobe vira aviso, como na API própria: o vídeo é o que importa.
      capa = await urlPublicaDaMidia(capaUrl, `demandou-${post.id}-capa`).catch((e) => {
        console.warn(`[blotato][${post.id}] capa não subiu:`, e);
        return null;
      });
    }

    const { pedido, avisos } = montarPedido({ post, conta, vinculo, midias, urlDoArtigo, capa });

    let envio: { postSubmissionId: string };
    try {
      envio = await criarPost(pedido);
    } catch (e) {
      throw falhaDaApi(e, "criar post");
    }

    // O número fica gravado ANTES de esperar: se a função morrer agora, o cron
    // sabe que este post já foi enviado e só confere.
    const metaAtual = (post.metadata ?? {}) as Record<string, unknown>;
    await prisma.post.update({
      where: { id: post.id },
      data: {
        status: "publishing",
        externalId: `${PREFIXO_DO_ENVIO}${envio.postSubmissionId}`,
        socialAccountId: conta.id,
        metadata: {
          ...metaAtual,
          ponte: { envio: envio.postSubmissionId, estado: "in-progress", enviadoEm: new Date().toISOString(), ...(avisos.length ? { avisos } : {}) },
        } as never,
      },
    });

    const fim = await esperarEnvio(envio.postSubmissionId, espera);
    return await concluir(post.id, conta, fim, avisos);
  } catch (e) {
    const falha = falhaDaApi(e, "publicar");
    console.error(`[blotato][${post.id}] ${falha.codigo}: ${falha.interno}`);
    throw falha;
  }
}

/**
 * O CRON TERMINA O QUE FICOU EM ANDAMENTO.
 *
 * Post "publishing" com número de envio é post que a rede recebeu e ainda não
 * confirmou quando a função parou de esperar. Sem esta conferência ele ficaria
 * "na fila" para sempre, que é a marca de estado que sobrevive ao fato. O
 * prazo de 3 horas é o fim: depois disso vira falha com a instrução de
 * conferir o perfil, porque publicar de novo às cegas poderia repetir o post.
 */
export async function conferirEnviosPendentes(limite = 20): Promise<Array<{ id: string; estado: string }>> {
  if (!chaveDoBlotato()) return [];
  const pendentes = await prisma.post.findMany({
    where: {
      status: "publishing",
      externalId: { startsWith: PREFIXO_DO_ENVIO },
      updatedAt: { lte: new Date(Date.now() - 60_000) },
    },
    include: { socialAccount: true },
    orderBy: { updatedAt: "asc" },
    take: limite,
  });
  const saida: Array<{ id: string; estado: string }> = [];
  for (const p of pendentes) {
    const envio = p.externalId!.slice(PREFIXO_DO_ENVIO.length);
    try {
      const st = await statusDoPost(envio);
      if (st.status === "in-progress" || st.status === "scheduled") {
        if (Date.now() - p.updatedAt.getTime() > PRAZO_DO_ENVIO_MS) {
          const falha = new FalhaNaPonte(
            "PUB-ESP",
            "A rede não confirmou esta publicação em 3 horas. Confira o perfil antes de publicar de novo, para não sair repetida",
            `Envio ${envio} ainda ${st.status} depois de 3 h.`
          );
          console.error(`[blotato][${p.id}] ${falha.codigo}: ${falha.interno}`);
          await gravarFalha(p.id, falha);
          saida.push({ id: p.id, estado: "failed" });
        } else {
          saida.push({ id: p.id, estado: st.status });
        }
        continue;
      }
      if (!p.socialAccount) {
        saida.push({ id: p.id, estado: "sem conta" });
        continue;
      }
      await concluir(p.id, p.socialAccount, st, []);
      saida.push({ id: p.id, estado: "published" });
    } catch (e) {
      if (e instanceof FalhaNaPonte) {
        console.error(`[blotato][${p.id}] ${e.codigo}: ${e.interno}`);
        await gravarFalha(p.id, e).catch(() => {});
        saida.push({ id: p.id, estado: "failed" });
      } else {
        // Leitura que falhou não decide nada: tenta na próxima volta do cron.
        console.warn(`[blotato][${p.id}] conferência do envio ${envio} falhou:`, e);
        saida.push({ id: p.id, estado: "não lido" });
      }
    }
  }
  return saida;
}
