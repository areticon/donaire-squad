export const dynamic = "force-dynamic";
// Serve a gravação inteira quando pedida. Arquivo grande, precisa de folga.
export const maxDuration = 800;

import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";

/**
 * Serve a mídia produzida pelo worker para o dono do vídeo assistir e baixar.
 *
 * Mesma razão de `/api/posts/[id]/media`: o store é privado, e URL de blob
 * privado responde 403 em `<video>`, em `<img>` e em link de download. A
 * proteção aqui é a sessão mais a checagem de dono.
 *
 * Existe separada da rota de posts porque o corte ainda NÃO é post: ele vive
 * dentro do trecho do vídeo, e o cliente precisa assistir antes de decidir se
 * aquilo vira publicação. Obrigar a virar post para poder ver inverteria a
 * ordem que o Bruno pediu, em que o trabalho dele é aprovar.
 */

type MidiaDoTrecho = {
  vertical?: { url: string } | null;
  horizontal?: { url: string } | null;
  capa?: { url: string } | null;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const tipo = req.nextUrl.searchParams.get("tipo") ?? "vertical";
  const trechoParam = req.nextUrl.searchParams.get("trecho");
  const baixar = req.nextUrl.searchParams.get("download") === "1";

  const video = await prisma.videoJob.findFirst({
    where: { id, project: { userId } },
    select: { clips: true, completoUrl: true, originalName: true },
  });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });

  let url: string | null = null;
  let nome = "video";

  if (tipo === "completo") {
    url = video.completoUrl;
    nome = (video.originalName ?? "gravacao").replace(/\.[^.]+$/, "") + "-editado";
  } else {
    const trechos = (video.clips as unknown as Array<{ midia?: MidiaDoTrecho }>) ?? [];
    const trecho = trechos[Number(trechoParam)];
    const midia = trecho?.midia;
    if (midia) {
      if (tipo === "vertical") url = midia.vertical?.url ?? null;
      else if (tipo === "horizontal") url = midia.horizontal?.url ?? null;
      else if (tipo === "capa") url = midia.capa?.url ?? null;
    }
    nome = `corte-${trechoParam}-${tipo}`;
  }

  if (!url) return NextResponse.json({ error: "Mídia não encontrada" }, { status: 404 });

  const blob = await get(url, {
    access: "private",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  if (!blob || blob.statusCode !== 200) {
    return NextResponse.json({ error: "Mídia não encontrada" }, { status: 404 });
  }

  const extensao = tipo === "capa" ? "jpg" : "mp4";

  return new NextResponse(blob.stream, {
    headers: {
      "Content-Type": blob.blob.contentType,
      "Content-Length": String(blob.blob.size),
      "Cache-Control": "private, no-store",
      // Sem isto o player não deixa arrastar a barra sem baixar tudo, o que num
      // arquivo de centenas de megabytes torna a prévia inútil.
      "Accept-Ranges": "bytes",
      ...(baixar
        ? { "Content-Disposition": `attachment; filename="${nome}.${extensao}"` }
        : {}),
    },
  });
}
