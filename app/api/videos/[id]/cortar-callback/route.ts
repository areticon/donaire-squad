export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import type { Trecho } from "@/lib/media/select-clips";
import { corpoAssinadoConfere, CABECALHO_ASSINATURA } from "@/lib/media/worker-token";

/**
 * O worker avisa que terminou de cortar.
 *
 * Sem sessão, como todo callback de fora, e autenticada pela assinatura sobre o
 * corpo inteiro. Assinar só o id do vídeo não bastaria aqui: o corpo traz as
 * URLs dos arquivos que viram post, e trocar uma URL faria o cliente publicar
 * no canal dele um vídeo que não é o dele.
 */

type MidiaProduzida = { url: string; bytes: number };

type TrechoCortado = {
  indice: number;
  duracaoSec?: number;
  vertical?: MidiaProduzida;
  horizontal?: MidiaProduzida;
  capa?: MidiaProduzida;
  enquadramento?: { cena: string; vertical: string; motivo: string };
  erro?: string;
};

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
    select: { id: true, status: true, clips: true },
  });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });

  // Idempotência: o worker repete o aviso se não receber resposta. Sem isto, a
  // repetição sobrescreveria cortes que o cliente já pode ter aprovado.
  if (video.status !== "cutting") {
    return NextResponse.json({ ok: true, ignorado: `status ${video.status}` });
  }

  let corpo: {
    ok?: boolean;
    erro?: string;
    trechos?: TrechoCortado[];
    completo?: MidiaProduzida | null;
    capaFonte?: (MidiaProduzida & { instante?: number; motivo?: string }) | null;
    erros?: string[];
  };
  try {
    corpo = JSON.parse(corpoCru);
  } catch {
    return NextResponse.json({ ok: false, error: "Corpo não é JSON" });
  }

  if (!corpo.ok) {
    await prisma.videoJob.update({
      where: { id },
      data: {
        status: "failed",
        startedAt: null,
        error: corpo.erro ?? "O worker não conseguiu cortar o vídeo.",
      },
    });
    // 200 de propósito: repetir o aviso não conserta corte que falhou, e o erro
    // já está gravado onde o cliente vê.
    return NextResponse.json({ ok: true });
  }

  // As mídias entram NOS TRECHOS que já existem, em vez de virar uma lista
  // paralela. O trecho já carrega título, ideia e os textos das redes; separar
  // a mídia disso obrigaria a tela a casar duas listas por índice, que é
  // exatamente o tipo de acoplamento que quebra quando um trecho falha.
  const trechos = (video.clips as unknown as Trecho[]) ?? [];
  const porIndice = new Map((corpo.trechos ?? []).map((t) => [t.indice, t]));

  const atualizados = trechos.map((t, i) => {
    const corte = porIndice.get(i);
    if (!corte) return t;
    return {
      ...t,
      midia: {
        vertical: corte.vertical ?? null,
        horizontal: corte.horizontal ?? null,
        capa: corte.capa ?? null,
        enquadramento: corte.enquadramento ?? null,
        erro: corte.erro ?? null,
      },
      // Nasce marcado para publicar, porque o padrão útil é "quero tudo" e o
      // trabalho do cliente deve ser DESmarcar o que não quer, não marcar sete
      // caixinhas para conseguir o que ele já pediu ao subir o vídeo.
      publicar: corte.erro ? false : true,
      destinos: corte.erro ? [] : ["youtube_shorts", "instagram_reels"],
    };
  });

  const comMidia = atualizados.filter(
    (t) => (t as { midia?: { vertical?: unknown } }).midia?.vertical
  ).length;

  await prisma.videoJob.update({
    where: { id },
    data: {
      status: comMidia > 0 ? "cut" : "failed",
      startedAt: null,
      attempts: comMidia > 0 ? 0 : undefined,
      clips: atualizados as never,
      completoUrl: corpo.completo?.url ?? null,
      completoBytes: corpo.completo?.bytes ? BigInt(corpo.completo.bytes) : null,
      // O quadro que o squad escolheu como melhor rosto do vídeo inteiro. É a
      // base de TODAS as capas: as dos cortes e a do vídeo completo. Guardar por
      // vídeo, e não por trecho, é o que resolve o caso do Bruno, em que os
      // trechos bons caíam todos em tela compartilhada.
      capaFonteUrl: corpo.capaFonte?.url ?? null,
      error:
        comMidia > 0
          ? (corpo.erros?.length ? corpo.erros.join("; ") : null)
          : "Nenhum corte foi produzido.",
    },
  });

  return NextResponse.json({ ok: true, trechos: comMidia });
}
