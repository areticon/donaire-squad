export const dynamic = "force-dynamic";
// Serve a gravação inteira quando pedida. Arquivo grande, precisa de folga.
export const maxDuration = 800;

import { NextRequest, NextResponse } from "next/server";
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
  capaArte?: { url: string } | null;
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
    select: { clips: true, completoUrl: true, originalName: true, capaFonteUrl: true },
  });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });

  let url: string | null = null;
  let nome = "video";

  if (tipo === "completo") {
    url = video.completoUrl;
    nome = (video.originalName ?? "gravacao").replace(/\.[^.]+$/, "") + "-editado";
  } else if (tipo === "capa-fonte") {
    // O quadro que o squad escolheu como melhor rosto do vídeo: é a thumb do
    // card do vídeo completo no Gestor.
    url = video.capaFonteUrl;
    nome = "capa-fonte";
  } else {
    const trechos = (video.clips as unknown as Array<{ midia?: MidiaDoTrecho }>) ?? [];
    const trecho = trechos[Number(trechoParam)];
    const midia = trecho?.midia;
    if (midia) {
      if (tipo === "vertical") url = midia.vertical?.url ?? null;
      else if (tipo === "horizontal") url = midia.horizontal?.url ?? null;
      else if (tipo === "capa") url = midia.capa?.url ?? null;
      // A capa composta pelo nano banana, quando existe. Cai no quadro real se
      // a composição falhou: melhor a foto crua que arte sem o cliente dentro.
      else if (tipo === "capa-arte") url = midia.capaArte?.url ?? midia.capa?.url ?? null;
    }
    nome = `corte-${trechoParam}-${tipo}`;
  }

  if (!url) return NextResponse.json({ error: "Mídia não encontrada" }, { status: 404 });

  const extensao = tipo === "capa" || tipo === "capa-arte" || tipo === "capa-fonte" ? "jpg" : "mp4";

  // Mídia PÚBLICA (padrão para o material produzido desde 01/09): o player
  // fala direto com o CDN do storage, que entrega Range, cache e buffering de
  // verdade. Proxiar cada byte por uma função serverless foi o que fez os
  // players "começar e travar" (veredito do Bruno em 01/09).
  if (url.includes(".public.blob.vercel-storage.com")) {
    if (baixar) {
      // O download nomeado continua passando por aqui, porque o CDN não sabe
      // o nome amigável do arquivo.
      const res = await fetch(url);
      if (!res.ok) return NextResponse.json({ error: "Mídia não encontrada" }, { status: 404 });
      return new NextResponse(res.body, {
        headers: {
          "Content-Type": res.headers.get("content-type") ?? "application/octet-stream",
          ...(res.headers.get("content-length")
            ? { "Content-Length": res.headers.get("content-length")! }
            : {}),
          "Content-Disposition": `attachment; filename="${nome}.${extensao}"`,
        },
      });
    }
    return NextResponse.redirect(url, 302);
  }

  // Acervo antigo, privado: proxy com suporte REAL a Range. A versão anterior
  // anunciava Accept-Ranges e IGNORAVA o header: toda busca do player voltava
  // ao byte zero, que é exatamente o "começa e trava".
  const range = req.headers.get("range");
  const resposta = await fetch(url, {
    headers: {
      authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
      ...(range ? { range } : {}),
    },
  });
  if (resposta.status !== 200 && resposta.status !== 206) {
    return NextResponse.json({ error: "Mídia não encontrada" }, { status: 404 });
  }

  const cabecalhos = new Headers();
  for (const h of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
    const v = resposta.headers.get(h);
    if (v) cabecalhos.set(h, v);
  }
  if (!cabecalhos.has("accept-ranges")) cabecalhos.set("accept-ranges", "bytes");
  // O arquivo é imutável (cada versão ganha sufixo novo), então cache privado
  // longo é seguro; o no-store anterior obrigava a rebaixar tudo a cada play.
  cabecalhos.set("cache-control", "private, max-age=3600");
  if (baixar) {
    cabecalhos.set("content-disposition", `attachment; filename="${nome}.${extensao}"`);
  }

  return new NextResponse(resposta.body, {
    status: resposta.status,
    headers: cabecalhos,
  });
}
