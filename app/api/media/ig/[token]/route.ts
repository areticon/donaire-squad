export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { verifyIgMediaToken } from "@/lib/oauth/instagram";

/**
 * Serve a imagem de um post para a Meta buscar na hora de publicar.
 *
 * Existe porque o Instagram só aceita mídia por URL https pública, e as
 * nossas imagens vivem como data URL no banco ou em Blob privado. A rota é
 * pública de propósito, e a segurança vem do token: HMAC com segredo do
 * servidor sobre (postId, índice), inviável de enumerar. Quando o post é
 * publicado e a imageUrl é limpa, a URL passa a responder 404 sozinha.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const verified = verifyIgMediaToken(token);
  if (!verified) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const post = await prisma.post.findUnique({
    where: { id: verified.postId },
    select: { imageUrl: true },
  });
  const images = post?.imageUrl?.split("|").filter(Boolean) ?? [];
  const image = images[verified.index];
  if (!image) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (image.startsWith("data:")) {
    const comma = image.indexOf(",");
    if (comma === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const mime = image.slice(5, comma).replace(";base64", "") || "image/jpeg";
    const buffer = Buffer.from(image.slice(comma + 1), "base64");
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
      },
    });
  }

  if (image.startsWith("https://")) {
    // Proxy em vez de redirect: a URL de origem pode ser assinada ou privada
    // para a Meta, e o que prometemos aqui é a imagem em si.
    const res = await fetch(image, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const buffer = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
