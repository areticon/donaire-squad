import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { content } = await req.json();

  const card = await prisma.campaignCard.findUnique({
    where: { id },
    include: { project: { select: { userId: true } } },
  });

  if (!card || card.project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.campaignCard.update({
    where: { id },
    data: { content },
  });

  // Sync content to linked Post if applicable
  if (card.postId && (card.cardType === "post_linkedin" || card.cardType === "post_twitter")) {
    await prisma.post.update({
      where: { id: card.postId },
      data: { content },
    });
  }

  return NextResponse.json({ card: updated });
}
