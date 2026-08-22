export const dynamic = "force-dynamic";
// Serve arquivo grande: a gravação de um cliente passa de 800 MB.
export const maxDuration = 800;

import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";

/**
 * Serve a mídia de um post para o DONO dela ver e baixar.
 *
 * Existe porque o Blob é um store **privado**, e URL de blob privado não abre
 * em `<img>`, `<video>` nem em link de download: responde 403. A tela mostrava
 * a URL crua nos dois lugares, então o vídeo aparecia como imagem quebrada e o
 * botão Baixar levava para uma página branca de Forbidden (relatado em 22/08).
 *
 * Diferente de `/api/media/ig/[token]`, que é pública e protegida por HMAC
 * porque quem busca é a Meta, esta rota é para o navegador de quem já está
 * logado. Então a proteção é a sessão mais a checagem de dono, e não um token.
 *
 * O corpo vai em FLUXO. `arrayBuffer()` aqui derrubaria a função por memória
 * com a gravação de 850 MB do teste.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const post = await prisma.post.findFirst({
    where: { id, project: { userId } },
    select: { imageUrl: true, mediaType: true },
  });
  if (!post?.imageUrl) {
    return NextResponse.json({ error: "Mídia não encontrada" }, { status: 404 });
  }

  const baixar = req.nextUrl.searchParams.get("download") === "1";
  const extensao = post.mediaType === "video" ? "mp4" : "jpg";

  // Data URL: a mídia mora no próprio banco, decodifica e devolve.
  if (post.imageUrl.startsWith("data:")) {
    const virgula = post.imageUrl.indexOf(",");
    if (virgula === -1) {
      return NextResponse.json({ error: "Mídia inválida" }, { status: 404 });
    }
    const mime = post.imageUrl.slice(5, virgula).replace(";base64", "") || "image/jpeg";
    const buffer = Buffer.from(post.imageUrl.slice(virgula + 1), "base64");
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, no-store",
        ...(baixar
          ? { "Content-Disposition": `attachment; filename="post-${id}.${extensao}"` }
          : {}),
      },
    });
  }

  // Blob privado: `get` com `access: "private"` é o único caminho. `fetch` na
  // URL, mesmo do servidor, devolve 403, ao contrário do que o comentário
  // antigo do código afirmava. Foi essa suposição errada que fez a publicação
  // no YouTube falhar com "Não consegui baixar o vídeo (403)".
  const blob = await get(post.imageUrl, { access: "private" });
  if (!blob || blob.statusCode !== 200) {
    return NextResponse.json({ error: "Mídia não encontrada" }, { status: 404 });
  }

  return new NextResponse(blob.stream, {
    headers: {
      "Content-Type": blob.blob.contentType,
      "Content-Length": String(blob.blob.size),
      "Cache-Control": "private, no-store",
      // Permite arrastar a barra do player sem baixar o arquivo inteiro.
      "Accept-Ranges": "bytes",
      ...(baixar
        ? { "Content-Disposition": `attachment; filename="post-${id}.${extensao}"` }
        : {}),
    },
  });
}
