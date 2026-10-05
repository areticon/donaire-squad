import { lerVoltaDoOAuth, destinoDeSucesso, destinoDeErro } from "@/lib/oauth/volta-do-oauth";
import { NextRequest, NextResponse } from "next/server";
import { fotoPermanente } from "@/lib/social/foto-permanente";
import { exchangeInstagramCode, getInstagramProfile } from "@/lib/oauth/instagram";
import { prisma } from "@/lib/db/prisma";
import { readotarPostsOrfaos } from "@/lib/publish/contas-orfas";

export async function GET(req: NextRequest) {
  // A volta pode cair no navegador de dentro do app do Instagram/Facebook,
  // sem cookie e sem sessão (achado de 04/10): ver lib/oauth/volta-do-oauth.ts.
  const volta = await lerVoltaDoOAuth(req, "instagram");
  if (!volta.ok) return NextResponse.redirect(volta.destino);
  const { projectId } = volta;
  const code = req.nextUrl.searchParams.get("code")!;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const settingsUrl = destinoDeSucesso(volta, "instagram");
  const errorUrl = destinoDeErro(volta, "instagram");

  try {
    const redirectUri = `${appUrl}/api/social/instagram/callback`;
    // A troca já devolve o token longo (~60 dias). A renovação acontece em
    // resolveSocialAccountAccessToken quando faltar menos de 7 dias.
    const tokens = await exchangeInstagramCode(code, redirectUri);
    const profile = await getInstagramProfile(tokens.accessToken);

    await prisma.socialAccount.upsert({
      where: {
        projectId_platform_platformUserId: {
          projectId,
          platform: "instagram",
          platformUserId: profile.userId,
        },
      },
      update: {
        accessToken: tokens.accessToken,
        // Reconectar limpa a marca de recusa: a conta volta a poder publicar e some
        // do estado "reconectar" na tela. Sem isto ela ficaria presa nele.
        needsReconnectAt: null,
        needsReconnectReason: null,
        refreshToken: null,
        tokenExpiresAt: tokens.expiresAt,
        displayName: profile.name ?? profile.username,
        username: profile.username,
        avatarUrl: await fotoPermanente(profile.avatarUrl, "instagram", profile.userId),
        isActive: true,
      },
      create: {
        projectId,
        platform: "instagram",
        platformUserId: profile.userId,
        accessToken: tokens.accessToken,
        // Reconectar limpa a marca de recusa: a conta volta a poder publicar e some
        // do estado "reconectar" na tela. Sem isto ela ficaria presa nele.
        needsReconnectAt: null,
        needsReconnectReason: null,
        refreshToken: null,
        tokenExpiresAt: tokens.expiresAt,
        displayName: profile.name ?? profile.username,
        username: profile.username,
        avatarUrl: await fotoPermanente(profile.avatarUrl, "instagram", profile.userId),
        isActive: true,
      },
    });
    await readotarPostsOrfaos(projectId, "instagram", profile.userId);

    const res = NextResponse.redirect(settingsUrl);
    res.cookies.delete("oauth_state");
    res.cookies.delete("oauth_user_id");
    res.cookies.delete("oauth_project_id");
    res.cookies.delete("oauth_return_to");
    return res;
  } catch (err) {
    console.error("[instagram/callback]", err);
    return NextResponse.redirect(errorUrl);
  }
}
