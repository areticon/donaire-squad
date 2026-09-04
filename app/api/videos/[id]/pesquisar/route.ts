export const dynamic = "force-dynamic";
// Duas chamadas ao Claude mais a pesquisa na web: em gravação longa passa de
// um minuto, e o teto padrão mataria no meio.
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { acessoAoVideo } from "@/lib/media/piloto-do-servidor";
import { prisma } from "@/lib/db/prisma";
import { pesquisarDoVideo } from "@/lib/media/radar-do-video";

/**
 * O Roberto Radar pesquisa a partir da transcrição deste vídeo.
 *
 * O piloto da tela dispara assim que a transcrição existe, em paralelo com a
 * escolha dos trechos: a pesquisa não depende dos cortes, e rodar junto é o
 * que faz o briefing estar pronto quando os redatores precisarem dele. Com
 * `?refazer=1` pesquisa de novo por cima (o "Pesquisar de novo" do card).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {

  const { id } = await params;
  const acesso = await acessoAoVideo(req, id);
  if (!acesso) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const video = await prisma.videoJob.findFirst({
    where: acesso.where,
    select: { id: true, transcript: true, radar: true },
  });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });
  if (!video.transcript) {
    return NextResponse.json({ error: "A transcrição ainda não existe." }, { status: 409 });
  }

  const refazer = req.nextUrl.searchParams.get("refazer") === "1";
  if (video.radar && !refazer) {
    return NextResponse.json({ ok: true, criado: false });
  }

  try {
    const radar = await pesquisarDoVideo(video.id, { forcar: refazer });
    if (!radar) return NextResponse.json({ error: "Sem transcrição para pesquisar." }, { status: 409 });
    return NextResponse.json({
      ok: true,
      criado: true,
      tema: radar.tema,
      teses: radar.teses.length,
      achados: radar.achados.length,
      dados: radar.dados.length,
      fontes: radar.fontes.length,
    });
  } catch (err) {
    console.error(`[radar][${id}]`, err);
    return NextResponse.json(
      { error: "A pesquisa falhou desta vez. Os textos saem sem ela, e dá para pesquisar de novo pelo card do Roberto." },
      { status: 500 }
    );
  }
}
