export const dynamic = "force-dynamic";

import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { conferirArmazenamento, fraseDoEstouro } from "@/lib/limites-do-plano";
import { projetoVisivel } from "@/lib/equipe/conta";

/**
 * O MATERIAL DO PRÓPRIO CLIENTE PARA UM DIA DA CAMPANHA (28/09).
 *
 * Pedido do Bruno: "para cada post, ele escolhe se vai subir o material dele
 * ou gerar por IA". Imagem, lâminas de carrossel ou vídeo, subidos direto do
 * navegador para o storage: esta rota só assina o token.
 *
 * Diferente da gravação (/api/videos/upload), que é material cru e privado,
 * isto é a PEÇA que vai ao ar: fica no armazenamento público, porque o
 * Instagram e o Facebook buscam a mídia por URL na hora de publicar.
 */
const TIPOS = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"];
const MAX = 500 * 1024 * 1024; // 500 MB: um reel de 90 s em 4K cabe com folga

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request: req,
      token: process.env.BLOB_PUBLIC_READ_WRITE_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const { userId } = await auth();
        if (!userId) throw new Error("Não autenticado");
        const { projectId } = clientPayload ? (JSON.parse(clientPayload) as { projectId?: string }) : {};
        if (!projectId) throw new Error("projectId é obrigatório");
        const projeto = await prisma.project.findFirst({ where: { id: projectId, ...projetoVisivel(userId) }, select: { id: true } });
        if (!projeto) throw new Error("Projeto não encontrado");
        const estouro = await conferirArmazenamento(userId);
        if (estouro) throw new Error(fraseDoEstouro(estouro));
        return { allowedContentTypes: TIPOS, maximumSizeInBytes: MAX, addRandomSuffix: true };
      },
      onUploadCompleted: async () => {
        // Nada a registrar: a URL volta para a janela e vai na config da campanha.
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha no envio" }, { status: 400 });
  }
}
