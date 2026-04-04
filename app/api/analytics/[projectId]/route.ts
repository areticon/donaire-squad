export const dynamic = 'force-dynamic'

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const posts = await prisma.post.findMany({
    where: { projectId, status: "published" },
    include: { metrics: true },
    orderBy: { publishedAt: "desc" },
  });

  // Aggregate totals
  const totals = posts.reduce(
    (acc, p) => {
      const m = p.metrics;
      if (!m) return acc;
      return {
        impressions: acc.impressions + m.impressions,
        likes: acc.likes + m.likes,
        comments: acc.comments + m.comments,
        shares: acc.shares + m.shares,
        clicks: acc.clicks + m.clicks,
        videoViews: acc.videoViews + m.videoViews,
      };
    },
    { impressions: 0, likes: 0, comments: 0, shares: 0, clicks: 0, videoViews: 0 }
  );

  // Performance by media type
  const byMediaType: Record<string, { impressions: number; likes: number; comments: number; count: number }> = {};
  for (const post of posts) {
    const type = post.mediaType ?? "text";
    if (!byMediaType[type]) byMediaType[type] = { impressions: 0, likes: 0, comments: 0, count: 0 };
    const m = post.metrics;
    if (m) {
      byMediaType[type].impressions += m.impressions;
      byMediaType[type].likes += m.likes;
      byMediaType[type].comments += m.comments;
    }
    byMediaType[type].count++;
  }

  // Performance by platform
  const byPlatform: Record<string, { impressions: number; likes: number; comments: number; count: number }> = {};
  for (const post of posts) {
    const platform = post.platform;
    if (!byPlatform[platform]) byPlatform[platform] = { impressions: 0, likes: 0, comments: 0, count: 0 };
    const m = post.metrics;
    if (m) {
      byPlatform[platform].impressions += m.impressions;
      byPlatform[platform].likes += m.likes;
      byPlatform[platform].comments += m.comments;
    }
    byPlatform[platform].count++;
  }

  // Best performing post
  const bestPost = posts
    .filter((p) => p.metrics)
    .sort((a, b) => {
      const scoreA = (a.metrics?.likes ?? 0) * 3 + (a.metrics?.comments ?? 0) * 5 + (a.metrics?.impressions ?? 0);
      const scoreB = (b.metrics?.likes ?? 0) * 3 + (b.metrics?.comments ?? 0) * 5 + (b.metrics?.impressions ?? 0);
      return scoreB - scoreA;
    })[0] ?? null;

  // Recent pipeline runs
  const recentRuns = await prisma.pipelineRun.findMany({
    where: { projectId },
    orderBy: { startedAt: "desc" },
    take: 5,
    select: {
      id: true,
      topic: true,
      status: true,
      config: true,
      startedAt: true,
      endedAt: true,
      _count: { select: { posts: true } },
    },
  });

  return NextResponse.json({
    totals,
    byMediaType,
    byPlatform,
    bestPost: bestPost
      ? {
          id: bestPost.id,
          platform: bestPost.platform,
          content: bestPost.content.slice(0, 200),
          mediaType: bestPost.mediaType,
          metrics: bestPost.metrics,
          publishedAt: bestPost.publishedAt,
        }
      : null,
    posts: posts.map((p) => ({
      id: p.id,
      platform: p.platform,
      mediaType: p.mediaType,
      dayOfWeek: p.dayOfWeek,
      content: p.content.slice(0, 150),
      publishedAt: p.publishedAt,
      metrics: p.metrics,
    })),
    recentRuns,
  });
}
