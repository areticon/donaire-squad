export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import type { Trecho } from "@/lib/media/select-clips";
import { MAX_X } from "@/lib/media/limits";

/**
 * Aprovação de um trecho: os textos viram posts de verdade.
 *
 * A partir daqui o conteúdo sai do fluxo de vídeo e entra no fluxo de posts que
 * já existe, com a rota de publicação, o agendamento e as métricas. O vídeo não
 * precisa de um caminho próprio de publicação: seria duplicar tudo.
 *
 * Instagram entra como rascunho mesmo sem poder publicar ainda, porque o App
 * Review da Meta está pendente. O texto fica pronto e a publicação passa a
 * funcionar no dia que a aprovação sair, sem retrabalho.
 */

const MAPA_PLATAFORMA: Record<string, string> = {
  linkedin: "linkedin",
  x: "twitter",
  instagram: "instagram",
};

type Corpo = {
  clipIndex?: number;
  redes?: Partial<Record<"linkedin" | "x" | "instagram", string>>;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { clipIndex, redes } = (await req.json().catch(() => ({}))) as Corpo;

  if (typeof clipIndex !== "number" || !redes || !Object.keys(redes).length) {
    return NextResponse.json(
      { error: "Informe o trecho e pelo menos uma rede." },
      { status: 400 }
    );
  }

  const video = await prisma.videoJob.findFirst({
    where: { id, project: { userId } },
    select: { id: true, status: true, clips: true, projectId: true },
  });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });

  const trechos = (video.clips as unknown as Array<Trecho & { aprovado?: boolean }>) ?? [];
  const trecho = trechos[clipIndex];
  if (!trecho) {
    return NextResponse.json({ error: "Trecho não encontrado." }, { status: 404 });
  }

  // O X recusa acima de 280. Validar aqui também, e não só na geração, porque
  // o cliente pode ter editado o texto na tela antes de aprovar.
  if (redes.x && redes.x.length > MAX_X) {
    return NextResponse.json(
      { error: `O post do X tem ${redes.x.length} caracteres e o limite é ${MAX_X}.` },
      { status: 400 }
    );
  }

  const criados = await prisma.$transaction(
    Object.entries(redes)
      .filter(([, texto]) => texto && texto.trim())
      .map(([rede, texto]) =>
        prisma.post.create({
          data: {
            projectId: video.projectId,
            platform: MAPA_PLATAFORMA[rede] ?? rede,
            content: texto!.trim(),
            mediaType: "text",
            status: "draft",
            metadata: {
              origem: "video",
              videoJobId: video.id,
              trecho: { inicio: trecho.inicio, fim: trecho.fim, titulo: trecho.titulo },
            },
          },
          select: { id: true, platform: true },
        })
      )
  );

  trechos[clipIndex] = { ...trecho, aprovado: true };
  await prisma.videoJob.update({
    where: { id },
    data: { clips: trechos as never },
  });

  return NextResponse.json({ ok: true, posts: criados });
}
