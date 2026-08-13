import { auth } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/ui/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <AppShell>
      {children}
    </AppShell>
  );
}
