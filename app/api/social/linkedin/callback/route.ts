import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import {
  exchangeLinkedInCode,
  exchangeLinkedInCodeForPages,
  getLinkedInProfile,
  getLinkedInAdminPages,
} from "@/lib/oauth/linkedin";
import { prisma } from "@/lib/db/prisma";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.redirect(new URL("/sign-in", req.url));

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");
  const errorDesc = req.nextUrl.searchParams.get("error_description");

  const savedState = req.cookies.get("oauth_state")?.value;
  const projectId = req.cookies.get("oauth_project_id")?.value;
  const forPages = req.cookies.get("oauth_for_pages")?.value === "1";
  const returnTo = req.cookies.get("oauth_return_to")?.value;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const baseReturn = returnTo ?? (projectId ? `/projects/${projectId}/settings` : "/dashboard");
  const settingsUrl = `${appUrl}${baseReturn}${baseReturn.includes("?") ? "&" : "?"}linkedin=success`;
  const errorUrl = `${appUrl}${baseReturn}${baseReturn.includes("?") ? "&" : "?"}linkedin=error`;

  if (error || !code || !state || state !== savedState || !projectId) {
    console.error("[linkedin/callback] OAuth error:", error, errorDesc);
    return NextResponse.redirect(new URL(errorUrl));
  }

  try {
    const redirectUri = `${appUrl}/api/social/linkedin/callback`;

    if (forPages) {
      // ── Pages app (Community Management API) ────────────────────────────────
      const tokens = await exchangeLinkedInCodeForPages(code, redirectUri);
      const profile = await getLinkedInProfile(tokens.access_token);
      const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

      // Fetch and save all administered org pages
      const orgPages = await getLinkedInAdminPages(tokens.access_token);
      console.log(`[linkedin/callback] pages app: ${orgPages.length} page(s) for ${profile.name}`);

      for (const page of orgPages) {
        await prisma.socialAccount.upsert({
          where: {
            projectId_platform_platformUserId: {
              projectId,
              platform: "linkedin",
              platformUserId: page.organizationId,
            },
          },
          update: {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token ?? null,
            tokenExpiresAt,
            displayName: page.name,
            username: page.vanityName ?? null,
            accountType: "organization",
            organizationId: page.organizationId,
            isActive: false,
          },
          create: {
            projectId,
            platform: "linkedin",
            platformUserId: page.organizationId,
            accountType: "organization",
            organizationId: page.organizationId,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token ?? null,
            tokenExpiresAt,
            displayName: page.name,
            username: page.vanityName ?? null,
            isActive: false,
          },
        });
      }

      const pagesSuccessUrl = projectId
        ? `${appUrl}/projects/${projectId}/settings?linkedin=pages_success&pages_count=${orgPages.length}`
        : `${appUrl}/dashboard`;

      const res = NextResponse.redirect(new URL(pagesSuccessUrl));
      res.cookies.delete("oauth_state");
      res.cookies.delete("oauth_project_id");
      res.cookies.delete("oauth_for_pages");
      res.cookies.delete("oauth_return_to");
      return res;

    } else {
      // ── Personal app (Share on LinkedIn) ────────────────────────────────────
      const tokens = await exchangeLinkedInCode(code, redirectUri);
      const profile = await getLinkedInProfile(tokens.access_token);
      const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

      await prisma.socialAccount.upsert({
        where: {
          projectId_platform_platformUserId: {
            projectId,
            platform: "linkedin",
            platformUserId: profile.sub,
          },
        },
        update: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? null,
          tokenExpiresAt,
          displayName: profile.name,
          username: profile.email,
          avatarUrl: profile.picture ?? null,
          accountType: "personal",
          isActive: true,
        },
        create: {
          projectId,
          platform: "linkedin",
          platformUserId: profile.sub,
          accountType: "personal",
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? null,
          tokenExpiresAt,
          displayName: profile.name,
          username: profile.email,
          avatarUrl: profile.picture ?? null,
          isActive: true,
        },
      });

      const res = NextResponse.redirect(new URL(settingsUrl));
      res.cookies.delete("oauth_state");
      res.cookies.delete("oauth_project_id");
      res.cookies.delete("oauth_for_pages");
      res.cookies.delete("oauth_return_to");
      return res;
    }
  } catch (err) {
    console.error("[linkedin/callback]", err);
    return NextResponse.redirect(new URL(errorUrl));
  }
}
