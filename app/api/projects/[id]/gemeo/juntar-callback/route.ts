export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { corpoAssinadoConfere, CABECALHO_ASSINATURA } from "@/lib/media/worker-token";
import { concluirJuncao } from "@/lib/media/gemeo-passo";

/**
 * O worker avisa que juntou (ou não) os pedaços de um vídeo do gêmeo
 * (01/10/2026). Sem sessão: autenticado pela assinatura sobre o corpo
 * inteiro, como os outros callbacks do worker. O `retorno` traz o projeto, o
 * vídeo e o `desde` da tentativa, e um aviso de tentativa antiga é ignorado.
 * Esta rota só grava o resultado; quem cria o VideoJob e chama a esteira é o
 * passo do cron, cutucado aqui.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const corpoCru = await req.text();
  if (!corpoAssinadoConfere(corpoCru, req.headers.get(CABECALHO_ASSINATURA))) {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  }
  let corpo: Parameters<typeof concluirJuncao>[0];
  try {
    corpo = JSON.parse(corpoCru);
  } catch {
    return NextResponse.json({ error: "Corpo não é JSON" }, { status: 400 });
  }
  if (corpo.retorno?.projectId !== id) return NextResponse.json({ error: "Projeto não confere" }, { status: 400 });
  const resultado = await concluirJuncao(corpo);
  if (!corpo.ok) console.error(`[gemeo-juntar-callback][${id}]: ${corpo.erro ?? "falhou"}`);
  return NextResponse.json({ ok: true, resultado });
}
