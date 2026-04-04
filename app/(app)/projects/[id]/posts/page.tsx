import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { PostsPanel } from "@/components/posts/posts-panel";

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
      socialAccounts: { where: { isActive: true } },
    },
  });

  if (!project || project.userId !== userId) notFound();

  const posts = await prisma.post.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    include: {
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
