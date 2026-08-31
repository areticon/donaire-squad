export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import type { Trecho } from "@/lib/media/select-clips";
import { corpoAssinadoConfere, CABECALHO_ASSINATURA } from "@/lib/media/worker-token";
import { anexarCompletoAoQuadro } from "@/lib/media/completo-no-quadro";

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
  legenda?: boolean;
  vertical?: MidiaProduzida;
  horizontal?: MidiaProduzida;
  capa?: MidiaProduzida;
  enquadramento?: {
    cena: string;
    vertical: string;
    motivo: string;
    pessoa?: { x: number; y: number; w: number; h: number } | null;
    tela?: { x: number; y: number; w: number; h: number } | null;
  };
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
    select: { id: true, status: true, clips: true, completoUrl: true },
  });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });

  // O COMPLETO ATRASADO: desde 01/09 o worker avisa em duas fases (os cortes
  // na hora, o completo quando terminar de codificar). Se o vídeo já saiu de
  // "cutting" pelo aviso parcial, este segundo aviso só anexa o completo e o
  // põe no quadro; nada mais é tocado, então corte aprovado não é sobrescrito.
  if (video.status !== "cutting") {
    let atrasado: {
      ok?: boolean;
      reCorte?: boolean;
      trechos?: TrechoCortado[];
      completo?: { url: string; bytes: number } | null;
    } = {};
    try {
      atrasado = JSON.parse(corpoCru);
    } catch {
      return NextResponse.json({ ok: false, error: "Corpo não é JSON" });
    }
    // O RE-CORTE de um trecho (ajuste pedido pelo cliente): funde SÓ a mídia
    // daquele índice. Aprovação, destinos e posts ficam como estavam, porque o
    // cliente ajustou o vídeo, não a decisão dele sobre o vídeo.
    if (atrasado.reCorte && atrasado.ok && Array.isArray(atrasado.trechos)) {
      const atuais = (video.clips as unknown as Array<Trecho & { midia?: Record<string, unknown> | null }>) ?? [];
      const porIndice = new Map(atrasado.trechos.map((t) => [t.indice, t]));
      const fundidos = atuais.map((t, i) => {
        const c = porIndice.get(i);
        if (!c) return t;
        return {
          ...t,
          midia: {
            ...(t.midia ?? {}),
            vertical: c.vertical ?? null,
            horizontal: c.horizontal ?? null,
            capa: c.capa ?? (t.midia?.capa as unknown) ?? null,
            enquadramento: c.enquadramento ?? (t.midia?.enquadramento as unknown) ?? null,
            legenda: c.legenda ?? false,
            erro: c.erro ?? null,
            refazendo: false,
          },
        };
      });
      await prisma.videoJob.update({ where: { id }, data: { clips: fundidos as never } });
      return NextResponse.json({ ok: true, reCorte: true });
    }
    if (atrasado.completo?.url && !video.completoUrl) {
      await prisma.videoJob.update({
        where: { id },
        data: {
          completoUrl: atrasado.completo.url,
          completoBytes: atrasado.completo.bytes ? BigInt(atrasado.completo.bytes) : null,
        },
      });
      await anexarCompletoAoQuadro(id).catch((e) =>
        console.error(`[cortar-callback][${id}] completo no quadro falhou:`, e)
      );
      return NextResponse.json({ ok: true, completoAnexado: true });
    }
    return NextResponse.json({ ok: true, ignorado: `status ${video.status}` });
  }

  let corpo: {
    ok?: boolean;
    erro?: string;
    trechos?: TrechoCortado[];
    avisoDeQualidade?: string;
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
        // Se a legenda palavra a palavra chegou no arquivo. Vale registrar
        // porque ela pode falhar sozinha sem derrubar o corte, e sem este campo
        // a diferença entre "corte legendado" e "corte mudo" só apareceria
        // assistindo, que é tarde demais.
        legenda: corte.legenda ?? false,
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

  // O aviso de qualidade do worker (janela da pessoa pequena demais para corte
  // nitido) entra no DIAGNOSTICO, que e o campo que o cliente le. Anexado ao
  // que o especialista ja escreveu, e nao por cima: os dois falam de coisas
  // diferentes e o cliente merece as duas.
  const aviso = corpo.avisoDeQualidade?.trim();
  const diagnosticoAtual = (
    await prisma.videoJob.findUnique({ where: { id }, select: { diagnostico: true } })
  )?.diagnostico;
  const diagnostico = aviso
    ? [diagnosticoAtual, aviso].filter(Boolean).join("\n\n")
    : undefined;

  await prisma.videoJob.update({
    where: { id },
    data: {
      ...(diagnostico ? { diagnostico } : {}),
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
