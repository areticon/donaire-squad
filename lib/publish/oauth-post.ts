import { prisma } from "@/lib/db/prisma";
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
} from "@/lib/oauth/twitter";
import {
  buildIgMediaPublicUrl,
  publishInstagramCarousel,
  publishInstagramImage,
  refreshInstagramToken,
  INSTAGRAM_MAX_CAPTION,
} from "@/lib/oauth/instagram";

/**
 * Garante access token válido (Twitter refresh quando necessário).
 */
export async function resolveSocialAccountAccessToken(
  account: SocialAccount
): Promise<{ account: SocialAccount; accessToken: string }> {
  let accessToken = account.accessToken ?? "";
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
 * Publica um post via OAuth (LinkedIn / X). Atualiza o registro no banco.
 */
export async function executeOAuthPostPublish(
  post: Post,
  account: SocialAccount
): Promise<{ url: string | null; externalId: string | null }> {
  const { accessToken } = await resolveSocialAccountAccessToken(account);

  let externalUrl: string | null = null;
  let externalId: string | null = null;

  const bodyText = post.content ?? "";
  const mediaType = post.mediaType ?? "text";
  const accountType = (account.accountType as "personal" | "organization") ?? "personal";
  const platformUserId = account.platformUserId ?? "";
  const metadata = post.metadata as Record<string, unknown> | null;

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
      const isVideo =
        post.imageUrl.startsWith("data:video") || post.imageUrl.startsWith("https://storage.googleapis.com");

      if (isVideo && post.imageUrl.startsWith("data:video")) {
        const result = await publishLinkedInVideoPost(
          accessToken,
          platformUserId,
          post.content,
          post.imageUrl,
          accountType
        );
        externalUrl = result.url;
        externalId = result.postId;
      } else {
        const textWithLink = post.imageUrl.startsWith("https")
          ? `${bodyText}\n\n🎬 ${post.imageUrl}`
          : bodyText;
        const result = await publishToLinkedIn(accessToken, platformUserId, textWithLink, accountType);
        externalUrl = result.url;
        externalId = result.postId;
      }
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

    // A Meta busca a mídia por URL pública. https passa direto; data URL vai
    // pela rota assinada /api/media/ig/[token], que serve a imagem do banco.
    const publicUrls = rawImages.map((img, i) =>
      img.startsWith("https://") ? img : buildIgMediaPublicUrl(post.id, i)
    );

    const caption = bodyText.slice(0, INSTAGRAM_MAX_CAPTION);
    const result =
      publicUrls.length >= 2
        ? await publishInstagramCarousel(accessToken, platformUserId, publicUrls, caption)
        : await publishInstagramImage(accessToken, platformUserId, publicUrls[0], caption);
    externalUrl = result.url;
    externalId = result.mediaId;
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
      // Manter capa em artigos LinkedIn — a página pública /a/[token] ainda precisa da URL
      imageUrl: post.mediaType === "article" ? post.imageUrl : null,
      socialAccountId: account.id,
    },
  });

  // Primeiro comentário com referências (LinkedIn apenas)
  if (account.platform === "linkedin" && externalId) {
    const firstComment = (metadata as Record<string, unknown> | null)?.firstComment;
    if (typeof firstComment === "string" && firstComment.trim().length > 0) {
      // Aguarda 3s para o LinkedIn indexar o post antes de postar o comentário
      // (sem delay, o endpoint socialActions pode retornar 404 e silenciosamente falhar)
      await new Promise((r) => setTimeout(r, 3_000));
      // externalId pode ser URN completo (urn:li:share:XXXX) ou só o ID numérico
      const rawId = externalId.startsWith("urn:li:")
        ? externalId
        : externalUrl?.includes("ugcPost")
          ? `urn:li:ugcPost:${externalId}`
          : `urn:li:share:${externalId}`;
      try {
        await publishLinkedInComment(
          accessToken,
          platformUserId,
          rawId,
          firstComment.trim(),
          accountType
        );
      } catch (e) {
        console.warn("[publish] primeiro comentário falhou (não fatal):", e);
      }
    }
  }

  return { url: externalUrl, externalId };
}
