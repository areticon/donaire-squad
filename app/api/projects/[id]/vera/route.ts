// A conversa olha o projeto, prepara as mudanças e, quando o pedido corrige
// várias legendas, reescreve cada uma: 300 s dão folga a isso.
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { conversarComAVera } from "@/lib/vera/conversa";
import { listarPedidos, paraATela } from "@/lib/vera/pedidos";
import { executarAcaoDaVera } from "@/lib/vera/executar-acao";
import type { TurnoParaAVera } from "@/lib/vera/prompt-da-gerente";

/**
 * FALAR COM A VERA, A GERENTE (04/10/2026).
 *
 * Pedido do Bruno: a Vera, no chat, só respondia ("perguntei como eu faço para
 * editar a regra do projeto"). Ele quer falar com ela e ela executar: "eu posso
 * pedir o que eu quiser e ela aplica, ela é a gerente".
 *
 * GET devolve o histórico dos pedidos (quem pediu, o que mudou, se pode
 * desfazer). POST é uma fala; o que acontece com o plano dela está em
 * lib/vera/conversa.ts, e o toque de aplicar ou desfazer em ./pedidos.
 *
 * A aprovação e a reprovação das peças na esteira continuam com o JEV, como
 * já eram (lib/squad/vera-pelo-jev.ts). Esta é a outra metade do papel dela:
 * gerente que o cliente aciona.
 */

async function acesso(id: string) {
  const { userId } = await auth();
  if (!userId) return { erro: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  const projeto = await prisma.project.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!projeto || !(await podeUsarProjeto(userId, projeto))) return { erro: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
  return { userId } as const;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await acesso(id);
  if ("erro" in a) return a.erro;
  const pedidos = await listarPedidos(id, 20);
  return NextResponse.json({ pedidos: pedidos.map(paraATela) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await acesso(id);
  if ("erro" in a) return a.erro;

  const body = (await req.json().catch(() => ({}))) as { mensagem?: string; conversa?: TurnoParaAVera[] };
  const mensagem = (body.mensagem ?? "").trim().slice(0, 1500);
  if (!mensagem) return NextResponse.json({ error: "Escreva o que você quer pedir à Vera." }, { status: 400 });

  try {
    const r = await conversarComAVera({ projectId: id, userId: a.userId, mensagem, conversa: body.conversa, executar: executarAcaoDaVera });
    if (r.usou.length) console.log(`[vera-gerente] ${id} usou: ${r.usou.join(", ")}`);
    return NextResponse.json({ resposta: r.resposta, pedido: r.pedido });
  } catch (e) {
    console.error("[vera-gerente]", id, e);
    return NextResponse.json({ error: "A Vera não conseguiu responder agora. Tente de novo em instantes." }, { status: 502 });
  }
}
