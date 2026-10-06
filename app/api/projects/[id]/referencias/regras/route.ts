import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { soODono } from "@/lib/equipe/permissoes";
import { registrarNota } from "@/lib/cerebro/captura";
import { criarRegraDoCliente } from "@/lib/referencias/regras";

/**
 * POST { texto, alvos, porque? }: uma regra escrita pelo próprio dono (02/10). Já
 * nasce aprovada e entra no que os agentes leem. Ver lib/referencias/regras.ts.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const projeto = await prisma.project.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!projeto || !(await podeUsarProjeto(userId, projeto))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const negado = await soODono(userId, projeto, "mexer nas regras do projeto");
  if (negado) return negado;
  const corpo = (await req.json().catch(() => ({}))) as { texto?: string; alvos?: string[]; porque?: string };
  try {
    const regra = await criarRegraDoCliente(id, String(corpo.texto ?? ""), Array.isArray(corpo.alvos) ? corpo.alvos : [], typeof corpo.porque === "string" ? corpo.porque : undefined);
    // O SEGUNDO CÉREBRO (06/10): a regra escrita pelo dono vira nota lida pelo JEV.
    after(() => registrarNota(id, `regra:${regra.id}`));
    return NextResponse.json({ ok: true, regra });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Não consegui salvar a regra." }, { status: 400 });
  }
}
