export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { abrirMidia } from "@/lib/media/storage";
import { urlDoProjeto } from "@/lib/media/gemeo-servidor";
import { projetoVisivel } from "@/lib/equipe/conta";

/**
 * Mostra ao DONO do projeto um arquivo do gêmeo (foto, foto recortada, voz,
 * autorização), que mora no store privado e não abre direto no navegador.
 * Só arquivos da pasta `gemeo/<projeto>/`, e só para quem é dono do projeto.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await prisma.project.findFirst({ where: { id, ...projetoVisivel(userId) }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = req.nextUrl.searchParams.get("u");
  if (!urlDoProjeto(url, id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const midia = await abrirMidia(url);
  if (!midia) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(midia.stream, {
    headers: {
      "Content-Type": midia.mimeType,
      ...(midia.size ? { "Content-Length": String(midia.size) } : {}),
      // Rosto e voz: nada de cache compartilhado.
      "Cache-Control": "private, no-store",
    },
  });
}
