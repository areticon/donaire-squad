export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { cancelarVideo } from "@/lib/media/cancelar-video";

/**
 * "CANCELAR ESTE VÍDEO" (05/10/2026): o cliente desiste de uma gravação que
 * espera a aprovação dele ou que ainda está andando, pela faixa do Gestor.
 *
 * O `id` é o da gravação (VideoJob) ou o da linha do gêmeo gravando
 * ("gemeo-<id>", como a faixa a recebe de /api/videos/status). Só com sessão
 * de dono ou membro da equipe com o projeto liberado: a assinatura do piloto
 * do servidor não vale aqui, cancelar é decisão de gente.
 *
 * O que faz, em ordem, mora em lib/media/cancelar-video.ts.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const r = await cancelarVideo(id, userId);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json(r);
  } catch (e) {
    console.error(`[cancelar][${id}]`, e);
    return NextResponse.json({ error: "Não consegui cancelar agora. Nada mudou: tente de novo em instantes." }, { status: 500 });
  }
}
