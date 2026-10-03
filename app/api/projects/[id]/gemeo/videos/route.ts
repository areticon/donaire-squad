export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { SaldoInsuficiente } from "@/lib/credits";
import { cutucar } from "@/lib/fila/trabalhos";
import { videoParaTela } from "@/lib/media/gemeo";
import { ErroDoPedido, cancelarVideoDoGemeo, listarVideos, pedirVideoDoGemeo } from "@/lib/media/gemeo-servidor";
import { projetoVisivel } from "@/lib/equipe/conta";

/**
 * OS VÍDEOS DO GÊMEO (01/10/2026).
 *
 *   GET     a lista, para a tela acompanhar;
 *   POST    pede um vídeo a partir de um roteiro (da linha editorial ou
 *           digitado): reserva os créditos e põe na fila;
 *   DELETE  cancela um vídeo que ainda não começou (?video=id).
 *
 * Quem fala, gera e junta é o passo do cron (`lib/media/gemeo-passo.ts`).
 */

async function dono(id: string) {
  const { userId } = await auth();
  if (!userId) return null;
  const project = await prisma.project.findFirst({ where: { id, ...projetoVisivel(userId) }, select: { id: true } });
  return project ? userId : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await dono(id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ videos: (await listarVideos(id)).map(videoParaTela) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await dono(id);
  if (!userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const corpo = (await req.json().catch(() => ({}))) as { texto?: string; titulo?: string; roteiroId?: string };
  try {
    const video = await pedirVideoDoGemeo({
      projectId: id,
      userId,
      texto: String(corpo.texto ?? ""),
      titulo: corpo.titulo ?? null,
      roteiroId: corpo.roteiroId ?? null,
    });
    cutucar();
    return NextResponse.json({ video: videoParaTela(video) });
  } catch (e) {
    if (e instanceof SaldoInsuficiente) {
      // Membro da equipe (01/10): a frase do débito já diz de quem é o saldo e
      // a quem pedir; a do dono continua com o número da reserva.
      return NextResponse.json(
        { error: e.equipe ? e.message : `Este vídeo reserva ${e.necessario.toLocaleString("pt-BR")} créditos e você tem ${e.disponivel.toLocaleString("pt-BR")}.`, equipe: e.equipe },
        { status: 402 }
      );
    }
    if (e instanceof ErroDoPedido) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(`[gemeo][${id}] pedido:`, e);
    return NextResponse.json({ error: "Não consegui pedir o vídeo agora. Nada foi cobrado." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await dono(id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const video = req.nextUrl.searchParams.get("video") ?? "";
  const ok = await cancelarVideoDoGemeo(id, video);
  if (!ok) return NextResponse.json({ error: "Este vídeo já começou e não pode mais ser cancelado." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
