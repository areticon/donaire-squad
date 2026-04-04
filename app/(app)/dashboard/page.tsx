import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  CheckCircle2,
  Clock,
  FolderKanban,
  Plus,
  Zap,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

async function getDashboardData(userId: string) {
  const [user, projects, recentPosts, recentRuns] = await Promise.all([
    prisma.user.findUnique({ where: { clerkId: userId } }),
    prisma.project.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.post.findMany({
      where: { project: { userId } },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { project: { select: { name: true } } },
    }),
    prisma.pipelineRun.findMany({
      where: { project: { userId } },
      orderBy: { startedAt: "desc" },
      take: 5,
      include: { project: { select: { name: true } } },
    }),
  ]);

  const totalPosts = await prisma.post.count({
    where: { project: { userId }, status: "published" },
  });

  return { user, projects, recentPosts, recentRuns, totalPosts };
}

const STATUS_COLORS: Record<string, string> = {
  published: "success",
  draft: "secondary",
  scheduled: "warning",
  failed: "destructive",
  rejected: "secondary",
  running: "default",
  completed: "success",
  setup: "secondary",
  active: "success",
  paused: "warning",
};

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { user, projects, recentPosts, recentRuns, totalPosts } =
    await getDashboardData(userId);

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-black" style={{ color: "var(--text-primary)" }}>
          Olá, {user?.name?.split(" ")[0] ?? "usuário"}
        </h1>
        <p className="mt-1" style={{ color: "var(--text-muted)" }}>
          Seu squad de IA está pronto para operar — gerencie campanhas, monitore resultados e automatize sua presença digital.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Posts publicados", value: totalPosts, icon: CheckCircle2, color: "text-green-400" },
          { label: "Projetos ativos", value: projects.filter((p) => p.status === "active").length, icon: FolderKanban, color: "text-blue-400" },
          { label: "Runs executados", value: recentRuns.length, icon: Zap, color: "text-orange-400" },
          { label: "Posts agendados", value: recentPosts.filter((p) => p.status === "scheduled").length, icon: Clock, color: "text-purple-400" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>{stat.label}</p>
                  <Icon className={`w-4 h-4 ${stat.color}`} />
                </div>
                <p className="text-3xl font-black" style={{ color: "var(--text-primary)" }}>
                  {stat.value}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Projects */}
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-4">
            <CardTitle className="text-base">Projetos</CardTitle>
            <Button size="sm" asChild>
              <Link href="/projects/new">
                <Plus className="w-3.5 h-3.5" />
                Novo
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <div className="text-center py-8">
                <FolderKanban className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--border)" }} />
                <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>Nenhum projeto ainda</p>
                <Button size="sm" asChild>
                  <Link href="/projects/new">Criar primeiro projeto</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {projects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border transition-colors group hover:border-orange-500/40"
                    style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}
                  >
                    <div>
                      <p className="text-sm font-medium group-hover:text-orange-500 transition-colors" style={{ color: "var(--text-primary)" }}>
                        {project.name}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {formatDate(project.updatedAt)}
                      </p>
                    </div>
                    <Badge variant={(STATUS_COLORS[project.status] as "success" | "secondary" | "warning" | "destructive" | "default" | "outline") ?? "secondary"}>
                      {project.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Posts */}
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-orange-400" />
              Posts recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentPosts.length === 0 ? (
              <div className="text-center py-8">
                <BarChart3 className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--border)" }} />
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nenhum post publicado ainda</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentPosts.map((post) => (
                  <div
                    key={post.id}
                    className="flex items-start gap-3 p-3 rounded-lg border"
                    style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>
                        {post.project.name} · {post.platform}
                      </p>
                      <p className="text-sm line-clamp-2" style={{ color: "var(--text-primary)" }}>
                        {post.content.slice(0, 100)}...
                      </p>
                    </div>
                    <Badge
                      variant={(STATUS_COLORS[post.status] as "success" | "secondary" | "warning" | "destructive" | "default" | "outline") ?? "secondary"}
                      className="shrink-0"
                    >
                      {post.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
