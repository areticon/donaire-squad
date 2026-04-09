import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { generatePKCE, getTwitterAuthUrl } from "@/lib/oauth/twitter";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const state = crypto.randomBytes(16).toString("hex");
  const { codeVerifier, codeChallenge } = generatePKCE();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const redirectUri = `${appUrl}/api/social/twitter/callback`;

  const defaultReturn = `/projects/${projectId}/settings`;
  const returnTo = req.nextUrl.searchParams.get("returnTo") ?? defaultReturn;

  const authUrl = getTwitterAuthUrl(redirectUri, state, codeChallenge);

  const res = NextResponse.redirect(authUrl);
  const cookieOpts = { httpOnly: true, maxAge: 600, path: "/" } as const;
  res.cookies.set("oauth_state", state, cookieOpts);
  res.cookies.set("oauth_user_id", userId, cookieOpts);
  res.cookies.set("oauth_project_id", projectId, cookieOpts);
  res.cookies.set("oauth_code_verifier", codeVerifier, cookieOpts);
  res.cookies.set("oauth_return_to", returnTo, cookieOpts);
  return res;
}
