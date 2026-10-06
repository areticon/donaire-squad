import { after, NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { soODono } from "@/lib/equipe/permissoes";
import { apagarNota, corrigirNota } from "@/lib/cerebro/edicao";
import { registrarNota } from "@/lib/cerebro/captura";

/**
 * PATCH { nota, texto }: o cliente corrige uma nota do segundo cérebro.
 * DELETE { nota }: o cliente apaga uma nota (na fonte: apagar a regra apaga a regra).
 *
 * Só o dono (os termos: a memória é exclusiva do cliente; o membro da equipe
 * consulta). Depois da correção, o JEV relê a nota em `after()`.
 */
export const dynamic = "force-dynamic";

async function permitir(id: string): Promise<{ erro: NextResponse } | { ok: true }> {
  const { userId } = await auth();
  if (!userId) return { erro: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  const projeto = await prisma.project.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!projeto || !(await podeUsarProjeto(userId, projeto))) return { erro: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  const negado = await soODono(userId, projeto, "corrigir ou apagar a memória do projeto");
  if (negado) return { erro: negado };
  return { ok: true };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await permitir(id);
  if ("erro" in p) return p.erro;
  const corpo = (await req.json().catch(() => ({}))) as { nota?: string; texto?: string };
  if (typeof corpo.nota !== "string" || typeof corpo.texto !== "string") return NextResponse.json({ error: "Faltou a nota ou o texto." }, { status: 400 });
  const r = await corrigirNota(id, corpo.nota, corpo.texto);
  if (!r.ok) return NextResponse.json({ error: r.motivo }, { status: 400 });
  const nota = corpo.nota;
  after(() => registrarNota(id, nota));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await permitir(id);
  if ("erro" in p) return p.erro;
  const corpo = (await req.json().catch(() => ({}))) as { nota?: string };
  if (typeof corpo.nota !== "string") return NextResponse.json({ error: "Faltou a nota." }, { status: 400 });
  const r = await apagarNota(id, corpo.nota);
  if (!r.ok) return NextResponse.json({ error: r.motivo }, { status: 400 });
  return NextResponse.json({ ok: true });
}
