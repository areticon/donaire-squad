import { auth } from "@/lib/auth/server";
import { returnToSeguro } from "@/lib/oauth/return-to";
import { NextRequest, NextResponse } from "next/server";
import { exchangeInstagramCode, getInstagramProfile } from "@/lib/oauth/instagram";
import { prisma } from "@/lib/db/prisma";

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
  const settingsUrl = `${appUrl}${baseReturn}${sep}instagram=success`;
  const errorUrl = `${appUrl}${baseReturn}${sep}instagram=error`;

  if (error || !code || !state || state !== savedState || !projectId) {
    return NextResponse.redirect(errorUrl);
  }

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
        refreshToken: null,
        tokenExpiresAt: tokens.expiresAt,
        displayName: profile.name ?? profile.username,
        username: profile.username,
        avatarUrl: profile.avatarUrl,
        isActive: true,
      },
      create: {
        projectId,
        platform: "instagram",
        platformUserId: profile.userId,
        accessToken: tokens.accessToken,
        refreshToken: null,
        tokenExpiresAt: tokens.expiresAt,
        displayName: profile.name ?? profile.username,
        username: profile.username,
        avatarUrl: profile.avatarUrl,
        isActive: true,
      },
    });

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
