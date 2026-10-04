export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { abrirMidia } from "@/lib/media/storage";

/**
 * O ARQUIVO DE UM MATERIAL, pela plataforma (03/10/2026). O Blob é privado e
 * `<img>` não manda credencial: a grade lê a miniatura por aqui (?v=mini), a
 * prévia grande lê o original (?v=original) e o recorte (?v=recorte).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; materialId: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, materialId } = await params;
  const p = await prisma.project.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!p || !(await podeUsarProjeto(userId, p))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const m = await prisma.materialDoCliente.findFirst({ where: { id: materialId, projectId: id }, select: { url: true, miniaturaUrl: true, recorteUrl: true } });
  if (!m) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const v = req.nextUrl.searchParams.get("v");
  const url = v === "original" ? m.url : v === "recorte" ? m.recorteUrl : (m.miniaturaUrl ?? m.url);
  if (!url) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const f = await abrirMidia(url);
  if (!f) return NextResponse.json({ error: "Arquivo indisponível" }, { status: 404 });
  return new NextResponse(f.stream, {
    headers: { "content-type": f.mimeType, ...(f.size ? { "content-length": String(f.size) } : {}), "cache-control": "private, max-age=3600" },
  });
}
