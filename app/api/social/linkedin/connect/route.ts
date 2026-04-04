import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getLinkedInAuthUrl } from "@/lib/oauth/linkedin";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  // forPages=true uses the second LinkedIn app (Community Management API)
  const forPages = req.nextUrl.searchParams.get("pages") === "1";

  // returnTo: where to redirect after OAuth completes (defaults to settings)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const defaultReturn = `/projects/${projectId}/settings`;
  const returnTo = req.nextUrl.searchParams.get("returnTo") ?? defaultReturn;

  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${appUrl}/api/social/linkedin/callback`;
  const authUrl = getLinkedInAuthUrl(redirectUri, state, forPages);

  const res = NextResponse.redirect(authUrl);
  res.cookies.set("oauth_state", state, { httpOnly: true, maxAge: 600, path: "/" });
  res.cookies.set("oauth_project_id", projectId, { httpOnly: true, maxAge: 600, path: "/" });
  res.cookies.set("oauth_for_pages", forPages ? "1" : "0", { httpOnly: true, maxAge: 600, path: "/" });
  res.cookies.set("oauth_return_to", returnTo, { httpOnly: true, maxAge: 600, path: "/" });
  return res;
}
