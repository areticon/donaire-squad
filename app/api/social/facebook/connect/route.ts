import { auth } from "@/lib/auth/server";
import { returnToSeguro } from "@/lib/oauth/return-to";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getFacebookAuthUrl, facebookConfigured } from "@/lib/oauth/facebook";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!facebookConfigured()) {
    return NextResponse.json(
      { error: "Facebook ainda não configurado (FACEBOOK_APP_ID/SECRET ausentes)" },
      { status: 503 }
    );
  }

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const state = crypto.randomBytes(16).toString("hex");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const redirectUri = `${appUrl}/api/social/facebook/callback`;

  const defaultReturn = `/projects/${projectId}/settings`;
  const returnTo = returnToSeguro(
    req.nextUrl.searchParams.get("returnTo"),
    defaultReturn
  );

  const res = NextResponse.redirect(getFacebookAuthUrl(redirectUri, state));
  const cookieOpts = { httpOnly: true, maxAge: 600, path: "/" } as const;
  res.cookies.set("oauth_state", state, cookieOpts);
  res.cookies.set("oauth_user_id", userId, cookieOpts);
  res.cookies.set("oauth_project_id", projectId, cookieOpts);
  res.cookies.set("oauth_return_to", returnTo, cookieOpts);
  return res;
}
