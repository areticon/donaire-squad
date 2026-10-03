export const dynamic = "force-dynamic";
// Serve a gravação inteira quando pedida. Arquivo grande, precisa de folga.
export const maxDuration = 800;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { projetoVisivel } from "@/lib/equipe/conta";

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
    where: { id, project: projetoVisivel(userId) },
    select: { clips: true, completoUrl: true, originalName: true, capaFonteUrl: true, capas: true, blobUrl: true },
  });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });

  let url: string | null = null;
  let nome = "video";

  if (tipo === "completo") {
    url = video.completoUrl;
    nome = (video.originalName ?? "gravacao").replace(/\.[^.]+$/, "") + "-editado";
  } else if (tipo === "fonte") {
    // A GRAVAÇÃO (03/10): o player do controle do corte toca a fala de antes
    // do corte, pulando o que sai, sem render. Vai pelo proxy com Range
    // abaixo (o store da gravação é privado), e o player pede só as faixas que
    // toca, nunca o arquivo inteiro.
    url = video.blobUrl;
    nome = (video.originalName ?? "gravacao").replace(/\.[^.]+$/, "");
  } else if (tipo === "capa-fonte") {
    // O quadro que o squad escolheu como melhor rosto do vídeo: é a thumb do
    // card do vídeo completo no Gestor.
    url = video.capaFonteUrl;
    nome = "capa-fonte";
  } else if (tipo === "capa-completo") {
    // A capa ESCOLHIDA do vídeo completo (VideoJob.capas), que é a miniatura
    // do card do YouTube. Sem capa escolhida, o quadro do melhor rosto: o card
    // nunca mais recebe o MP4 para desenhar como imagem (teste de 29/09).
    const capas = video.capas as { opcoes?: Array<{ url?: string }>; escolhida?: number } | null;
    url = capas?.opcoes?.[capas.escolhida ?? 0]?.url ?? video.capaFonteUrl;
    nome = "capa-do-video";
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

  const extensao = tipo.startsWith("capa") ? "jpg" : "mp4";

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
    // O redirecionamento pode ser guardado pelo navegador por 5 minutos
    // (30/09). Sem isto, CADA pedido de faixa do player (o começo, cada busca na
    // barra, cada retomada) passava de novo por sessão e banco antes de chegar
    // ao CDN: medido no dev local, 0,5 a 1,4 s por pedido. Cinco minutos cobrem
    // uma sessão de assistir e não seguram por muito um corte refeito, que
    // troca a URL de destino.
    const resposta = NextResponse.redirect(url, 302);
    // SEM cache do redirecionamento (30/09): com 5 min, o card continuava
    // tocando o corte simples depois de a montagem trocar o vídeo, e o Bruno viu
    // "os cortes não têm edição nenhuma". O CDN continua cacheando o arquivo.
    resposta.headers.set("Cache-Control", "no-store");
    return resposta;
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
