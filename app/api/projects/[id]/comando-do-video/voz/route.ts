import { auth } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";

/**
 * O COMANDO FALADO (05/10/2026): o áudio curto gravado na tela vai à Deepgram
 * (a mesma transcrição do app, nova-3 em português) e volta como texto, que o
 * cliente ainda pode editar antes de salvar. Até 4 MB (~2 min de áudio).
 */
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || !(await podeUsarProjeto(userId, project))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const chave = process.env.DEEPGRAM_API_KEY;
  if (!chave) return NextResponse.json({ error: "A transcrição de voz não está disponível agora. Escreva o comando." }, { status: 503 });
  const audio = Buffer.from(await req.arrayBuffer());
  if (audio.length < 1000) return NextResponse.json({ error: "Não ouvi nada. Grave de novo." }, { status: 400 });
  if (audio.length > 4 * 1024 * 1024) return NextResponse.json({ error: "Áudio longo demais. Fale em até 2 minutos." }, { status: 413 });
  const r = await fetch("https://api.deepgram.com/v1/listen?model=nova-3&language=pt-BR&punctuate=true&smart_format=true", {
    method: "POST",
    headers: { Authorization: `Token ${chave}`, "Content-Type": req.headers.get("content-type") || "audio/webm" },
    body: audio,
    signal: AbortSignal.timeout(45_000),
  }).catch(() => null);
  if (!r?.ok) return NextResponse.json({ error: "Não consegui transcrever. Tente de novo ou escreva o comando." }, { status: 502 });
  const d = (await r.json()) as { results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> } };
  const texto = (d.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "").trim();
  if (!texto) return NextResponse.json({ error: "Não entendi o áudio. Grave de novo, mais perto do microfone." }, { status: 422 });
  return NextResponse.json({ texto });
}
