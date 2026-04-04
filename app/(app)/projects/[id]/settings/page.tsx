import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { SocialConnectPanel } from "@/components/social/social-connect-panel";

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { socialAccounts: true },
  });

  if (!project || project.userId !== userId) notFound();

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-black" style={{ color: "var(--text-primary)" }}>Configurações</h1>
        <p className="mt-1" style={{ color: "var(--text-muted)" }}>{project.name}</p>
      </div>
      <SocialConnectPanel project={project} initialAccounts={project.socialAccounts} />
    </div>
  );
}
