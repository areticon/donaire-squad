export const dynamic = 'force-dynamic'

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Return ALL accounts (active and inactive) so the Settings panel can show toggles
  const storedAccounts = await prisma.socialAccount.findMany({
    where: { projectId },
    select: {
      id: true,
      platform: true,
      displayName: true,
      username: true,
      isActive: true,
      accountType: true,
      organizationId: true,
      avatarUrl: true,
    },
  });

  return NextResponse.json({ storedAccounts });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, isActive } = await req.json();
  if (typeof id !== "string" || typeof isActive !== "boolean") {
    return NextResponse.json({ error: "id e isActive são obrigatórios" }, { status: 400 });
  }

  const account = await prisma.socialAccount.findUnique({
    where: { id },
    include: { project: { select: { userId: true } } },
  });
  if (!account || account.project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.socialAccount.update({
    where: { id },
    data: { isActive },
    select: { id: true, isActive: true },
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  await prisma.socialAccount.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
