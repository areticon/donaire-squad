export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { acessoAoVideo } from "@/lib/media/piloto-do-servidor";
import { tentarMontagemDoCompletoDeNovo } from "@/lib/media/montagem-do-completo";
import { tentarMontagemDoCorteDeNovo } from "@/lib/media/montagem-nos-cortes";

/**
 * "TENTAR A MONTAGEM DE NOVO" (01/10/2026, parte 240): o botão que aparece
 * quando a montagem de efeitos desistiu por erro técnico, no card do vídeo
 * completo, no card de cada corte e no aviso acima do quadro.
 *
 * NÃO COBRA: a montagem de efeitos nunca debita crédito (o completo e os
 * cortes foram cobrados na aprovação do roteiro). O que já foi pago (plano do
 * diretor, imagens, cenas) é reaproveitado; o trabalho vai para o cron.
 *
 * Corpo: { alvo: "completo" } ou { trecho: <índice do corte> }. Dono ou
 * membro com o projeto liberado (o membro edita; ver lib/equipe/permissoes).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acesso = await acessoAoVideo(req, id);
  if (!acesso) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const video = await prisma.videoJob.findFirst({ where: acesso.where, select: { id: true } });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });

  const corpo = (await req.json().catch(() => ({}))) as { alvo?: string; trecho?: number };
  try {
    const r =
      corpo.alvo === "completo"
        ? await tentarMontagemDoCompletoDeNovo(id)
        : typeof corpo.trecho === "number" && Number.isInteger(corpo.trecho) && corpo.trecho >= 0
          ? await tentarMontagemDoCorteDeNovo(id, corpo.trecho)
          : null;
    if (!r) return NextResponse.json({ error: "Diga qual peça: o completo ou um corte." }, { status: 400 });
    if (!r.ok) return NextResponse.json({ error: r.motivo ?? "Não consegui pedir a montagem de novo agora. Tente em um minuto." }, { status: 409 });
    return NextResponse.json({
      ok: true,
      caminho: r.caminho,
      mensagem: "Pedimos a montagem de efeitos de novo, sem custo. O card avisa quando terminar.",
    });
  } catch (e) {
    console.error(`[tentar-montagem][${id}]`, e);
    return NextResponse.json({ error: "Não consegui pedir a montagem de novo agora. Tente em um minuto." }, { status: 500 });
  }
}
