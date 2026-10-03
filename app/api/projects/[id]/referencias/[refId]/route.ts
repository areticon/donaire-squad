import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { soODono } from "@/lib/equipe/permissoes";
import { MAX_REFERENCIAS_POR_CONTA } from "@/lib/referencias/tipos";
import { MAX_REFERENCIAS_POR_PROJETO } from "@/lib/referencias/tipos-do-perfil-proprio";

/**
 * Um perfil de referência (01/10). PATCH { status: "confirmado" | "recusado" | "sugerido" }.
 *
 * Só o dono confirma, no máximo 3 por PROJETO (03/10) e 10 confirmados por CONTA (somando todos os
 * projetos do dono): é o teto que cabe na margem de todos os planos no
 * cenário enxuto da pesquisa de 01/10 (cerca de R$ 34 por cliente por mês).
 * Recusar não apaga: o perfil recusado não volta nas próximas sugestões.
 */
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; refId: string }> }) {
  const { id, refId } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const projeto = await prisma.project.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!projeto || !(await podeUsarProjeto(userId, projeto))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const negado = await soODono(userId, projeto, "mexer nos perfis de referência");
  if (negado) return negado;

  const ref = await prisma.referenciaPerfil.findFirst({ where: { id: refId, projectId: id } });
  if (!ref) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { status } = (await req.json().catch(() => ({}))) as { status?: string };
  if (!["confirmado", "recusado", "sugerido"].includes(status ?? "")) return NextResponse.json({ error: "Status inválido." }, { status: 400 });

  if (status === "confirmado" && ref.status !== "confirmado") {
    // Até 3 por PROJETO (03/10, decisão do Bruno), além do teto da conta.
    const noProjeto = await prisma.referenciaPerfil.count({ where: { projectId: id, status: "confirmado" } });
    if (noProjeto >= MAX_REFERENCIAS_POR_PROJETO) {
      return NextResponse.json(
        { error: `Cada projeto estuda até ${MAX_REFERENCIAS_POR_PROJETO} perfis de referência. Tire um para confirmar outro.` },
        { status: 409 }
      );
    }
    const confirmados = await prisma.referenciaPerfil.count({ where: { status: "confirmado", project: { userId: projeto.userId } } });
    if (confirmados >= MAX_REFERENCIAS_POR_CONTA) {
      return NextResponse.json(
        { error: `A conta já tem ${MAX_REFERENCIAS_POR_CONTA} perfis de referência confirmados. Tire um para confirmar outro.` },
        { status: 409 }
      );
    }
  }
  const perfil = await prisma.referenciaPerfil.update({ where: { id: refId }, data: { status: status as string } });
  return NextResponse.json({ ok: true, perfil });
}
