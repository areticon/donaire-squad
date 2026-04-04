import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/ui/app-shell";
import { prisma } from "@/lib/db/prisma";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // Sync user to DB on first visit
  const clerkUser = await currentUser();
  if (clerkUser) {
    await prisma.user.upsert({
      where: { clerkId: userId },
      update: {},
      create: {
        clerkId: userId,
        email: clerkUser.emailAddresses[0]?.emailAddress ?? "",
        name: `${clerkUser.firstName ?? ""} ${clerkUser.lastName ?? ""}`.trim(),
        imageUrl: clerkUser.imageUrl,
      },
    });
  }

  return (
    <AppShell>
      {children}
    </AppShell>
  );
}
