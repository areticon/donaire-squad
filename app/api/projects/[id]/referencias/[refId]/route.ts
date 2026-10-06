import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { soODono } from "@/lib/equipe/permissoes";
import { limiteDoProjeto } from "@/lib/referencias/limite";

/**
 * Um perfil de referência (01/10). PATCH { status: "confirmado" | "recusado" | "sugerido" }.
 *
 * Só o dono confirma, até o limite do PLANO do dono por projeto e somando os
 * projetos da conta (06/10: Starter 3, Pro 6, Enterprise 10; ver
 * referenciasDoPlano em lib/planos.ts). Confirmar é a única coisa que aumenta a
 * lista: tirar dos confirmados e recusar sempre funcionam.
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
    // O limite do plano do dono (06/10), por projeto e somando a conta.
    const limite = await limiteDoProjeto(id);
    const noProjeto = await prisma.referenciaPerfil.count({ where: { projectId: id, status: "confirmado" } });
    if (noProjeto >= limite.porProjeto) {
      return NextResponse.json(
        { error: `O plano ${limite.plano} estuda até ${limite.porProjeto} perfis de referência por projeto. Tire um para confirmar outro.` },
        { status: 409 }
      );
    }
    const confirmados = await prisma.referenciaPerfil.count({ where: { status: "confirmado", project: { userId: projeto.userId } } });
    if (!limite.semTetoNaConta && confirmados >= limite.porConta) {
      return NextResponse.json(
        { error: `A conta já tem ${confirmados} perfis de referência confirmados, e o plano ${limite.plano} inclui ${limite.porConta}. Tire um para confirmar outro.` },
        { status: 409 }
      );
    }
  }
  const perfil = await prisma.referenciaPerfil.update({ where: { id: refId }, data: { status: status as string } });
  return NextResponse.json({ ok: true, perfil });
}
