export const dynamic = "force-dynamic";
// A Meta busca o arquivo inteiro por aqui. Com vídeo, o padrão de segundos não
// serve: um Reels de um minuto leva mais que isso só para atravessar.
export const maxDuration = 800;

import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
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
    // Proxy em vez de redirect: a URL de origem é privada, e o que prometemos
    // aqui é o arquivo em si.
    //
    // `get` do SDK do Blob, e NÃO `fetch` na URL: store privado responde 403
    // para fetch comum, inclusive do servidor. Enquanto só imagens passavam por
    // aqui isso nunca apareceu, porque elas viviam como data URL no banco. Com
    // vídeo, que vive no storage, a rota quebraria na primeira publicação.
    const blob = await get(image, {
      access: "private",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    if (!blob || blob.statusCode !== 200) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Em FLUXO. Um Reels de um minuto passa de 10 MB, e a Meta busca o arquivo
    // inteiro: materializar isso na memória da função é desnecessário e, com
    // vídeo mais longo, fatal.
    return new NextResponse(blob.stream, {
      headers: {
        "Content-Type": blob.blob.contentType,
        "Content-Length": String(blob.blob.size),
        "Cache-Control": "no-store",
        // A Meta pede faixas de bytes ao buscar vídeo. Sem isto ela desiste.
        "Accept-Ranges": "bytes",
      },
    });
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
