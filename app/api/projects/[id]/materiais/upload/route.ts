export const dynamic = "force-dynamic";

import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { projetoVisivel } from "@/lib/equipe/conta";
import { conferirArmazenamento, fraseDoEstouro } from "@/lib/limites-do-plano";
import { LIMITES_DO_MATERIAL } from "@/lib/materiais/tipos";

/**
 * O ENVIO DA BIBLIOTECA DE MATERIAIS (03/10/2026): fotos e vídeos curtos do
 * cliente, direto do navegador para o store PRIVADO, como a gravação. A rota
 * só emite o token (projeto visível, pasta `materiais/<projeto>/`, tipo e
 * tamanho por material, armazenamento do plano) e o navegador registra a URL
 * depois pelo POST de `/materiais`, que confere a pasta de novo.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = (await req.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request: req,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { userId } = await auth();
        if (!userId) throw new Error("Não autenticado");
        const projeto = await prisma.project.findFirst({ where: { id, ...projetoVisivel(userId) }, select: { id: true } });
        if (!projeto) throw new Error("Projeto não encontrado");
        if (!pathname.startsWith(`materiais/${id}/`)) throw new Error("Pasta errada");
        const { tipo, tamanho } = JSON.parse(clientPayload || "{}") as { tipo?: string; tamanho?: number };
        const regra = tipo === "foto" ? LIMITES_DO_MATERIAL.foto : tipo === "video" ? LIMITES_DO_MATERIAL.video : tipo === "miniatura" ? LIMITES_DO_MATERIAL.miniatura : null;
        if (!regra) throw new Error("Tipo de material desconhecido");
        if (tipo !== "miniatura") {
          const estouro = await conferirArmazenamento(userId, Number(tamanho) || 0);
          if (estouro) throw new Error(fraseDoEstouro(estouro));
        }
        return { allowedContentTypes: [...regra.tipos], maximumSizeInBytes: regra.maxBytes, addRandomSuffix: true };
      },
      onUploadCompleted: async () => {
        // Nada: quem registra é o navegador, pelo POST de /materiais.
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha no envio" }, { status: 400 });
  }
}
