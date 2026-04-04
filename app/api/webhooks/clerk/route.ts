export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function POST(req: NextRequest) {
  const payload = await req.json();
  const { type, data } = payload;

  try {
    switch (type) {
      case "user.created": {
        const email = data.email_addresses?.[0]?.email_address ?? "";
        await prisma.user.upsert({
          where: { clerkId: data.id },
          update: {},
          create: {
            clerkId: data.id,
            email,
            name: `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim(),
            imageUrl: data.image_url,
          },
        });
        break;
      }
      case "user.updated": {
        const email = data.email_addresses?.[0]?.email_address ?? "";
        await prisma.user.update({
          where: { clerkId: data.id },
          data: {
            email,
            name: `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim(),
            imageUrl: data.image_url,
          },
        });
        break;
      }
      case "user.deleted": {
        await prisma.user.delete({ where: { clerkId: data.id } });
        break;
      }
    }
  } catch (err) {
    console.error("[clerk/webhook]", err);
  }

  return NextResponse.json({ received: true });
}
