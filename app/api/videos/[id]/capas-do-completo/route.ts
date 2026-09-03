import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import {
  climaDeCapaValido,
  escolherCapaDoCompleto,
  estiloDeCapaValido,
  gerarCapasDoCompleto,
  type CapasDoCompleto,
} from "@/lib/media/capas-do-completo";

/**
 * As opções de capa do vídeo completo no YouTube.
 *
 * GET devolve o que existe; POST gera 2 opções (no estilo do projeto, ou no
 * estilo passado, que vira o estilo do projeto; e no clima passado, que é só
 * deste vídeo); PUT marca a escolhida e, se o vídeo já está no ar, troca a
 * capa lá.
 *
 * Duas composições no Nano Banana Pro em paralelo passam de 1 minuto; o
 * teto de 5 min sobra.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  const video = await prisma.videoJob.findFirst({
    where: { id, project: { userId: userId } },
    select: { capas: true, project: { select: { capaEstilo: true } } },
  });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });
  return NextResponse.json({
    capas: (video.capas as CapasDoCompleto | null) ?? null,
    estilo: video.project.capaEstilo ?? "impacto",
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  const corpo = (await req.json().catch(() => ({}))) as { estilo?: unknown; clima?: unknown };
  if (corpo.estilo !== undefined && !estiloDeCapaValido(corpo.estilo)) {
    return NextResponse.json({ error: "Estilo de capa inválido" }, { status: 400 });
  }
  if (corpo.clima !== undefined && !climaDeCapaValido(corpo.clima)) {
    return NextResponse.json({ error: "Clima de capa inválido" }, { status: 400 });
  }
  try {
    const capas = await gerarCapasDoCompleto(id, {
      estilo: estiloDeCapaValido(corpo.estilo) ? corpo.estilo : undefined,
      clima: climaDeCapaValido(corpo.clima) ? corpo.clima : undefined,
      userId: userId,
    });
    return NextResponse.json({ capas });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Não consegui gerar as capas.";
    console.error("[capas-do-completo]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  const corpo = (await req.json().catch(() => ({}))) as { escolhida?: unknown };
  if (typeof corpo.escolhida !== "number") {
    return NextResponse.json({ error: "Informe qual capa escolheu" }, { status: 400 });
  }
  try {
    const r = await escolherCapaDoCompleto(id, userId, corpo.escolhida);
    return NextResponse.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Não consegui gravar a escolha.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
