export const dynamic = "force-dynamic";
// A Deepgram transcreve o arquivo pela URL (20 min levam ~30 s) e a decisão
// das retomadas passa pelo JEV e, na dúvida, por uma chamada ao Claude.
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { corpoAssinadoConfere, CABECALHO_ASSINATURA } from "@/lib/media/worker-token";
import { conferirFala, guardaDaFalaLigada } from "@/lib/media/guarda-da-fala";
import { transcreverCompleto } from "@/lib/media/montagem-do-completo";

/**
 * A GUARDA NA SAÍDA (03/10), a porta que o WORKER chama depois do render
 * final do completo e de cada corte (worker/src/guarda-da-fala.mjs): recebe a
 * URL pública do arquivo que vai ao ar e devolve o que tirar dele, no tempo do
 * arquivo. Ver lib/media/guarda-da-fala.ts.
 *
 * Sem sessão, como os callbacks: autenticada pela assinatura do worker sobre
 * o corpo inteiro. Qualquer falha aqui responde erro e o worker entrega o
 * arquivo como está (a guarda nunca segura uma entrega).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const corpoCru = await req.text();
  if (!corpoAssinadoConfere(corpoCru, req.headers.get(CABECALHO_ASSINATURA))) {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  }
  if (!guardaDaFalaLigada()) return NextResponse.json({ ok: true, desligada: true, remover: [], sobras: [] });
  let corpo: { url?: string; protegido?: Array<{ de: number; ate: number }>; rotulo?: string };
  try {
    corpo = JSON.parse(corpoCru);
  } catch {
    return NextResponse.json({ error: "Corpo não é JSON" }, { status: 400 });
  }
  if (!corpo.url) return NextResponse.json({ error: "Falta url" }, { status: 400 });
  const video = await prisma.videoJob.findUnique({
    where: { id },
    select: { projectId: true, project: { select: { videoTerms: true } } },
  });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });
  try {
    const fala = await transcreverCompleto(corpo.url, video.project?.videoTerms ?? null, { projectId: video.projectId, operation: "guarda-da-fala" });
    const palavras = fala.palavras.map((w) => ({ word: w.texto, start: w.inicio, end: w.fim, confidence: 1 }));
    const r = await conferirFala(palavras, { projectId: video.projectId, protegido: corpo.protegido ?? [] });
    console.log(
      `[guarda-da-fala][${id}] ${corpo.rotulo ?? ""} ${palavras.length} palavras, ${r.remover.length} a tirar` +
        (r.sobras.length ? `: ${r.sobras.map((s) => `${s.de.toFixed(1)}s "${s.texto}"`).join("; ")}` : "")
    );
    return NextResponse.json({ ok: true, duracao: fala.duracao, remover: r.remover.map((x) => ({ de: x.de, ate: x.ate })), sobras: r.sobras });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[guarda-da-fala][${id}] falhou, o arquivo vai como está: ${msg}`);
    return NextResponse.json({ error: msg.slice(0, 300) }, { status: 502 });
  }
}
