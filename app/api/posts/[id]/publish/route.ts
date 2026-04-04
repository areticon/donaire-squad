import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { executeOAuthPostPublish } from "@/lib/publish/oauth-post";
import { LINKEDIN_MAX_COMMENTARY_CHARS } from "@/lib/oauth/linkedin";
import { parseTwitterThread } from "@/lib/oauth/twitter";

const TWITTER_TWEET_MAX = 280;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { accountId } = await req.json();

  const post = await prisma.post.findUnique({
    where: { id },
    include: { project: { select: { userId: true } } },
  });

  if (!post || post.project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const account = await prisma.socialAccount.findUnique({ where: { id: accountId } });

  if (!account?.accessToken) {
    return NextResponse.json(
      { error: "Conta não conectada. Reconecte em Configurações." },
      { status: 400 }
    );
  }

  // ── Pre-flight platform validations ───────────────────────────────────────
  if (account.platform === "linkedin" && post.content && post.mediaType !== "article") {
    if (post.content.length > LINKEDIN_MAX_COMMENTARY_CHARS) {
      return NextResponse.json(
        {
          error: `O conteúdo tem ${post.content.length} caracteres, mas o LinkedIn aceita no máximo ${LINKEDIN_MAX_COMMENTARY_CHARS}. Edite o post antes de publicar.`,
          code: "CONTENT_TOO_LONG",
        },
        { status: 422 }
      );
    }
  }

  if (account.platform === "twitter" && post.content && post.mediaType !== "poll") {
    const tweets = parseTwitterThread(post.content);
    const overLimit = tweets
      .map((t, i) => ({ i: i + 1, len: t.length }))
      .filter(({ len }) => len > TWITTER_TWEET_MAX);
    if (overLimit.length > 0) {
      const details = overLimit.map(({ i, len }) => `Tweet ${i}: ${len} chars`).join(", ");
      return NextResponse.json(
        {
          error: `${overLimit.length} tweet(s) excedem o limite de ${TWITTER_TWEET_MAX} chars do X/Twitter (${details}). Edite o post antes de publicar.`,
          code: "CONTENT_TOO_LONG",
        },
        { status: 422 }
      );
    }
  }

  try {
    const { url } = await executeOAuthPostPublish(post, account);
    return NextResponse.json({ success: true, url });
  } catch (err) {
    console.error("[publish]", err);
    const msg = err instanceof Error ? err.message : "Falha ao publicar";
    if (msg.includes("Token") || msg.includes("expirado")) {
      await prisma.post.update({ where: { id }, data: { status: "failed" } });
      return NextResponse.json(
        { error: "Token expirado. Reconecte sua conta em Configurações." },
        { status: 401 }
      );
    }
    if (msg.includes("characters") && msg.includes("exceeded")) {
      return NextResponse.json(
        { error: `Conteúdo muito longo para o LinkedIn. Edite o post e reduza o texto para menos de ${LINKEDIN_MAX_COMMENTARY_CHARS} caracteres.`, code: "CONTENT_TOO_LONG" },
        { status: 422 }
      );
    }
    await prisma.post.update({ where: { id }, data: { status: "failed" } });
    return NextResponse.json(
      { error: msg.includes("não suportada") ? msg : "Falha ao publicar. Verifique as permissões da conta." },
      { status: 500 }
    );
  }
}
