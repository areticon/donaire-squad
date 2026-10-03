export const dynamic = 'force-dynamic'
// 300 s (01/10): a camada do perfil público roda atores da Apify, que levam
// de 20 a 90 s cada (em paralelo, um por rede).
export const maxDuration = 300

import { auth } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { sincronizarMetricas } from "@/lib/analytics/sincronizar";
import { podeUsarProjeto } from "@/lib/equipe/conta";

/**
 * Sincroniza as métricas dos posts publicados. A lógica mora em
 * lib/analytics/sincronizar.ts desde 28/09, quando esta rota gravava zero em
 * toda rede que falhava e o Bruno ficou sem os números dos últimos posts.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await req.json();
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, userId: true } });
  if (!project || !(await podeUsarProjeto(userId, project))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const r = await sincronizarMetricas(projectId);
  if (r.total === 0) return NextResponse.json({ ...r, message: "Nenhum post publicado para sincronizar" });
  return NextResponse.json(r);
}
