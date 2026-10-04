export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse, after } from "next/server";
import { del } from "@vercel/blob";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { etiquetarMaterial, paraTela } from "@/lib/materiais/servidor";
import { ehEtiqueta } from "@/lib/materiais/tipos";

/** Um material: PATCH troca as etiquetas (ou pede nova leitura), DELETE apaga o arquivo de verdade. */

async function doProjeto(id: string, materialId: string, userId: string) {
  const p = await prisma.project.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!p || !(await podeUsarProjeto(userId, p))) return null;
  const m = await prisma.materialDoCliente.findFirst({ where: { id: materialId, projectId: id } });
  return m ? { p, m } : null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; materialId: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, materialId } = await params;
  const achado = await doProjeto(id, materialId, userId);
  if (!achado) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { etiquetas?: unknown; reler?: boolean };
  if (b.reler) {
    const m = await prisma.materialDoCliente.update({ where: { id: materialId }, data: { status: "analisando" } });
    after(() => etiquetarMaterial(materialId));
    return NextResponse.json({ material: paraTela(m) });
  }
  const etiquetas = Array.isArray(b.etiquetas) ? [...new Set(b.etiquetas.filter(ehEtiqueta))] : null;
  if (!etiquetas) return NextResponse.json({ error: "etiquetas é obrigatório" }, { status: 400 });
  const m = await prisma.materialDoCliente.update({ where: { id: materialId }, data: { etiquetas, etiquetasEditadas: true } });
  return NextResponse.json({ material: paraTela(m) });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; materialId: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, materialId } = await params;
  const achado = await doProjeto(id, materialId, userId);
  if (!achado) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Quem subiu ou o dono do projeto apagam; membro não apaga o material de outro.
  if (achado.m.userId !== userId && achado.p.userId !== userId) {
    return NextResponse.json({ error: "Só quem enviou ou o dono do projeto apagam este material." }, { status: 403 });
  }
  const urls = [achado.m.url, achado.m.miniaturaUrl, achado.m.folhaUrl, achado.m.recorteUrl].filter((u): u is string => Boolean(u));
  await del(urls, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch((e) => console.warn("[materiais] apagar do Blob falhou:", e instanceof Error ? e.message : e));
  await prisma.materialDoCliente.delete({ where: { id: materialId } });
  return NextResponse.json({ ok: true });
}
