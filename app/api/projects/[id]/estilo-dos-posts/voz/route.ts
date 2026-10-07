import { auth } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { transcreverFalaCurta } from "@/lib/media/fala-curta";

/**
 * O ESTILO FALADO (08/10/2026). Regra do Bruno: "incentivar o usuário criar o
 * seu estilo, a partir de um texto ou um áudio". O navegador grava (o mesmo
 * gravador do comando falado do vídeo), esta rota transcreve com a mesma
 * Deepgram (lib/media/fala-curta.ts) e devolve o texto; a tela põe o texto na
 * conversa como a mensagem do cliente e manda pelo MESMO caminho do texto
 * escrito (POST /api/projects/[id]/estilo-dos-posts). Nada é registrado aqui.
 */
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!project || !(await podeUsarProjeto(userId, project))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const audio = Buffer.from(await req.arrayBuffer());
  const r = await transcreverFalaCurta(audio, req.headers.get("content-type"), { alternativa: "Escreva como você quer", onde: "estilo dos posts falado" });
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.status });
  return NextResponse.json({ texto: r.texto });
}
