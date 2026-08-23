export const dynamic = "force-dynamic";
// Uma chamada de visão sobre alguns quadros. Não é rápida, mas também não é a
// etapa longa: o corte em si roda no worker, sem teto de tempo.
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { decidirEnquadramento, type QuadroDeTrecho } from "@/lib/media/enquadramento";
import { corpoAssinadoConfere, CABECALHO_ASSINATURA } from "@/lib/media/worker-token";

/**
 * O worker pergunta como enquadrar cada corte, e quem responde é o squad.
 *
 * Por que a decisão mora AQUI e não no worker, que já tem os quadros na mão:
 *
 * 1. A conta de custo de IA do projeto vive num lugar só, a tabela `ai_usage`.
 *    Worker chamando o modelo por fora seria gasto invisível, que é exatamente
 *    o problema que o timeout de 90s criou em 22/08, quando três tentativas
 *    abortadas foram cobradas sem virar uma linha sequer.
 * 2. Prompt de agente é produto, e produto se edita num lugar só.
 *
 * Esta rota NÃO tem sessão, e não pode ter: quem chama é o worker, de outra
 * hospedagem. A autenticação é a assinatura sobre o corpo inteiro.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const corpoCru = await req.text();

  if (!corpoAssinadoConfere(corpoCru, req.headers.get(CABECALHO_ASSINATURA))) {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  }

  const video = await prisma.videoJob.findUnique({
    where: { id },
    select: { id: true, projectId: true },
  });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });

  let trechos: QuadroDeTrecho[];
  let candidatosDeCapa: string[] = [];
  try {
    const corpo = JSON.parse(corpoCru) as {
      trechos?: QuadroDeTrecho[];
      candidatosDeCapa?: string[];
    };
    trechos = Array.isArray(corpo.trechos) ? corpo.trechos : [];
    candidatosDeCapa = Array.isArray(corpo.candidatosDeCapa) ? corpo.candidatosDeCapa : [];
  } catch {
    return NextResponse.json({ error: "Corpo não é JSON" }, { status: 400 });
  }
  if (!trechos.length) {
    return NextResponse.json({ error: "Nenhum quadro recebido" }, { status: 400 });
  }

  try {
    const { enquadramentos, capa } = await decidirEnquadramento(
      trechos,
      { projectId: video.projectId },
      candidatosDeCapa
    );
    return NextResponse.json({ enquadramentos, capa });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao decidir o enquadramento";
    // 200 com `ok: false` de propósito: o worker deve SEGUIR, usando o
    // tratamento seguro, em vez de abortar o trabalho inteiro. Entregar corte
    // com enquadramento mediano é muito melhor que não entregar corte nenhum
    // porque o agente de visão teve um dia ruim.
    return NextResponse.json({ ok: false, erro: message, enquadramentos: [], capa: null });
  }
}
