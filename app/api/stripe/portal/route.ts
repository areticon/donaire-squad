export const dynamic = "force-dynamic";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createBillingPortalSession } from "@/lib/stripe";
import { prisma } from "@/lib/db/prisma";

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = await prisma.user.findUnique({ where: { clerkId: userId } });
    if (!user?.stripeCustomerId) return NextResponse.json({ error: "No billing account" }, { status: 400 });
    const url = await createBillingPortalSession(user.stripeCustomerId, process.env.NEXT_PUBLIC_APP_URL + "/billing");
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[stripe/portal]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
