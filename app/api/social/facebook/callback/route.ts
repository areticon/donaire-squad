import { lerVoltaDoOAuth, destinoDeSucesso, destinoDeErro } from "@/lib/oauth/volta-do-oauth";
import { NextRequest, NextResponse } from "next/server";
import { fotoPermanente } from "@/lib/social/foto-permanente";
import { prisma } from "@/lib/db/prisma";
import { readotarPostsOrfaos } from "@/lib/publish/contas-orfas";
import { exchangeFacebookCode, listFacebookPages } from "@/lib/oauth/facebook";

export async function GET(req: NextRequest) {
  // A volta pode cair no navegador de dentro do app do Instagram/Facebook,
  // sem cookie e sem sessão (achado de 04/10): ver lib/oauth/volta-do-oauth.ts.
  const volta = await lerVoltaDoOAuth(req, "facebook");
  if (!volta.ok) return NextResponse.redirect(volta.destino);
  const { projectId } = volta;
  const code = req.nextUrl.searchParams.get("code")!;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const successUrl = destinoDeSucesso(volta, "facebook");
  const errorUrl = destinoDeErro(volta, "facebook");

  try {
    const redirectUri = `${appUrl}/api/social/facebook/callback`;
    const { userToken } = await exchangeFacebookCode(code, redirectUri);

    // Quem publica é a página, então o que se guarda é o token DE PÁGINA,
    // um registro por página concedida. Lista vazia não é erro técnico: a
    // pessoa pode ter negado as páginas na tela de consentimento, ou não
    // administrar página nenhuma. Vira mensagem clara em vez de sucesso vazio.
    const pages = await listFacebookPages(userToken);
    if (pages.length === 0) {
      return NextResponse.redirect(destinoDeErro(volta, "facebook", "sem-pagina"));
    }

    for (const page of pages) {
      await prisma.socialAccount.upsert({
        where: {
          projectId_platform_platformUserId: {
            projectId,
            platform: "facebook",
            platformUserId: page.pageId,
          },
        },
        update: {
          accessToken: page.pageToken,
          // Reconectar limpa a marca de recusa: a conta volta a poder publicar e some
          // do estado "reconectar" na tela. Sem isto ela ficaria presa nele.
          needsReconnectAt: null,
          needsReconnectReason: null,
          refreshToken: null,
          // Token de página derivado de token longo não expira por tempo.
          tokenExpiresAt: null,
          displayName: page.name,
          username: page.name,
          avatarUrl: await fotoPermanente(page.avatarUrl, "facebook", page.pageId),
          accountType: "organization",
          organizationId: page.pageId,
          isActive: true,
        },
        create: {
          projectId,
          platform: "facebook",
          platformUserId: page.pageId,
          accessToken: page.pageToken,
          // Reconectar limpa a marca de recusa: a conta volta a poder publicar e some
          // do estado "reconectar" na tela. Sem isto ela ficaria presa nele.
          needsReconnectAt: null,
          needsReconnectReason: null,
          refreshToken: null,
          tokenExpiresAt: null,
          displayName: page.name,
          username: page.name,
          avatarUrl: await fotoPermanente(page.avatarUrl, "facebook", page.pageId),
          accountType: "organization",
          organizationId: page.pageId,
          isActive: true,
        },
      });
      await readotarPostsOrfaos(projectId, "facebook", page.pageId);
    }

    const res = NextResponse.redirect(successUrl);
    res.cookies.delete("oauth_state");
    res.cookies.delete("oauth_user_id");
    res.cookies.delete("oauth_project_id");
    res.cookies.delete("oauth_return_to");
    return res;
  } catch (e) {
    console.error("[facebook/callback]", e);
    return NextResponse.redirect(errorUrl);
  }
}
