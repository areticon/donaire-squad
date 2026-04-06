import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { PostsPanel } from "@/components/posts/posts-panel";
import { whereSocialAccountCanPublish } from "@/lib/social/account-filters";

export default async function PostsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      socialAccounts: {
        where: whereSocialAccountCanPublish,
        select: { id: true, platform: true, displayName: true, accountType: true },
      },
    },
  });

  if (!project || project.userId !== userId) notFound();

  const posts = await prisma.post.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      platform: true,
      content: true,
      imageUrl: true,
      imagePrompt: true,
      mediaType: true,
      status: true,
      scheduledAt: true,
      publishedAt: true,
      externalUrl: true,
      sourcesComment: true,
      createdAt: true,
      socialAccountId: true,
      socialAccount: { select: { displayName: true, platform: true } },
    },
  });

  return (
    <PostsPanel
      project={project}
      posts={posts}
      socialAccounts={project.socialAccounts}
    />
  );
}
