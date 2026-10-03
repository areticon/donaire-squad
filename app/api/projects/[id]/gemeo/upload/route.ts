export const dynamic = "force-dynamic";

import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { projetoVisivel } from "@/lib/equipe/conta";
import { soODono } from "@/lib/equipe/permissoes";

/**
 * O ENVIO DO MATERIAL DO GÊMEO (01/10/2026): fotos, amostra de voz e a
 * gravação da autorização, direto do navegador para o store PRIVADO.
 *
 * Privado porque é rosto e voz de uma pessoa, o dado mais sensível que a
 * plataforma guarda: nada disso é mídia publicada. A rota só emite o token
 * (dono do projeto, pasta `gemeo/<projeto>/`, tipo e tamanho por material) e
 * o navegador registra a URL depois pelo POST de `/gemeo`, que confere a
 * pasta de novo. O aviso de fim do storage não é usado: em desenvolvimento ele
 * não chega ao localhost, e registrar em dois lugares só criaria corrida.
 */

const REGRAS = {
  foto: { tipos: ["image/jpeg", "image/png", "image/webp"], maxBytes: 15 * 1024 * 1024 },
  // Vídeo também (01/10): a melhor amostra é o cliente FALANDO de verdade, e
  // isso costuma estar num vídeo (aula, live, reunião). O worker tira só o
  // áudio (-vn) ao converter em MP3, então a imagem nunca é usada nem guardada
  // além da amostra.
  voz: {
    tipos: [
      "audio/webm", "audio/ogg", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/mpeg", "audio/wav", "audio/x-wav",
      "video/mp4", "video/quicktime", "video/webm",
    ],
    maxBytes: 300 * 1024 * 1024,
  },
  autorizacao: { tipos: ["video/webm", "video/mp4", "video/quicktime"], maxBytes: 120 * 1024 * 1024 },
  // O vídeo único de treino (03/10): até 2 min de câmera, gravado no navegador
  // ou enviado do celular (um minuto em 4K de celular passa de 300 MB).
  treino: { tipos: ["video/webm", "video/mp4", "video/quicktime"], maxBytes: 500 * 1024 * 1024 },
} as const;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = (await req.json()) as HandleUploadBody;
  // A recusa de membro sai como 403 com a frase, e não como o 400 do upload.
  let recusa: NextResponse | null = null;
  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { userId } = await auth();
        if (!userId) throw new Error("Não autenticado");
        const project = await prisma.project.findFirst({ where: { id, ...projetoVisivel(userId) }, select: { id: true, userId: true } });
        if (!project) throw new Error("Projeto não encontrado");
        // Rosto e voz são cadastro do gêmeo, que é só do dono (01/10, acabamento).
        recusa = await soODono(userId, project, "cadastrar ou revogar o gêmeo digital deste projeto");
        if (recusa) throw new Error("so_o_dono");
        const { tipo } = JSON.parse(clientPayload || "{}") as { tipo?: keyof typeof REGRAS };
        const regra = tipo ? REGRAS[tipo] : undefined;
        if (!regra) throw new Error("Tipo de material desconhecido");
        if (!pathname.startsWith(`gemeo/${id}/`)) throw new Error("Pasta errada");
        return {
          allowedContentTypes: [...regra.tipos],
          maximumSizeInBytes: regra.maxBytes,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ projectId: id, tipo }),
        };
      },
      onUploadCompleted: async () => {
        // Nada: quem registra é o navegador, pelo POST de /gemeo (ver acima).
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    // O cast é porque o TypeScript não enxerga a atribuição dentro do callback.
    const recusou = recusa as NextResponse | null;
    if (recusou) return recusou;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Falha no envio" }, { status: 400 });
  }
}
