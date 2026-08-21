import { auth } from "@/lib/auth/server";
import { returnToSeguro } from "@/lib/oauth/return-to";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { exchangeFacebookCode, listFacebookPages } from "@/lib/oauth/facebook";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  const savedState = req.cookies.get("oauth_state")?.value;
  const cookieUserId = req.cookies.get("oauth_user_id")?.value;
  const projectId = req.cookies.get("oauth_project_id")?.value;
  const returnTo = req.cookies.get("oauth_return_to")?.value;

  let userId = cookieUserId;
  if (!userId) {
    const session = await auth();
    userId = session.userId ?? undefined;
  }
  if (!userId) return NextResponse.redirect(new URL("/sign-in", req.url));

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const baseReturn = returnToSeguro(
    returnTo,
    projectId ? `/projects/${projectId}/settings` : "/dashboard"
  );
  const sep = baseReturn.includes("?") ? "&" : "?";
  const successUrl = `${appUrl}${baseReturn}${sep}facebook=success`;
  const errorUrl = `${appUrl}${baseReturn}${sep}facebook=error`;

  if (error || !code || !state || state !== savedState || !projectId) {
    return NextResponse.redirect(errorUrl);
  }

  try {
    const redirectUri = `${appUrl}/api/social/facebook/callback`;
    const { userToken } = await exchangeFacebookCode(code, redirectUri);

    // Quem publica é a página, então o que se guarda é o token DE PÁGINA,
    // um registro por página concedida. Lista vazia não é erro técnico: a
    // pessoa pode ter negado as páginas na tela de consentimento, ou não
    // administrar página nenhuma. Vira mensagem clara em vez de sucesso vazio.
    const pages = await listFacebookPages(userToken);
    if (pages.length === 0) {
      return NextResponse.redirect(`${errorUrl}&motivo=sem-pagina`);
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
          refreshToken: null,
          // Token de página derivado de token longo não expira por tempo.
          tokenExpiresAt: null,
          displayName: page.name,
          username: page.name,
          avatarUrl: page.avatarUrl,
          accountType: "organization",
          organizationId: page.pageId,
          isActive: true,
        },
        create: {
          projectId,
          platform: "facebook",
          platformUserId: page.pageId,
          accessToken: page.pageToken,
          refreshToken: null,
          tokenExpiresAt: null,
          displayName: page.name,
          username: page.name,
          avatarUrl: page.avatarUrl,
          accountType: "organization",
          organizationId: page.pageId,
          isActive: true,
        },
      });
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
