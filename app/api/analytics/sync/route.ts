export const dynamic = 'force-dynamic'

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { fetchLinkedInPostMetrics } from "@/lib/analytics/linkedin-metrics";
import { fetchTwitterPostMetrics } from "@/lib/analytics/twitter-metrics";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await req.json();
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      socialAccounts: { where: { isActive: true } },
    },
  });

  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Get all published posts with an externalId
  const publishedPosts = await prisma.post.findMany({
    where: {
      projectId,
      status: "published",
      externalId: { not: null },
    },
  });

  if (!publishedPosts.length) {
    return NextResponse.json({ synced: 0, message: "Nenhum post publicado para sincronizar" });
  }

  let synced = 0;
  const errors: string[] = [];

  for (const post of publishedPosts) {
    try {
      const account = project.socialAccounts.find((a) => a.platform === post.platform);
      if (!account?.accessToken || !post.externalId) continue;

      let metrics = { impressions: 0, likes: 0, comments: 0, shares: 0, clicks: 0, videoViews: 0 };

      if (post.platform === "linkedin") {
        const li = await fetchLinkedInPostMetrics(account.accessToken, post.externalId);
        metrics = { ...li, videoViews: 0 };
      } else if (post.platform === "twitter") {
        metrics = await fetchTwitterPostMetrics(account.accessToken, post.externalId);
      }

      await prisma.postMetric.upsert({
        where: { postId: post.id },
        create: {
          postId: post.id,
          ...metrics,
          syncedAt: new Date(),
        },
        update: {
          ...metrics,
          syncedAt: new Date(),
        },
      });

      synced++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Post ${post.id}: ${msg}`);
      console.warn("[analytics-sync] error for post", post.id, msg);
    }
  }

  return NextResponse.json({ synced, total: publishedPosts.length, errors });
}
