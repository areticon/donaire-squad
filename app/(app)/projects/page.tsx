import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FolderKanban, Plus, Zap } from "lucide-react";
import { ProjectCard } from "@/components/projects/project-card";

export default async function ProjectsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const projects = await prisma.project.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      niche: true,
      updatedAt: true,
      _count: { select: { agents: true, posts: true } },
    },
  });

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black" style={{ color: "var(--text-primary)" }}>Projetos</h1>
          <p className="mt-1" style={{ color: "var(--text-muted)" }}>
            Gerencie seus squads de agentes de IA
          </p>
        </div>
        <Button asChild>
          <Link href="/projects/new">
            <Plus className="w-4 h-4" />
            Novo projeto
          </Link>
        </Button>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
            <FolderKanban className="w-8 h-8" style={{ color: "var(--text-muted)" }} />
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            Nenhum projeto ainda
          </h2>
          <p className="max-w-sm mb-8" style={{ color: "var(--text-muted)" }}>
            Crie seu primeiro projeto e configure seu time de agentes de IA
            para gestão de redes sociais.
          </p>
          <Button size="lg" asChild>
            <Link href="/projects/new">
              <Zap className="w-4 h-4" />
              Criar primeiro projeto
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}

          <Link href="/projects/new">
            <Card className="border-dashed hover:border-orange-500/30 transition-all duration-200 cursor-pointer h-full">
              <CardContent className="p-6 flex flex-col items-center justify-center h-full min-h-[160px] text-center">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center border mb-3" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
                  <Plus className="w-5 h-5" style={{ color: "var(--text-muted)" }} />
                </div>
                <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
                  Novo projeto
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>
      )}
    </div>
  );
}
