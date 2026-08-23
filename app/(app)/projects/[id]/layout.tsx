import { auth } from "@/lib/auth/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { ProjectNav } from "@/components/ui/project-nav";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, name: true, status: true, userId: true },
  });

  if (!project || project.userId !== userId) notFound();

  return (
    <div className="min-h-screen">
      {/* Project header */}
      <div
        // `top-14` no celular porque a barra do aplicativo já ocupa 14 ali.
        // Sem isso os dois cabeçalhos grudados ficariam um por cima do outro.
        className="sticky top-14 lg:top-0 z-20 lg:z-30"
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-surface)",
        }}
      >
        <div className="px-4 lg:px-8">
          <div className="flex items-center justify-between gap-2 h-14 min-w-0">
            <div className="flex items-center gap-3">
              <Link
                href="/projects"
                className="text-sm transition-colors"
                style={{ color: "var(--text-muted)" }}
              >
                Projetos
              </Link>
              <span style={{ color: "var(--border)" }}>/</span>
              <span
                className="text-sm font-medium truncate max-w-[200px]"
                style={{ color: "var(--text-primary)" }}
              >
                {project.name}
              </span>
            </div>
          </div>
          <ProjectNav projectId={id} isActive={project.status === "active"} />
        </div>
      </div>

      {children}
    </div>
  );
}
