import { auth } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { resultadosDoProjeto } from "@/lib/analytics/resultados";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || !(await podeUsarProjeto(userId, project))) redirect("/dashboard");

  // TODAS as peças do projeto, arquivadas inclusas (01/10): a tela antiga
  // buscava `status: "published"` e zerou quando o Bruno arquivou dois
  // projetos. Ver lib/analytics/resultados.ts.
  const [resultados, recentRuns] = await Promise.all([
    resultadosDoProjeto(id),
    prisma.pipelineRun.findMany({
      where: { projectId: id },
      orderBy: { startedAt: "desc" },
      take: 10,
      select: {
        id: true,
        topic: true,
        status: true,
        config: true,
        startedAt: true,
        endedAt: true,
        _count: { select: { posts: true } },
      },
    }),
  ]);

  return (
    <AnalyticsDashboard
      project={{ id: project.id, name: project.name }}
      resultados={resultados}
      recentRuns={recentRuns}
    />
  );
}
