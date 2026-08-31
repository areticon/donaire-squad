export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import type { Trecho } from "@/lib/media/select-clips";
import { montarPostDeVideo } from "@/lib/media/youtube-post";

/**
 * Prepara a gravação inteira para ir ao canal do cliente no YouTube.
 *
 * Por que a gravação inteira, e não os trechos: **não existe recorte de vídeo
 * no produto** (achado em 22/08, sem ffmpeg nem nada equivalente no projeto).
 * Os trechos são marcações de tempo mais texto. Então o que dá para entregar
 * hoje, sem prometer o que não existe, é a gravação completa com os melhores
 * momentos virando CAPÍTULOS, que é o mesmo trabalho de seleção aproveitado de
 * outra forma. Quando o recorte existir, cada trecho vira um vídeo próprio e
 * esta rota passa a ser um caso particular.
 *
 * É UM post por gravação, não um por trecho. Um por trecho mandaria o mesmo
 * arquivo de centenas de megabytes para o YouTube várias vezes.
 *
 * O post nasce como rascunho: quem publica é o cliente, no quadro de posts,
 * pelo mesmo caminho de todas as outras redes. Isso importa além da economia de
 * código, porque a aprovação explícita por post é exatamente o que a
 * verificação do Google exige que a gente demonstre.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const video = await prisma.videoJob.findFirst({
    where: { id, project: { userId } },
    select: {
      id: true,
      status: true,
      clips: true,
      blobUrl: true,
      durationSec: true,
      projectId: true,
      project: { select: { name: true } },
    },
  });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });

  if (video.status !== "ready") {
    return NextResponse.json(
      {
        error: `Vídeo está em "${video.status}". Os capítulos saem dos trechos escolhidos, então isto roda depois que os posts ficam prontos.`,
      },
      { status: 409 }
    );
  }

  // Idempotência pelo metadata, e não por coluna nova: um clique repetido, ou
  // duas abas, não podem virar duas publicações do mesmo arquivo.
  const existente = await prisma.post.findFirst({
    where: {
      projectId: video.projectId,
      platform: "youtube",
      AND: [
        { metadata: { path: ["videoJobId"], equals: video.id } },
        { metadata: { path: ["gravacaoCompleta"], equals: true } },
      ],
    },
    select: { id: true, status: true },
  });
  if (existente) {
    return NextResponse.json({ post: existente, criado: false });
  }

  const trechos = (video.clips as unknown as Trecho[]) ?? [];
  const conteudo = montarPostDeVideo(
    trechos,
    video.durationSec ?? 0,
    video.project.name
  );

  const post = await prisma.post.create({
    data: {
      projectId: video.projectId,
      platform: "youtube",
      content: conteudo,
      mediaType: "video",
      // O arquivo original, no storage. A publicação lê daqui e repassa em
      // fluxo para o YouTube, sem materializar na memória.
      imageUrl: video.blobUrl,
      status: "draft",
      metadata: {
        origem: "video",
        videoJobId: video.id,
        gravacaoCompleta: true,
        capitulos: trechos.length,
      },
    },
    select: { id: true, status: true },
  });

  return NextResponse.json({ post, criado: true });
}
