export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { executeOAuthPostPublish } from "@/lib/publish/oauth-post";

/** Cron: publica posts com status `scheduled` e horário já passado (OAuth LinkedIn/X). */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const scheduledPosts = await prisma.post.findMany({
    where: {
      status: "scheduled",
      scheduledAt: { lte: now },
    },
    include: {
      socialAccount: true,
    },
    take: 20,
  });

  const results: Array<{ id: string; status: string; reason?: string }> = [];

  for (const post of scheduledPosts) {
    if (!post.socialAccountId || !post.socialAccount) {
      await prisma.post.update({
        where: { id: post.id },
        data: { status: "failed" },
      });
      results.push({ id: post.id, status: "failed", reason: "No account" });
      continue;
    }

    if (!post.socialAccount.accessToken) {
      await prisma.post.update({
        where: { id: post.id },
        data: { status: "failed" },
      });
      results.push({ id: post.id, status: "failed", reason: "No token" });
      continue;
    }

    try {
      await executeOAuthPostPublish(post, post.socialAccount);
      results.push({ id: post.id, status: "published" });
    } catch (err) {
      console.error(`[cron] failed to publish ${post.id}:`, err);
      await prisma.post.update({
        where: { id: post.id },
        data: { status: "failed" },
      });
      results.push({ id: post.id, status: "failed" });
    }
  }

  return NextResponse.json({
    processed: scheduledPosts.length,
    results,
    timestamp: now.toISOString(),
  });
}
