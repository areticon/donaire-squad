export const dynamic = "force-dynamic";

import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";

/**
 * Upload de vídeo direto do navegador para o object storage.
 *
 * O arquivo NÃO passa por aqui. Esta rota só assina um token de permissão e
 * recebe o aviso de conclusão. É obrigatório ser assim: função serverless tem
 * limite de corpo de requisição na casa das dezenas de megabytes, e um vídeo
 * de 20 minutos passa de 1 GB. O navegador envia direto para o storage.
 */

// Limites e o porquê de cada número vivem em lib/media/limits.ts, que o
// navegador também usa. Duplicar os valores aqui sairia caro no dia em que um
// dos dois lados mudasse sozinho.
import { MAX_BYTES, TIPOS_ACEITOS } from "@/lib/media/limits";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,

      // Roda ANTES do upload começar. É o portão: sem sessão válida e sem ser
      // dono do projeto, nenhum token é emitido.
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const { userId } = await auth();
        if (!userId) throw new Error("Não autenticado");

        const payload = clientPayload ? JSON.parse(clientPayload) : {};
        const projectId: string | undefined = payload.projectId;
        if (!projectId) throw new Error("projectId é obrigatório");

        const project = await prisma.project.findFirst({
          where: { id: projectId, userId },
          select: { id: true },
        });
        if (!project) throw new Error("Projeto não encontrado");

        return {
          allowedContentTypes: TIPOS_ACEITOS,
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
          // Volta para nós no onUploadCompleted, já validado.
          tokenPayload: JSON.stringify({ userId, projectId }),
        };
      },

      // Chamado pelo storage quando o upload termina. Em desenvolvimento local
      // o storage não alcança o localhost, então este passo não dispara: por
      // isso a criação do registro também é exposta na rota /api/videos.
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const { userId, projectId } = JSON.parse(tokenPayload ?? "{}");
        await prisma.videoJob.create({
          data: {
            projectId,
            userId,
            status: "uploaded",
            blobUrl: blob.url,
            originalName: blob.pathname.split("/").pop() ?? null,
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
