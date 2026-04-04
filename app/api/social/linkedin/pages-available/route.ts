export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

/**
 * Tells the frontend whether the separate LinkedIn "pages" app credentials
 * are configured (LINKEDIN_PAGES_CLIENT_ID + LINKEDIN_PAGES_CLIENT_SECRET).
 */
export async function GET() {
  const available =
    !!process.env.LINKEDIN_PAGES_CLIENT_ID &&
    !!process.env.LINKEDIN_PAGES_CLIENT_SECRET;

  return NextResponse.json({ available });
}
