import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/**
 * GET /api/posts/by-day?projectId=...&scheduledDate=...
 * Returns all posts (linkedin + twitter) for a specific project day.
 */
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const scheduledDate = searchParams.get("scheduledDate");
  const postId = searchParams.get("postId"); // fallback: look up siblings of a known post

  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  // Verify ownership
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true },
  });
  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let posts: Array<{
    id: string;
    platform: string;
    content: string;
    imageUrl: string | null;
    mediaType: string | null;
    metadata: unknown;
    scheduledAt: Date | null;
    status: string;
    socialAccountId: string | null;
  }>;

  if (scheduledDate) {
    // Find posts scheduled within that date (UTC day)
    const dayStart = new Date(scheduledDate);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(scheduledDate);
    dayEnd.setUTCHours(23, 59, 59, 999);

    posts = await prisma.post.findMany({
      where: {
        projectId,
        scheduledAt: { gte: dayStart, lte: dayEnd },
        platform: { in: ["linkedin", "twitter"] },
      },
      select: {
        id: true,
        platform: true,
        content: true,
        imageUrl: true,
        mediaType: true,
        metadata: true,
        scheduledAt: true,
        status: true,
        socialAccountId: true,
      },
    });
  } else if (postId) {
    // Find the reference post first, then get siblings
    const ref = await prisma.post.findUnique({
      where: { id: postId },
      select: { scheduledAt: true, dayOfWeek: true, runId: true },
    });

    if (ref?.scheduledAt) {
      const dayStart = new Date(ref.scheduledAt);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(ref.scheduledAt);
      dayEnd.setUTCHours(23, 59, 59, 999);

      posts = await prisma.post.findMany({
        where: {
          projectId,
          scheduledAt: { gte: dayStart, lte: dayEnd },
          platform: { in: ["linkedin", "twitter"] },
          ...(ref.runId ? { runId: ref.runId } : {}),
        },
        select: {
          id: true,
          platform: true,
          content: true,
          imageUrl: true,
          mediaType: true,
          metadata: true,
          scheduledAt: true,
          status: true,
          socialAccountId: true,
        },
      });
    } else if (ref?.dayOfWeek !== undefined) {
      posts = await prisma.post.findMany({
        where: {
          projectId,
          dayOfWeek: ref.dayOfWeek,
          platform: { in: ["linkedin", "twitter"] },
          ...(ref.runId ? { runId: ref.runId } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 4,
        select: {
          id: true,
          platform: true,
          content: true,
          imageUrl: true,
          mediaType: true,
          metadata: true,
          scheduledAt: true,
          status: true,
          socialAccountId: true,
        },
      });
    } else {
      posts = [];
    }
  } else {
    return NextResponse.json({ error: "scheduledDate or postId required" }, { status: 400 });
  }

  return NextResponse.json({ posts });
}
