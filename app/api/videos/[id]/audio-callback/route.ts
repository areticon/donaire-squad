export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { corpoAssinadoConfere, CABECALHO_ASSINATURA } from "@/lib/media/worker-token";
import { despacharPasso } from "@/lib/media/piloto-do-servidor";
import { lerParaRetomar, retomarEtapa } from "@/lib/media/vigia-das-etapas";

/**
 * O worker avisa que separou o áudio de uma gravação grande (29/09).
 *
 * Mesmo contrato do `cortar-callback`: sem sessão, autenticado pela assinatura
 * sobre o corpo inteiro, porque o corpo traz uma URL que a transcrição vai
 * ouvir, e trocar essa URL faria a Deepgram transcrever outro arquivo.
 *
 * Devolve o vídeo para "uploaded" com o `audioUrl` e pede a transcrição de
 * novo. A tentativa gasta na extração é devolvida: separar o áudio é preparo,
 * não uma tentativa de transcrever, e contar as duas deixaria uma gravação
 * grande com uma chance a menos que uma pequena.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const corpoCru = await req.text();
  if (!corpoAssinadoConfere(corpoCru, req.headers.get(CABECALHO_ASSINATURA))) {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  }

  const corpo = JSON.parse(corpoCru) as { ok: boolean; erro?: string; reiniciado?: boolean; audio?: { url: string; bytes: number } };

  // O worker reiniciou no meio da separação (deploy, 01/10): não é falha da
  // gravação. O vigia retoma na hora (volta para "uploaded" e pede a
  // transcrição, que pede o áudio de novo), contando a retomada.
  if (corpo.reiniciado) {
    const linha = await lerParaRetomar(id);
    const feito = linha && linha.status === "transcribing" ? await retomarEtapa(linha, "reiniciado") : "ignorado";
    return NextResponse.json({ ok: true, reiniciado: feito });
  }

  // Só mexe em quem ainda espera o áudio: aviso repetido do worker (ele insiste
  // quando a rede soluça) não pode desfazer uma transcrição que já andou.
  if (!corpo.ok || !corpo.audio?.url) {
    await prisma.videoJob.updateMany({
      where: { id, status: "transcribing", audioUrl: null },
      data: {
        status: "failed",
        startedAt: null,
        error: "Não consegui separar o áudio da gravação para transcrever. Pode tentar de novo; nada se perdeu.",
      },
    });
    console.error(`[audio][${id}] worker falhou: ${corpo.erro ?? "sem motivo"}`);
    return NextResponse.json({ ok: true });
  }

  const tomado = await prisma.videoJob.updateMany({
    where: { id, status: "transcribing", audioUrl: null },
    data: { audioUrl: corpo.audio.url, status: "uploaded", startedAt: null, attempts: { decrement: 1 } },
  });
  if (tomado.count > 0) await despacharPasso(id, "transcrever");
  return NextResponse.json({ ok: true });
}
