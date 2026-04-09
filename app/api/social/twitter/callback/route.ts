import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { exchangeTwitterCode, getTwitterProfile } from "@/lib/oauth/twitter";
import { prisma } from "@/lib/db/prisma";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  const savedState = req.cookies.get("oauth_state")?.value;
  // userId stored in cookie during connect to avoid Clerk session loss across OAuth redirect
  const cookieUserId = req.cookies.get("oauth_user_id")?.value;
  const projectId = req.cookies.get("oauth_project_id")?.value;
  const codeVerifier = req.cookies.get("oauth_code_verifier")?.value;
  const returnTo = req.cookies.get("oauth_return_to")?.value;

  // Fall back to Clerk session if cookie is missing (e.g. direct navigation)
  let userId = cookieUserId;
  if (!userId) {
    const session = await auth();
    userId = session.userId ?? undefined;
  }
  if (!userId) return NextResponse.redirect(new URL("/sign-in", req.url));

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const baseReturn = returnTo ?? (projectId ? `/projects/${projectId}/settings` : "/dashboard");
  const settingsUrl = `${appUrl}${baseReturn}${baseReturn.includes("?") ? "&" : "?"}twitter=success`;
  const errorUrl = `${appUrl}${baseReturn}${baseReturn.includes("?") ? "&" : "?"}twitter=error`;

  if (error || !code || !state || state !== savedState || !projectId || !codeVerifier) {
    return NextResponse.redirect(errorUrl);
  }

  try {
    const redirectUri = `${appUrl}/api/social/twitter/callback`;
    const tokens = await exchangeTwitterCode(code, codeVerifier, redirectUri);
    const profile = await getTwitterProfile(tokens.access_token);

    const tokenExpiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    await prisma.socialAccount.upsert({
      where: {
        projectId_platform_platformUserId: {
          projectId,
          platform: "twitter",
          platformUserId: profile.id,
        },
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        tokenExpiresAt,
        displayName: profile.name,
        username: profile.username,
        isActive: true,
      },
      create: {
        projectId,
        platform: "twitter",
        platformUserId: profile.id,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        tokenExpiresAt,
        displayName: profile.name,
        username: profile.username,
        isActive: true,
      },
    });

    const res = NextResponse.redirect(settingsUrl);
    res.cookies.delete("oauth_state");
    res.cookies.delete("oauth_user_id");
    res.cookies.delete("oauth_project_id");
    res.cookies.delete("oauth_code_verifier");
    res.cookies.delete("oauth_return_to");
    return res;
  } catch (err) {
    console.error("[twitter/callback]", err);
    return NextResponse.redirect(errorUrl);
  }
}
