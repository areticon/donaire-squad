export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { corpoAssinadoConfere, CABECALHO_ASSINATURA } from "@/lib/media/worker-token";
import { concluirMontagemDoCompleto } from "@/lib/media/montagem-do-completo";

/**
 * O worker avisa que terminou (ou não) a EDIÇÃO do vídeo completo
 * (lib/media/montagem-do-completo.ts). Mesmo contrato do montar-callback dos
 * cortes: sem sessão, autenticado pela assinatura sobre o corpo inteiro, e o
 * estado pedido volta no próprio corpo (`retorno.desde`), então o aviso
 * atrasado de uma rodada antiga não troca o completo de uma rodada nova.
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
    retorno?: { desde?: string } | null;
    /** A conferência depois do render (02/10): trechos vazios achados e consertados. */
    conferencia?: unknown;
    /** A duração da abertura no arquivo pronto (02/10), para a revisão visual. */
    aberturaSeg?: number;
  };
  try {
    corpo = JSON.parse(corpoCru);
  } catch {
    return NextResponse.json({ error: "Corpo não é JSON" }, { status: 400 });
  }
  const desde = corpo.retorno?.desde;
  if (typeof desde !== "string") return NextResponse.json({ error: "Sem o estado de retorno" }, { status: 400 });
  const r = await concluirMontagemDoCompleto(id, desde, corpo);
  const g = corpo.guardaDaFala;
  if (g?.tirados) console.log(`[montar-completo-callback][${id}] guarda da fala tirou ${g.tirados}: ${(g.sobras ?? []).map((x) => `${x.de.toFixed(1)}s "${x.texto}"`).join("; ").slice(0, 400)}`);
  else if (g && !g.conferido) console.error(`[montar-completo-callback][${id}] guarda da fala não conferiu: ${g.motivo ?? "sem motivo"}`);
  if (!corpo.ok) console.error(`[montar-completo-callback][${id}]: ${corpo.erro ?? "falhou"}`);
  // 200 também no "ignorado": repetir o aviso não muda um estado que já saiu de "montando".
  return NextResponse.json({ ok: true, resultado: r });
}
