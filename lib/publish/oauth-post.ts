import { prisma } from "@/lib/db/prisma";
import { motivoDeBastidor } from "@/lib/pipeline/guarda-de-texto";
import type { Post, SocialAccount } from "@prisma/client";
import {
  publishToLinkedIn,
  publishLinkedInImagePost,
  publishLinkedInVideoPost,
  publishLinkedInCarousel,
  publishLinkedInPoll,
  publishLinkedInArticleLinkPost,
  publishLinkedInComment,
  LINKEDIN_MAX_COMMENTARY_CHARS,
  type PollDuration,
} from "@/lib/oauth/linkedin";
import {
  buildArticlePublicUrl,
  newArticlePublicToken,
  parseLinkedInArticleContent,
} from "@/lib/articles/linkedin-article";
import {
  publishToTwitter,
  publishTwitterThread,
  parseTwitterThread,
  refreshTwitterToken,
  uploadTwitterMedia,
  uploadTwitterVideo,
  ehSemNivelDeAcessoNoX,
} from "@/lib/oauth/twitter";
import {
  buildIgMediaPublicUrl,
  publishInstagramCarousel,
  publishInstagramImage,
  publishInstagramReels,
  publishInstagramStory,
  refreshInstagramToken,
  INSTAGRAM_MAX_CAPTION,
} from "@/lib/oauth/instagram";
import {
  publishFacebookImagePost,
  publishFacebookVideo,
  publishFacebookText,
  publishFacebookReel,
  publishFacebookPhotoStory,
  publishFacebookVideoStory,
} from "@/lib/oauth/facebook";
import { formatoDoPost } from "@/lib/publish/formato-de-destino";
import { abrirMidia } from "@/lib/media/storage";
import { publishYouTubeVideo, refreshYouTubeToken, setYouTubeThumbnail } from "@/lib/oauth/youtube";
import { lerMidia } from "@/lib/media/storage";
import { normalizarCapaParaYouTube } from "@/lib/media/capa-youtube";
import { ligarCortesAoCompleto } from "@/lib/media/cortes-com-link-do-completo";
import { lerInfoDoCriador, opcoesDoTikTokNoPost, publicarVideoNoTikTok, refreshTikTokToken } from "@/lib/oauth/tiktok";
import { caminhoDaConta } from "@/lib/publish/roteador";
import { naoFazPelaPonte, publicarPeloBlotato } from "@/lib/publish/via-blotato";
import { lerLinks, primeiroComentarioComLink } from "@/lib/projeto/links-do-cliente";

/**
 * Garante access token válido (Twitter refresh quando necessário).
 */
export async function resolveSocialAccountAccessToken(
  account: SocialAccount
): Promise<{ account: SocialAccount; accessToken: string }> {
  let accessToken = account.accessToken ?? "";

  // YouTube: o access token do Google dura 1h; o refresh token e permanente.
  // Renova sempre que faltar menos de 5 minutos.
  if (
    account.platform === "youtube" &&
    account.refreshToken &&
    account.tokenExpiresAt &&
    account.tokenExpiresAt.getTime() < Date.now() + 5 * 60 * 1000
  ) {
    const refreshed = await refreshYouTubeToken(account.refreshToken);
    const updated = await prisma.socialAccount.update({
      where: { id: account.id },
      data: {
        accessToken: refreshed.accessToken,
        tokenExpiresAt: refreshed.expiresAt,
      },
    });
    return { account: updated, accessToken: refreshed.accessToken };
  }

  // TikTok: o token de acesso dura 24 horas e o de renovação 365 dias, e cada
  // renovação devolve um de renovação NOVO, que precisa ser gravado no lugar
  // do antigo. Renova com 10 minutos de folga, porque o envio em pedaços e a
  // espera pelo processamento levam alguns minutos com o mesmo token.
  if (
    account.platform === "tiktok" &&
    account.refreshToken &&
    account.tokenExpiresAt &&
    account.tokenExpiresAt.getTime() < Date.now() + 10 * 60 * 1000
  ) {
    const refreshed = await refreshTikTokToken(account.refreshToken);
    const updated = await prisma.socialAccount.update({
      where: { id: account.id },
      data: {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        tokenExpiresAt: refreshed.expiresAt,
      },
    });
    return { account: updated, accessToken: refreshed.accessToken };
  }

  if (
    account.platform === "twitter" &&
    account.refreshToken &&
    account.tokenExpiresAt &&
    account.tokenExpiresAt < new Date()
  ) {
    const refreshed = await refreshTwitterToken(account.refreshToken);
    accessToken = refreshed.access_token;
    const updated = await prisma.socialAccount.update({
      where: { id: account.id },
      data: {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token ?? account.refreshToken,
        tokenExpiresAt: refreshed.expires_in
          ? new Date(Date.now() + refreshed.expires_in * 1000)
          : null,
      },
    });
    return { account: updated, accessToken };
  }

  // Instagram: o token longo (~60 dias) não tem refresh token; renova-se o
  // próprio token antes de expirar. Renovar com 7 dias de antecedência cobre
  // o cliente que publica ao menos 1x por semana; quem sumir por mais de 60
  // dias precisa reconectar, e a falha abaixo vira erro claro na publicação.
  if (
    account.platform === "instagram" &&
    accessToken &&
    account.tokenExpiresAt &&
    account.tokenExpiresAt.getTime() < Date.now() + 7 * 24 * 60 * 60 * 1000
  ) {
    if (account.tokenExpiresAt < new Date()) {
      throw new Error(
        "A conexão com o Instagram expirou. Reconecte a conta nas configurações do projeto."
      );
    }
    try {
      const refreshed = await refreshInstagramToken(accessToken);
      const updated = await prisma.socialAccount.update({
        where: { id: account.id },
        data: {
          accessToken: refreshed.accessToken,
          tokenExpiresAt: refreshed.expiresAt,
        },
      });
      return { account: updated, accessToken: refreshed.accessToken };
    } catch (e) {
      // Renovação falhou mas o token atual ainda vale: publica com ele e
      // tenta renovar de novo na próxima. Só loga para deixar rastro.
      console.warn("[instagram] refresh do token falhou, usando o atual:", e);
    }
  }
  return { account, accessToken };
}

/**
 * Lê o vídeo do post, venha ele do storage ou do banco.
 *
 * Existe para as três redes que enviam BYTES (LinkedIn, X e YouTube) não
 * repetirem a mesma leitura, e principalmente para não repetirem o erro: blob
 * privado responde 403 a `fetch` comum, e só o SDK com token resolve. Essa
 * armadilha já apareceu quatro vezes neste projeto.
 *
 * Devolve buffer, e não fluxo, porque LinkedIn e X pedem pedaços por índice de
 * byte, o que exige acesso aleatório. Aceitável para corte de rede, que fica em
 * 5 a 10 MB; para a gravação inteira o YouTube usa o caminho de fluxo próprio.
 */
async function lerVideoDoPost(
  imageUrl: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (imageUrl.startsWith("data:")) {
    const [head, b64] = imageUrl.split(",", 2);
    return {
      buffer: Buffer.from(b64, "base64"),
      mimeType: head.slice(5, head.indexOf(";")) || "video/mp4",
    };
  }
  // Dos DOIS stores: a mídia produzida nasce pública desde 01/09, e o acervo
  // anterior continua privado. Ler com o token do store errado devolve 403.
  const midia = await abrirMidia(imageUrl);
  if (!midia) {
    throw new Error("Não consegui ler o vídeo no storage.");
  }
  return {
    buffer: Buffer.from(await new Response(midia.stream).arrayBuffer()),
    mimeType: midia.mimeType,
  };
}

/**
 * Publica um post via OAuth (LinkedIn / X). Atualiza o registro no banco.
 */
/**
 * Troca link de redirecionamento do Google (grounding do Gemini) pela URL
 * real. Cada um e um GET sem seguir o redirect; o destino vem no Location.
 * Link que nao resolve fica como esta: pior mostrar nada do que mostrar o
 * redirecionamento.
 */
export async function resolverLinksDeFonte(texto: string): Promise<string> {
  const links = [...texto.matchAll(/https?:\/\/vertexaisearch\.cloud\.google\.com\/\S+/g)].map((m) => m[0]);
  let saida = texto;
  for (const link of links) {
    try {
      const r = await fetch(link, { redirect: "manual", signal: AbortSignal.timeout(8_000) });
      const real = r.headers.get("location");
      if (real) saida = saida.replace(link, real);
    } catch {
      // fica o link original
    }
  }
  return saida;
}

/**
 * O VÍDEO MAIS RECENTE DO POST, lido na hora de publicar (30/09).
 *
 * O post de vídeo guarda em `imageUrl` o endereço do arquivo do momento em que
 * foi criado. A edição com efeitos termina DEPOIS e troca o arquivo no vídeo
 * (completoUrl, midia.vertical), mas o post continuava com o endereço antigo:
 * o card mostrava o completo editado e o YouTube recebeu a versão sem edição.
 * Aqui o post de um vídeo da esteira sempre sai com o arquivo atual.
 */
async function videoAtualDoPost(post: Post): Promise<string | null> {
  const meta = post.metadata as { videoJobId?: string; trechoIndice?: number; gravacaoCompleta?: boolean } | null;
  if (!meta?.videoJobId || post.mediaType !== "video") return null;
  const v = await prisma.videoJob.findUnique({ where: { id: meta.videoJobId }, select: { completoUrl: true, clips: true } });
  if (!v) return null;
  if (meta.gravacaoCompleta) return v.completoUrl ?? null;
  if (typeof meta.trechoIndice === "number") {
    const t = (v.clips as Array<{ midia?: { vertical?: { url?: string } | string; horizontal?: { url?: string } | string } }> | null)?.[meta.trechoIndice];
    const vert = t?.midia?.vertical;
    const url = typeof vert === "string" ? vert : vert?.url;
    // Só troca quando o post apontava para um arquivo de corte (e não para uma
    // versão horizontal ou outra escolhida de propósito).
    if (url && (!post.imageUrl || /\/cortes\//.test(post.imageUrl))) return url;
  }
  return null;
}

export async function executeOAuthPostPublish(
  post: Post,
  account: SocialAccount,
  /**
   * Quanto esperar a confirmação quando o post sai pelo Blotato. O cron passa
   * um teto curto, porque publica até 20 posts em sequência e o que não
   * terminar ele mesmo confere na volta seguinte.
   */
  opcoesDaPonte: { tetoMs?: number; intervaloMs?: number } = {}
): Promise<{ url: string | null; externalId: string | null; aviso?: string }> {
  const atual = await videoAtualDoPost(post).catch(() => null);
  if (atual && atual !== post.imageUrl) {
    console.log(`[publicar][${post.id}] vídeo do post trocado pela versão atual (edição mais recente)`);
    await prisma.post.update({ where: { id: post.id }, data: { imageUrl: atual } }).catch(() => {});
    post = { ...post, imageUrl: atual };
  }

  let externalUrl: string | null = null;
  let externalId: string | null = null;
  // O que deu certo mas merece uma frase na tela (a capa que o YouTube
  // recusou, a espera pelo HD). Nunca derruba a publicação.
  let aviso: string | undefined;

  const bodyText = post.content ?? "";
  const mediaType = post.mediaType ?? "text";

  /**
   * A ÚLTIMA CONFERÊNCIA ENTRE O BANCO E A REDE.
   *
   * A guarda de texto existe desde 18/09 e rodava só na hora de GRAVAR. Em
   * 21/09 duas threads do X foram publicadas com o changelog do redator
   * ("Ajustes feitos: saíram...") colado no último tweet e cortado no meio,
   * porque naquele momento a marca ainda não era reconhecida. A limpeza foi
   * corrigida, mas o post já estava gravado: só uma conferência AQUI impede
   * que o que já está no banco vá ao ar.
   *
   * Recusar é melhor que publicar: o post fica como falhou, com o motivo na
   * tela, e quem aprova decide. Publicar a máquina falando sozinha no nome do
   * cliente não tem desfazer.
   */
  const bastidor = motivoDeBastidor(bodyText);
  if (bastidor) {
    throw new Error(
      `O texto não passou na guarda e NÃO foi publicado: ${bastidor}. Abra a peça, tire a parte em que o redator explica o que mudou e publique de novo.`
    );
  }

  /**
   * POST DE VÍDEO SEM VÍDEO NÃO PUBLICA. Em rede nenhuma.
   *
   * Medido em 19/09, no primeiro dia de vídeo publicado de verdade: o Veo não
   * rodou (saldo de vídeo zero), a esteira entregou o QUADRO e deixou o post
   * como `mediaType: "video"` com um JPEG em `imageUrl`. O cron publicou
   * assim mesmo, e cada rede fez o que pôde com um JPEG num lugar de vídeo:
   *
   *   • Facebook aceitou e criou um "vídeo" de 0,04 segundo (um quadro),
   *     que a tela mostra como 0:00 / 0:00 em laço;
   *   • a página do LinkedIn caiu no ramo de texto e saiu SEM MÍDIA, em
   *     silêncio;
   *   • o X recusou por outro motivo (nível de acesso) antes de chegar aqui.
   *
   * Três sintomas diferentes, uma causa: o quadro é provisório e estava sendo
   * tratado como entrega. A guarda fica AQUI, e não em cada rede, porque cada
   * rede tinha uma reação diferente e nenhuma delas era a certa. O post fica
   * onde está, com a mensagem dizendo o que falta.
   */
  if (mediaType === "video") {
    const url = post.imageUrl ?? "";
    const ehVideo = url.startsWith("data:video") || /\.(mp4|webm|mov)(\?|$)/i.test(url) || url.includes("/videos-ia/");
    if (!ehVideo) {
      throw new Error(
        "Este post é de vídeo, mas o vídeo ainda não existe: o que está no card é só o quadro. " +
          (url.startsWith("data:image")
            ? "O vídeo por IA não foi gerado (veja o aviso da Diana no card, normalmente é saldo de vídeo). " +
              // Neutra de propósito (01/10, acesso de equipe): esta frase fica
              // gravada no post e é lida pelo dono e pelo membro, que não compra.
              "Com créditos de vídeo adicionados por quem administra a conta, regenere a peça; ou troque o tipo do post para imagem para publicar o quadro."
            : "Espere o vídeo terminar ou regenere a peça.")
      );
    }
  }

  /**
   * API PRÓPRIA OU BLOTATO, decidido por conta (30/09, lib/publish/roteador.ts).
   *
   * Fica DEPOIS das duas guardas de cima de propósito: o texto com bastidor do
   * redator e o post de vídeo sem vídeo são recusados pelo mesmo motivo nos
   * dois caminhos. E fica ANTES de renovar o token, porque a conta ligada só
   * pelo Blotato não tem token, e a do Instagram vencido derrubaria aqui uma
   * publicação que nem ia usar o token.
   *
   * O que o Blotato não faz (enquete do LinkedIn) sai pela API própria quando
   * a conta tem token; sem token, a peça falha dizendo o que trocar.
   */
  const rota = caminhoDaConta(account);
  if (rota.caminho === "blotato") {
    const naoFaz = naoFazPelaPonte(post, account.platform);
    if (!naoFaz) {
      console.log(`[publicar][${post.id}] pelo Blotato (${rota.motivo})`);
      return publicarPeloBlotato(post, account, opcoesDaPonte);
    }
    if (!account.accessToken) {
      throw new Error(
        `Esta conta ainda não publica ${naoFaz} por esta conexão. Troque a peça para texto ou imagem e publique de novo (código PUB-FMT)`
      );
    }
    console.log(`[publicar][${post.id}] ${naoFaz} não sai pelo Blotato; vai pela API própria`);
  }

  const { accessToken } = await resolveSocialAccountAccessToken(account);

  const accountType = (account.accountType as "personal" | "organization") ?? "personal";
  const platformUserId = account.platformUserId ?? "";
  const metadata = post.metadata as Record<string, unknown> | null;
  /**
   * O MOTIVO DA FALHA ANTERIOR SAI QUANDO A PUBLICAÇÃO DÁ CERTO.
   *
   * Visto em 21/09 na Areticon: o post do X falhou às 12:16 ("Failed to
   * refresh Twitter token"), o Bruno reconectou, o post SAIU às 12:47 (o
   * tweet existe, conferido na API) e a tela continuou dizendo "um post
   * falhou: reconecte o X", porque `metadata.error` ficou gravado e o sucesso
   * só mexia no status. Um post publicado com erro na cara é a plataforma
   * dizendo duas coisas ao mesmo tempo, e o cliente acredita na pior.
   */
  const { error: _erroAnterior, ...metadataSemErro } = metadata ?? {};
  void _erroAnterior;

  /**
   * ONDE A PEÇA CAI DENTRO DA REDE (21/09).
   *
   * Até aqui esta função decidia o endpoint só pelo `mediaType`, e o destino
   * era sempre o feed. O formato é outra coisa: `mediaType` é o que a peça É,
   * `formato` é para onde ela vai. A matriz do que cada rede aceita vive em
   * `lib/publish/formato-de-destino.ts`, e `formatoDoPost` já devolve "feed"
   * quando a rede não aceita o que foi pedido, então nada aqui precisa
   * repetir a matriz nem falhar por escolha antiga.
   */
  const formato = formatoDoPost(metadata, account.platform);

  if (account.platform === "linkedin") {
    if (!platformUserId) {
      throw new Error("Conta LinkedIn inválida");
    }

    if (mediaType === "article") {
      let token = post.articlePublicToken;
      if (!token) {
        token = newArticlePublicToken();
        await prisma.post.update({ where: { id: post.id }, data: { articlePublicToken: token } });
      }
      const articlePublicUrl = buildArticlePublicUrl(token);
      const parsed = parseLinkedInArticleContent(bodyText);
      const meta = metadata as { articleTitle?: string; articleTeaser?: string; linkedinFeedIntro?: string } | null;
      const title = (meta?.articleTitle ?? parsed.title).slice(0, 200);
      const description = (meta?.articleTeaser ?? parsed.teaser).slice(0, 400);
      const commentaryRaw =
        (meta?.linkedinFeedIntro?.trim() || parsed.teaser || `Artigo: ${title}`).slice(0, LINKEDIN_MAX_COMMENTARY_CHARS);
      const thumb = post.imageUrl;
      const result = await publishLinkedInArticleLinkPost(
        accessToken,
        platformUserId,
        {
          commentary: commentaryRaw,
          articleUrl: articlePublicUrl,
          title,
          description,
          thumbnailDataUrl: thumb?.startsWith("data:image") ? thumb : null,
          thumbnailHttpsUrl: thumb?.startsWith("https://") ? thumb : null,
        },
        accountType
      );
      externalUrl = result.url;
      externalId = result.postId;
    } else if (mediaType === "poll") {
      const pollData = metadata as {
        intro?: string;
        question?: string;
        options?: string[];
        duration?: string;
      } | null;

      if (!pollData?.question || !pollData.options || pollData.options.length < 2) {
        const result = await publishToLinkedIn(accessToken, platformUserId, bodyText, accountType);
        externalUrl = result.url;
        externalId = result.postId;
      } else {
        const result = await publishLinkedInPoll(
          accessToken,
          platformUserId,
          pollData.intro ?? bodyText,
          pollData.question,
          pollData.options,
          (pollData.duration ?? "THREE_DAYS") as PollDuration,
          accountType
        );
        externalUrl = result.url;
        externalId = result.postId;
      }
    } else if (mediaType === "carousel" && post.imageUrl) {
      const imageUrls = post.imageUrl.split("|").filter(Boolean);
      if (imageUrls.length >= 2) {
        const result = await publishLinkedInCarousel(
          accessToken,
          platformUserId,
          bodyText,
          imageUrls,
          accountType
        );
        externalUrl = result.url;
        externalId = result.postId;
      } else {
        const result = await publishLinkedInImagePost(
          accessToken,
          platformUserId,
          bodyText,
          imageUrls[0],
          accountType
        );
        externalUrl = result.url;
        externalId = result.postId;
      }
    } else if (
      (mediaType === "image" || mediaType === "infographic") &&
      post.imageUrl &&
      (post.imageUrl.startsWith("data:image") || post.imageUrl.startsWith("https://"))
    ) {
      const result = await publishLinkedInImagePost(
        accessToken,
        platformUserId,
        bodyText,
        post.imageUrl,
        accountType
      );
      externalUrl = result.url;
      externalId = result.postId;
    } else if (mediaType === "video" && post.imageUrl) {
      /**
       * O VIDEO SOBE COMO VIDEO, venha ele de onde vier.
       *
       * Ate 19/09 este ramo so reconhecia `data:video` e
       * `storage.googleapis.com`. O nosso mp4 nasce no Vercel Blob
       * (`*.public.blob.vercel-storage.com/videos-ia/...`), entao caia no
       * `else` e publicava a LEGENDA com o link do video colado no fim.
       * O Bruno viu: "o linkedin publicou sem o video, na pagina".
       *
       * `lerVideoDoPost` ja resolve os dois mundos (data URL e os dois stores
       * de Blob) e devolve o buffer, que e o que o upload do LinkedIn aceita.
       * A guarda no topo desta funcao ja garantiu que aqui so chega video de
       * verdade, entao nao existe mais o caso "nao e video".
       */
      const video = await lerVideoDoPost(post.imageUrl);
      const result = await publishLinkedInVideoPost(
        accessToken,
        platformUserId,
        post.content,
        video,
        accountType
      );
      externalUrl = result.url;
      externalId = result.postId;
    } else {
      const result = await publishToLinkedIn(accessToken, platformUserId, bodyText, accountType);
      externalUrl = result.url;
      externalId = result.postId;
    }
  } else if (account.platform === "twitter") {
    // Upload de mídia (imagem ou infográfico) antes de publicar
    let twitterMediaIds: string[] | undefined;
    const hasImage =
      post.imageUrl &&
      (mediaType === "image" || mediaType === "infographic") &&
      (post.imageUrl.startsWith("data:image") || post.imageUrl.startsWith("https://"));

    if (hasImage) {
      try {
        const mediaId = await uploadTwitterMedia(accessToken, post.imageUrl!);
        twitterMediaIds = [mediaId];
      } catch (e) {
        // Upload de mídia não-fatal: publica só o texto se falhar
        console.warn("[twitter] media upload falhou, publicando só texto:", e);
      }
    } else if (mediaType === "video" && post.imageUrl) {
      /**
       * Vídeo é FATAL se falhar, com UMA exceção.
       *
       * A regra continua: quem marcou um corte para o X quer o corte, e
       * publicar só a legenda entregaria um texto solto que não faz sentido
       * sozinho. Falha de rede, de tamanho ou de transcodificação segura o
       * post, e está certo.
       *
       * A exceção é o 403 de NÍVEL DE ACESSO, medido em 19/09: o app do X está
       * num plano que não inclui o upload em pedaços. Não existe tentativa que
       * resolva isso, então segurar o post significa nunca publicar aquele dia
       * no X. Aqui o post sai como texto, com o aviso dizendo por quê, e a
       * decisão de pagar o nível fica com o dono da conta.
       */
      const video = await lerVideoDoPost(post.imageUrl);
      try {
        twitterMediaIds = [await uploadTwitterVideo(accessToken, video)];
      } catch (e) {
        if (!ehSemNivelDeAcessoNoX(e)) throw e;
        console.warn("[twitter] nível de acesso não permite vídeo, publicando só o texto:", e);
        aviso =
          "O vídeo não foi para o X: a conta de desenvolvedor está num nível de acesso que não " +
          "permite enviar vídeo. O texto foi publicado. Para liberar o vídeo, suba o nível em " +
          "developer.x.com/en/portal/product.";
      }
    }

    if (mediaType === "thread" || bodyText.match(/\n\d+[\/\)]\s/)) {
      const tweets = parseTwitterThread(bodyText);
      if (tweets.length > 1) {
        // Imagem vai apenas no primeiro tweet da thread
        const result = await publishTwitterThread(accessToken, tweets, twitterMediaIds);
        externalUrl = result.url;
        externalId = result.firstTweetId;
      } else {
        const result = await publishToTwitter(accessToken, bodyText.slice(0, 280), twitterMediaIds);
        externalUrl = result.url;
        externalId = result.tweetId;
      }
    } else {
      const mainText =
        bodyText
          .split(/\n(?=\d+\/)/)
          .map((t) => t.trim())
          .filter(Boolean)[0] ?? bodyText;
      const result = await publishToTwitter(accessToken, mainText.slice(0, 280), twitterMediaIds);
      externalUrl = result.url;
      externalId = result.tweetId;
    }
  } else if (account.platform === "instagram") {
    if (!platformUserId) throw new Error("Conta Instagram inválida");

    // Instagram não tem post sem mídia. Post de texto puro é recusado aqui
    // com mensagem clara em vez de deixar a API da Meta devolver erro críptico.
    const rawImages = (post.imageUrl ?? "").split("|").filter(Boolean);
    if (rawImages.length === 0) {
      throw new Error(
        "O Instagram exige imagem no post. Gere o post com imagem ou carrossel para publicar lá."
      );
    }

    const caption = bodyText.slice(0, INSTAGRAM_MAX_CAPTION);

    if (formato === "story") {
      /**
       * STORY, e o que ele faz com a peça.
       *
       * Story não tem legenda em rede nenhuma: o texto do redator não vai
       * junto, e isso precisa aparecer na tela em vez de sumir em silêncio,
       * por isso vira aviso. O carrossel também não cabe: o story recebe uma
       * mídia, então sai a PRIMEIRA lâmina e o aviso diz que foi só ela.
       */
      const ehVideo = mediaType === "video";
      const result = await publishInstagramStory(
        accessToken,
        platformUserId,
        buildIgMediaPublicUrl(post.id, 0),
        ehVideo
      );
      externalUrl = result.url;
      externalId = result.mediaId;
      aviso =
        (rawImages.length > 1
          ? "Story recebe uma mídia só: saiu a primeira lâmina do carrossel. "
          : "") + "Story não tem legenda, então o texto da peça não foi publicado, e ele some em 24 horas.";
    } else if (mediaType === "video") {
      // Vídeo vira Reels, e não tentativa de publicar vídeo como imagem, que é
      // o que acontecia antes: a Meta recusava com erro que não explicava nada.
      //
      // Sempre pela rota assinada, mesmo quando a URL já é https: a nossa é do
      // storage PRIVADO, e a Meta precisa alcançar o arquivo de fora.
      const result = await publishInstagramReels(
        accessToken,
        platformUserId,
        buildIgMediaPublicUrl(post.id, 0),
        caption
      );
      externalUrl = result.url;
      externalId = result.mediaId;
    } else {
      /**
       * REEL PEDIDO NUMA PEÇA QUE NÃO É VÍDEO cai aqui, e vai para o feed.
       *
       * Acontece quando o dia muda de tipo depois da escolha (vídeo que virou
       * imagem por falta de saldo, por exemplo, que é o caminho de 19/09).
       * Recusar seria perder a peça por causa de um destino; publicar calado
       * seria mentir sobre onde ela está. Publica no feed e diz.
       */
      if (formato === "reel") {
        aviso = "Esta peça não é vídeo, então não podia sair como reel: ela foi publicada no feed.";
      }

      // A Meta busca a mídia por URL pública. https passa direto; data URL vai
      // pela rota assinada /api/media/ig/[token], que serve a imagem do banco.
      const publicUrls = rawImages.map((img, i) =>
        img.startsWith("https://") ? img : buildIgMediaPublicUrl(post.id, i)
      );

      const result =
        publicUrls.length >= 2
          ? await publishInstagramCarousel(accessToken, platformUserId, publicUrls, caption)
          : await publishInstagramImage(accessToken, platformUserId, publicUrls[0], caption);
      externalUrl = result.url;
      externalId = result.mediaId;
    }
  } else if (account.platform === "facebook" && mediaType === "video" && post.imageUrl) {
    if (!platformUserId) throw new Error("Página do Facebook inválida");
    // Pela rota assinada, sempre: a Meta busca o arquivo de fora e o storage é
    // privado.
    const videoPublico = buildIgMediaPublicUrl(post.id, 0);

    if (formato === "story") {
      const result = await publishFacebookVideoStory(accessToken, platformUserId, videoPublico);
      externalUrl = result.url;
      externalId = result.postId;
      aviso = "Story não tem legenda, então o texto da peça não foi publicado, e ele some em 24 horas.";
    } else if (formato === "reel") {
      const result = await publishFacebookReel(accessToken, platformUserId, bodyText, videoPublico);
      externalUrl = result.url;
      externalId = result.postId;
    } else {
      const result = await publishFacebookVideo(accessToken, platformUserId, bodyText, videoPublico);
      externalUrl = result.url;
      externalId = result.postId;
    }
  } else if (account.platform === "facebook") {
    if (!platformUserId) throw new Error("Página do Facebook inválida");

    // A Meta busca a imagem por URL pública, mesma regra do Instagram: a
    // rota assinada /api/media/ig/[token] serve para as duas plataformas.
    const rawImages = (post.imageUrl ?? "").split("|").filter(Boolean);
    const publicUrls = rawImages
      .filter((img) => img.startsWith("https://") || img.startsWith("data:image"))
      .map((img, i) => (img.startsWith("https://") ? img : buildIgMediaPublicUrl(post.id, i)));

    /**
     * STORY DE FOTO na página, e o caso que não existe: story precisa de
     * mídia. Post de texto puro marcado como story vai para o feed, porque a
     * alternativa seria perder a peça por causa do destino.
     */
    if (formato === "story" && publicUrls.length > 0) {
      const result = await publishFacebookPhotoStory(accessToken, platformUserId, publicUrls[0]);
      externalUrl = result.url;
      externalId = result.postId;
      aviso =
        (publicUrls.length > 1 ? "Story recebe uma mídia só: saiu a primeira lâmina. " : "") +
        "Story não tem legenda, então o texto da peça não foi publicado, e ele some em 24 horas.";
    } else {
      if (formato === "story") {
        aviso = "Story precisa de imagem ou vídeo, e esta peça é de texto: ela foi publicada no feed.";
      } else if (formato === "reel") {
        aviso = "Esta peça não é vídeo, então não podia sair como reel: ela foi publicada no feed.";
      }

      const result =
        publicUrls.length > 0
          ? await publishFacebookImagePost(accessToken, platformUserId, bodyText, publicUrls)
          : await publishFacebookText(accessToken, platformUserId, bodyText);
      externalUrl = result.url;
      externalId = result.postId;
    }
  } else if (account.platform === "youtube") {
    // YouTube só recebe vídeo. Post de outro tipo é recusado com mensagem
    // clara, no padrão do Instagram sem imagem.
    if (mediaType !== "video" || !post.imageUrl) {
      throw new Error(
        "O YouTube só recebe posts de vídeo. Gere o post com vídeo para publicar lá."
      );
    }

    let corpo: ReadableStream<Uint8Array> | ArrayBuffer;
    let tamanho: number;
    let mime = "video/mp4";
    if (post.imageUrl.startsWith("data:video")) {
      const [head, b64] = post.imageUrl.split(",", 2);
      mime = head.slice(5, head.indexOf(";")) || "video/mp4";
      const buf = Buffer.from(b64, "base64");
      corpo = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      tamanho = buf.byteLength;
    } else if (post.imageUrl.startsWith("https://")) {
      // `get` do SDK do Blob, e NÃO `fetch` na URL.
      //
      // O comentário que estava aqui afirmava que blob privado era alcançável
      // do servidor por fetch comum. É falso, e custou uma tentativa de
      // publicação em produção: "Não consegui baixar o vídeo (403)". Store
      // privado exige o SDK, que assina a leitura com o token do ambiente.
      //
      // O corpo é repassado como FLUXO. A gravação do Bruno tem 850 MB, e
      // materializar isso na memória da função derruba a execução antes de o
      // primeiro byte chegar ao Google.
      const midia = await abrirMidia(post.imageUrl);
      if (!midia) {
        throw new Error("Não consegui ler o vídeo no storage.");
      }
      mime = midia.mimeType;
      corpo = midia.stream;
      tamanho = midia.size;
    } else {
      throw new Error("Vídeo do post em formato não reconhecido");
    }

    // Título vem da primeira linha do texto; o resto vira descrição.
    const [primeiraLinha, ...resto] = bodyText.split("\n");
    const result = await publishYouTubeVideo(
      accessToken,
      { body: corpo, contentLength: tamanho, mimeType: mime },
      {
        title: primeiraLinha || "Vídeo",
        description: resto.join("\n").trim() || bodyText,
      }
    );
    externalUrl = result.url;
    externalId = result.videoId;

    // A capa escolhida pelo cliente (lib/media/capas-do-completo.ts). Até
    // 02/09 o vídeo subia sem capa e o YouTube escolhia um quadro qualquer.
    // Falha aqui vira aviso, não erro: o vídeo já está no ar.
    const capaUrl = metadata?.capaUrl;
    if (typeof capaUrl === "string" && capaUrl.startsWith("https://")) {
      try {
        const bytes = await lerMidia(capaUrl);
        if (!bytes) throw new Error("Não consegui ler a capa escolhida.");
        await setYouTubeThumbnail(accessToken, result.videoId, {
          bytes: await normalizarCapaParaYouTube(bytes),
          mimeType: "image/jpeg",
        });
      } catch (e) {
        console.warn("[publish] capa do YouTube falhou (não fatal):", e);
        aviso = e instanceof Error ? e.message : "O YouTube não aceitou a capa.";
      }
    } else {
      aviso = "O vídeo subiu sem capa escolhida; escolha uma no card do vídeo e ela vai para o YouTube na hora.";
    }
    // O YouTube só serve SD nos primeiros minutos e libera o HD depois de
    // reprocessar. O Bruno assistiu 12 min depois de subir e achou que o
    // arquivo tinha perdido qualidade (02/09); o arquivo era 1440p.
    aviso = `${aviso ? aviso + " " : ""}O YouTube mostra o vídeo em baixa qualidade nos primeiros minutos e libera o HD depois de processar (pode levar até algumas horas).`;
  } else if (account.platform === "tiktok") {
    // TikTok só recebe vídeo, no padrão do YouTube.
    if (mediaType !== "video" || !post.imageUrl) {
      throw new Error("O TikTok só recebe posts de vídeo. Gere o post com vídeo para publicar lá.");
    }
    // As escolhas da pessoa (privacidade, interações, conteúdo comercial).
    // Sem elas a função recusa com a instrução: a auditoria do TikTok reprova
    // publicação com escolha feita pelo sistema.
    const opcoes = opcoesDoTikTokNoPost(metadata);
    /**
     * O @ DA CONTA É RELIDO A CADA PUBLICAÇÃO.
     *
     * No primeiro teste real (28/09) o Bruno trocou o @ no TikTok depois de
     * conectar, e o link "ver publicado" montado com o @ gravado na conexão
     * abriu um perfil que não existia mais. A consulta do criador é a mesma
     * que a janela faz e custa uma chamada; se ela falhar, publica com o que
     * está gravado, porque o link é detalhe e o vídeo não.
     */
    let usuario = account.username;
    try {
      const criador = await lerInfoDoCriador(accessToken);
      if (criador.usuario && criador.usuario !== account.username) {
        usuario = criador.usuario;
        await prisma.socialAccount.update({
          where: { id: account.id },
          data: { username: criador.usuario, displayName: criador.nome || account.displayName, avatarUrl: criador.avatarUrl ?? account.avatarUrl },
        });
      }
    } catch (e) {
      console.warn("[tiktok] não reli o @ da conta, sigo com o gravado:", e);
    }
    const video = await lerVideoDoPost(post.imageUrl);
    // Corte de gravação é a pessoa falando; vídeo da esteira de IA é cena
    // sintética e leva o rótulo que o TikTok pede para esse caso.
    const geradoPorIa = metadata?.origem !== "video" && post.imageUrl.includes("/videos-ia/");
    const result = await publicarVideoNoTikTok(
      accessToken,
      video,
      bodyText,
      opcoes,
      usuario,
      geradoPorIa
    );
    externalId = result.publishId;
    externalUrl = result.url ?? (usuario ? `https://www.tiktok.com/@${usuario}` : null);
    if (opcoes.privacidade === "SELF_ONLY") {
      aviso = "Publicado como \"somente eu\": o vídeo está no seu perfil do TikTok, visível só para você.";
    } else if (result.status !== "PUBLISH_COMPLETE") {
      aviso = "O TikTok recebeu o vídeo e ainda está processando. Ele aparece no perfil em alguns minutos.";
    } else if (!result.url) {
      aviso = "O vídeo está no TikTok e passa pela moderação deles antes de ficar público, o que costuma levar minutos.";
    }
  } else {
    throw new Error(`Plataforma "${account.platform}" ainda não suportada`);
  }

  await prisma.post.update({
    where: { id: post.id },
    data: {
      status: "published",
      publishedAt: new Date(),
      externalUrl,
      externalId,
      /**
       * APAGAR A MIDIA DEPOIS DE PUBLICAR, mas so a que pesa.
       *
       * A limpeza existe porque a arte e gravada como DATA URL na propria
       * coluna, e um carrossel de cinco laminas passa de 2 MB POR POST: sem
       * apagar, o banco cresce sem limite com bytes que ja estao na rede.
       *
       * So que ela apagava TUDO, inclusive a URL do Blob, que nao pesa nada
       * (e um link) e e o endereco PERMANENTE do arquivo. Medido em 19/09: o
       * video foi gerado, subiu para o Blob, o post publicou e o `imageUrl`
       * virou null. O card passou a mostrar so o quadro e o cliente nao tinha
       * como assistir ao proprio video.
       *
       * Agora some so o que e data URL. Link fica.
       */
      imageUrl:
        post.mediaType === "article" || !post.imageUrl?.startsWith("data:") ? post.imageUrl : null,
      socialAccountId: account.id,
      metadata: metadataSemErro as never,
    },
  });

  // O COMPLETO FOI AO AR: os cortes ainda não publicados recebem o link dele
  // (05/10, lib/media/cortes-com-link-do-completo.ts). Falha aqui não desfaz
  // a publicação, que já aconteceu.
  if (account.platform === "youtube" && externalUrl) {
    await ligarCortesAoCompleto(post, externalUrl).catch((e) =>
      console.warn(`[publicar][${post.id}] os cortes ficaram sem o link do completo:`, e instanceof Error ? e.message : e)
    );
  }

  // Primeiro comentário com referências (LinkedIn apenas)
  if (account.platform === "linkedin" && externalId) {
    // O LINK DO CLIENTE (03/10): o texto chama para o primeiro comentário, e é
    // aqui, na hora de ir ao ar, que o link cadastrado em Configurações entra
    // nele. Ver lib/projeto/links-do-cliente.ts.
    const configDoProjeto = await prisma.project.findUnique({ where: { id: post.projectId }, select: { config: true } }).catch(() => null);
    const firstComment = primeiroComentarioComLink(
      (metadata as Record<string, unknown> | null)?.firstComment as string | undefined,
      post.content,
      lerLinks(configDoProjeto?.config)
    );
    if (typeof firstComment === "string" && firstComment.trim().length > 0) {
      // externalId pode ser URN completo (urn:li:share:XXXX) ou só o ID numérico
      const rawId = externalId.startsWith("urn:li:")
        ? externalId
        : externalUrl?.includes("ugcPost")
          ? `urn:li:ugcPost:${externalId}`
          : `urn:li:share:${externalId}`;
      // Os links das fontes chegam como redirecionamento do Google (grounding
      // do Gemini), uma URL de 200 caracteres que nao diz de onde e. Resolvidos
      // aqui, na hora de ir ao ar, para o comentario mostrar o site de verdade.
      const textoDoComentario = await resolverLinksDeFonte(firstComment.trim());
      // TRES tentativas, com espera crescente. Em 09/09 o post do Bruno saiu
      // SEM o comentario: uma tentativa unica, 3 s depois de criar o post,
      // falhou em silencio (o LinkedIn ainda nao tinha indexado o post) e a
      // mesma chamada, feita 40 minutos depois, voltou 201. O resultado vai
      // para o `metadata` do post, para a tela dizer se o comentario saiu.
      let saiu = false;
      let ultimoErro = "";
      for (const espera of [3_000, 10_000, 30_000]) {
        await new Promise((r) => setTimeout(r, espera));
        try {
          saiu = await publishLinkedInComment(accessToken, platformUserId, rawId, textoDoComentario, accountType);
        } catch (e) {
          ultimoErro = e instanceof Error ? e.message : String(e);
        }
        if (saiu) break;
      }
      await prisma.post.update({
        where: { id: post.id },
        data: {
          metadata: {
            ...metadataSemErro,
            firstComment: textoDoComentario,
            ...(saiu
              ? { firstCommentPublishedAt: new Date().toISOString() }
              : { firstCommentError: ultimoErro || "o LinkedIn recusou o comentário nas três tentativas" }),
          } as never,
        },
      }).catch(() => {});
      if (!saiu) console.warn(`[publish] primeiro comentário NÃO saiu no post ${post.id}: ${ultimoErro}`);
    }
  }

  return { url: externalUrl, externalId, aviso };
}
