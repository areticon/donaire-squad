// Publicar um vídeo no YouTube sobe o arquivo inteiro do cliente, e isso não
// cabe no padrão de segundos da Vercel. A rota NÃO estava coberta pelo
// `functions` do vercel.json (que só pega api/videos), então caía no padrão e
// teria morrido no primeiro envio de vídeo. Achado em 22/08, junto com a
// descoberta de que nenhum post de vídeo era criado em lugar nenhum, o que
// mantinha o ramo do YouTube inalcançável e o defeito invisível.
export const maxDuration = 800;

import { auth } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { executeOAuthPostPublish } from "@/lib/publish/oauth-post";
import { LINKEDIN_MAX_COMMENTARY_CHARS } from "@/lib/oauth/linkedin";
import { parseTwitterThread } from "@/lib/oauth/twitter";
import { vaiPeloBlotato } from "@/lib/publish/roteador";
import { podeUsarProjeto } from "@/lib/equipe/conta";

const TWITTER_TWEET_MAX = 280;

/**
 * Marca a falha E GRAVA O MOTIVO no post.
 *
 * Até 21/09 só o status mudava. A tela lê `metadata.error` para dizer o que
 * aconteceu e decidir a ação ("reconectar" quando é token), e sem o motivo
 * ela dizia "a rede recusou o post, marque e publique de novo" enquanto a
 * linha de baixo dizia "conecte o LinkedIn": o LinkedIn tinha REVOGADO o
 * acesso e publicar de novo não ia adiantar. O motivo que o servidor já
 * sabia agora chega em quem precisa dele.
 */
async function safeMarkPostFailed(postId: string, motivo?: string) {
  try {
    const atual = await prisma.post.findUnique({ where: { id: postId }, select: { metadata: true } });
    const metadata = { ...((atual?.metadata as Record<string, unknown> | null) ?? {}), ...(motivo ? { error: motivo.slice(0, 300) } : {}) };
    await prisma.post.update({ where: { id: postId }, data: { status: "failed", metadata: metadata as never } });
  } catch (e) {
    console.error("[publish] não foi possível marcar post como failed", e);
  }
}

/**
 * O código que a rede devolveu, extraído da mensagem do erro.
 *
 * Vale a pena pescar isto em vez de gravar "401": em 14/09 a tela dizia
 * "expirado" e o LinkedIn tinha dito `REVOKED_ACCESS_TOKEN`, revogado pelo
 * usuário. As duas causas pedem a mesma ação (reconectar) mas contam histórias
 * diferentes, e a diferença importava: quem revogou foi o próprio dono,
 * preparando a gravação do App Review.
 */
const CODIGOS_DE_RECUSA = [
  // O refresh do X falhou: o refresh token é de uso único e o novo não
  // ficou gravado, ou a autorização caiu. É reconectar, e a conta precisa
  // saber (visto em 21/09, com o motivo ficando em branco na conta).
  "Failed to refresh Twitter token",
  "REVOKED_ACCESS_TOKEN",
  "EXPIRED_ACCESS_TOKEN",
  "INVALID_ACCESS_TOKEN",
  "invalid_token",
  "invalid_grant",
  "OAuthException",
  // TikTok: token de acesso recusado, permissão retirada, ou a renovação
  // voltou sem token (o de renovação vence em 365 dias ou foi revogado).
  "access_token_invalid",
  "scope_not_authorized",
  "TikTok renovação do token falhou",
];

function motivoDaRecusa(msg: string): string | null {
  const achado = CODIGOS_DE_RECUSA.find((c) => msg.toLowerCase().includes(c.toLowerCase()));
  return achado ?? null;
}

/**
 * Grava na CONTA que a rede recusou o token.
 *
 * Existe porque até 14/09 esta descoberta morria aqui: o post virava `failed`,
 * a conta continuava verde e "ativa" na tela, e a mensagem mandava o cliente
 * reconectar numa tela onde nada indicava problema. Informação descoberta e não
 * gravada é informação que vai ser descoberta de novo pelo caminho mais caro,
 * que aqui é o cliente tentando publicar.
 *
 * Nunca derruba a publicação: se esta gravação falhar, o erro original é o que
 * importa e ele segue para a tela.
 */
async function safeMarcarContaParaReconectar(accountId: string, msg: string) {
  try {
    await prisma.socialAccount.update({
      where: { id: accountId },
      data: { needsReconnectAt: new Date(), needsReconnectReason: motivoDaRecusa(msg) },
    });
  } catch (e) {
    console.error("[publish] não foi possível marcar a conta para reconexão", e);
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

    if (!post || !(await podeUsarProjeto(userId, { id: post.projectId, userId: post.project.userId }))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const account = await prisma.socialAccount.findUnique({ where: { id: accountId } });

    // A conta ligada só pelo Blotato não tem token próprio e publica por lá
    // (30/09, lib/publish/roteador.ts).
    const pelaPonte = account ? vaiPeloBlotato(account) : false;
    if (!account || (!account.accessToken && !pelaPonte)) {
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
      const { url, aviso } = await executeOAuthPostPublish(post, account);
      return NextResponse.json({ success: true, url, aviso });
    } catch (err) {
      console.error("[publish]", err);
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : JSON.stringify(err).slice(0, 400);
      const lower = msg.toLowerCase();
      // Pelo Blotato, "reconectar" na Demandou não resolve nada: a conexão
      // vive no painel deles. A falha vai inteira para o post, com o código, e
      // a conta NÃO é marcada para reconectar (sumiria das campanhas à toa).
      if (pelaPonte) {
        await safeMarkPostFailed(id, msg);
        return NextResponse.json({ error: msg.slice(0, 800), code: "PUBLISH_FAILED" }, { status: 500 });
      }
      if (
        msg.includes("Token") ||
        msg.includes("expirado") ||
        lower.includes("401") ||
        lower.includes("unauthorized") ||
        lower.includes("invalid_token") ||
        lower.includes("failed to refresh twitter") ||
        lower.includes("access_token_invalid") ||
        lower.includes("scope_not_authorized") ||
        lower.includes("tiktok renovação do token falhou")
      ) {
        await safeMarkPostFailed(id, msg);
        await safeMarcarContaParaReconectar(account.id, msg);
        const revogado = motivoDaRecusa(msg) === "REVOKED_ACCESS_TOKEN";
        return NextResponse.json(
          {
            // A frase muda com o motivo, porque as duas causas pedem a mesma
            // ação e contam histórias diferentes. "Expirou" num acesso que o
            // próprio dono retirou faz a pessoa procurar defeito onde não tem.
            error: revogado
              ? "O acesso desta rede foi retirado nas permissões da sua conta. Reconecte em Configurações do projeto e publique de novo."
              : "A rede recusou o acesso. Reconecte em Configurações do projeto e publique de novo.",
            code: "PRECISA_RECONECTAR",
          },
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
      await safeMarkPostFailed(id, msg);
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
