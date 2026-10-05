export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { corpoAssinadoConfere, CABECALHO_ASSINATURA } from "@/lib/media/worker-token";
import { concluirMontagem } from "@/lib/media/montagem-nos-cortes";
import { videoCancelado } from "@/lib/media/video-cancelado";

/**
 * O worker avisa que terminou (ou não) a MONTAGEM de um corte (editor
 * completo, lib/media/montagem-nos-cortes.ts).
 *
 * Sem sessão, como todo callback de fora, e autenticado pela assinatura sobre
 * o corpo inteiro, como o cortar-callback: o corpo traz a URL do vídeo que vai
 * substituir o corte do cliente. O corte e o estado pedidos voltam no próprio
 * corpo (`retorno`), então ninguém troca de corte mexendo na URL.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const corpoCru = await req.text();
  if (!corpoAssinadoConfere(corpoCru, req.headers.get(CABECALHO_ASSINATURA))) {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  }
  let corpo: {
    ok?: boolean;
    erro?: string;
    /** O worker reiniciou no meio (deploy): reenviar sem gastar tentativa. */
    reiniciado?: boolean;
    montado?: { url: string; bytes: number };
    /** A guarda na saída (03/10): o que o worker tirou do arquivo pronto. */
    guardaDaFala?: { conferido?: boolean; tirados?: number; sobras?: Array<{ de: number; texto: string }>; motivo?: string } | null;
    tempos?: Record<string, number>;
    retorno?: { indice?: number; desde?: string } | null;
  };
  try {
    corpo = JSON.parse(corpoCru);
  } catch {
    return NextResponse.json({ error: "Corpo não é JSON" }, { status: 400 });
  }
  const indice = corpo.retorno?.indice;
  const desde = corpo.retorno?.desde;
  if (typeof indice !== "number" || typeof desde !== "string") {
    return NextResponse.json({ error: "Sem o corte de retorno" }, { status: 400 });
  }
  // O vídeo cancelado pelo cliente (05/10): a montagem que o worker terminou
  // depois do cancelamento é descartada, sem trocar corte nem post.
  if (await videoCancelado(id)) return NextResponse.json({ ok: true, resultado: "ignorado", motivo: "cancelado" });
  const r = await concluirMontagem(id, indice, desde, corpo);
  const g = corpo.guardaDaFala;
  if (g?.tirados) console.log(`[montar-callback][${id}] guarda da fala tirou ${g.tirados}: ${(g.sobras ?? []).map((x) => `${x.de.toFixed(1)}s "${x.texto}"`).join("; ").slice(0, 400)}`);
  else if (g && !g.conferido) console.error(`[montar-callback][${id}] guarda da fala não conferiu: ${g.motivo ?? "sem motivo"}`);
  if (!corpo.ok) console.error(`[montar-callback][${id}] corte ${indice}: ${corpo.erro ?? "falhou"}`);
  // 200 também no "ignorado": repetir o aviso não muda um corte que já saiu
  // de "montando" (refeito, trocado ou desistido).
  return NextResponse.json({ ok: true, resultado: r });
}
