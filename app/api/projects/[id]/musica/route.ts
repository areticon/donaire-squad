export const dynamic = "force-dynamic";

import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";

/**
 * A trilha do projeto, que o CLIENTE traz.
 *
 * ## Por que o upload, e não um catálogo
 *
 * Decisão jurídica de 23/08, e ela inverteu a primeira recomendação: a linha
 * que separa ferramenta de distribuidora não é a música, é QUEM BAIXA O
 * ARQUIVO. Se a Demandou hospedasse catálogo, precisaria de sublicença (a
 * Artlist proíbe explicitamente projetos para canais de terceiros). Com o
 * cliente subindo o arquivo dele, a Demandou é ferramenta de edição, como o
 * CapCut, e a engenharia é a mesma para biblioteca do YouTube (só CC-BY),
 * assinatura própria ou faixa autoral.
 *
 * ## Por que upload direto do navegador
 *
 * Mesmo desenho do vídeo: função serverless tem limite de corpo na casa dos
 * poucos megabytes, e um MP3 de três minutos passa disso. Esta rota só assina
 * o token e recebe o aviso; o arquivo vai direto ao storage.
 */

const TIPOS_DE_AUDIO = [
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/wav",
  "audio/ogg",
];

/** 40 MB cobrem um WAV de três minutos; trilha maior que isso é um álbum. */
const MAX_BYTES_DE_AUDIO = 40 * 1024 * 1024;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        const { userId } = await auth();
        if (!userId) throw new Error("Não autenticado");
        const project = await prisma.project.findFirst({
          where: { id, userId },
          select: { id: true },
        });
        if (!project) throw new Error("Projeto não encontrado");
        return {
          allowedContentTypes: TIPOS_DE_AUDIO,
          maximumSizeInBytes: MAX_BYTES_DE_AUDIO,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ projectId: id }),
        };
      },
      // Em desenvolvimento local o storage não alcança o localhost, então o
      // navegador também grava pelo PATCH do projeto. `updatedAt` decide o
      // vencedor, e os dois escrevem a mesma coisa.
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const { projectId } = JSON.parse(tokenPayload ?? "{}");
        await prisma.project.update({
          where: { id: projectId },
          data: {
            videoMusicUrl: blob.url,
            videoMusicName: blob.pathname.split("/").pop() ?? null,
          },
        });
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha no upload";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** Tira a trilha do projeto, e apaga o arquivo do storage junto. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, userId },
    select: { videoMusicUrl: true },
  });
  if (!project) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });

  if (project.videoMusicUrl) {
    // Falhar em apagar o blob não pode travar a remoção: um arquivo órfão no
    // storage custa centavos, uma trilha que o cliente não consegue tirar do
    // projeto custa a confiança dele.
    await del(project.videoMusicUrl).catch(() => {});
  }
  await prisma.project.update({
    where: { id },
    data: { videoMusicUrl: null, videoMusicName: null },
  });
  return NextResponse.json({ ok: true });
}
