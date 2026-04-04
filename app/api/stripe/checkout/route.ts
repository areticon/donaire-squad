export const dynamic = 'force-dynamic'

import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { createCheckoutSession, PLANS } from "@/lib/stripe";
import { prisma } from "@/lib/db/prisma";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { planId } = await req.json();

    const plan = PLANS[planId as keyof typeof PLANS];
    if (!plan || !("priceId" in plan) || !plan.priceId) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const clerkUser = await currentUser();
    const email = clerkUser?.emailAddresses?.[0]?.emailAddress ?? "";

    // Ensure user exists in our DB
    await prisma.user.upsert({
      where: { clerkId: userId },
      update: {},
      create: {
        clerkId: userId,
        email,
        name: `${clerkUser?.firstName ?? ""} ${clerkUser?.lastName ?? ""}`.trim(),
        imageUrl: clerkUser?.imageUrl,
      },
    });

    const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL}/billing`;
    const checkoutUrl = await createCheckoutSession(
      userId,
      email,
      plan.priceId,
      returnUrl
    );

    return NextResponse.json({ url: checkoutUrl });
  } catch (err) {
    console.error("[stripe/checkout]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
