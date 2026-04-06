import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { executeOAuthPostPublish } from "@/lib/publish/oauth-post";
import { LINKEDIN_MAX_COMMENTARY_CHARS } from "@/lib/oauth/linkedin";
import { parseTwitterThread } from "@/lib/oauth/twitter";

const TWITTER_TWEET_MAX = 280;

async function safeMarkPostFailed(postId: string) {
  try {
    await prisma.post.update({ where: { id: postId }, data: { status: "failed" } });
  } catch (e) {
    console.error("[publish] não foi possível marcar post como failed", e);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    let accountId: string;
    try {
      const body = (await req.json()) as { accountId?: unknown };
      accountId = typeof body?.accountId === "string" ? body.accountId.trim() : "";
    } catch {
      return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
    }
    if (!accountId) {
      return NextResponse.json({ error: "accountId é obrigatório." }, { status: 400 });
    }

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

    if (account.projectId !== post.projectId) {
      return NextResponse.json(
        { error: "Esta conta não pertence a este projeto." },
        { status: 403 }
      );
    }

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
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : JSON.stringify(err).slice(0, 400);
      const lower = msg.toLowerCase();
      if (
        msg.includes("Token") ||
        msg.includes("expirado") ||
        lower.includes("401") ||
        lower.includes("unauthorized") ||
        lower.includes("invalid_token") ||
        lower.includes("failed to refresh twitter")
      ) {
        await safeMarkPostFailed(id);
        return NextResponse.json(
          { error: "Token expirado ou inválido. Reconecte a rede em Configurações do projeto." },
          { status: 401 }
        );
      }
      if (msg.includes("characters") && msg.includes("exceeded")) {
        return NextResponse.json(
          {
            error: `Conteúdo muito longo para o LinkedIn. Edite o post e reduza o texto para menos de ${LINKEDIN_MAX_COMMENTARY_CHARS} caracteres.`,
            code: "CONTENT_TOO_LONG",
          },
          { status: 422 }
        );
      }
      await safeMarkPostFailed(id);
      return NextResponse.json(
        {
          error: msg.slice(0, 800),
          code: "PUBLISH_FAILED",
        },
        { status: 500 }
      );
    }
  } catch (fatal) {
    console.error("[publish] erro não tratado (antes/durante publicação)", fatal);
    const m =
      fatal instanceof Error
        ? fatal.message
        : typeof fatal === "object" && fatal !== null && "message" in fatal
          ? String((fatal as { message: unknown }).message)
          : String(fatal);
    return NextResponse.json(
      {
        error: m.length > 0 ? m.slice(0, 600) : "Erro interno ao publicar.",
        code: "INTERNAL",
      },
      { status: 500 }
    );
  }
}
