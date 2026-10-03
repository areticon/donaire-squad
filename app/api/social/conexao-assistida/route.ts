export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { exigirAdmin } from "@/lib/admin/guarda";
import {
  pedidosDoProjeto,
  pedirConexaoAssistida,
  RecusaDoPedido,
  redesDeConexaoAssistida,
} from "@/lib/social/conexao-assistida";
import { projetoVisivel } from "@/lib/equipe/conta";
import { soODono } from "@/lib/equipe/permissoes";

/**
 * CONEXÃO ASSISTIDA, o lado do cliente (01/10).
 *
 * GET  ?projectId=  as redes assistidas e os pedidos já feitos neste projeto,
 *                   para a tela dizer "pedido enviado em ..." em vez de deixar
 *                   a pessoa clicar de novo achando que não foi.
 * POST {projectId, rede, nota?}  avisa os admins por e-mail e confirma ao
 *                   cliente. Pedido repetido em 12 h não gera outro e-mail.
 *
 * Ver lib/social/conexao-assistida.ts para o porquê.
 */
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const projectId = req.nextUrl.searchParams.get("projectId") ?? "";
  const projeto = await prisma.project.findFirst({ where: { id: projectId, ...projetoVisivel(userId) }, select: { id: true } });
  if (!projeto) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // `conectarDireto`: o admin é papel nos apps da Meta e do TikTok, então o
  // OAuth próprio funciona para ele, e a tela guarda um link discreto para isso.
  const admin = await exigirAdmin().catch(() => null);
  return NextResponse.json({
    assistidas: redesDeConexaoAssistida(),
    pedidos: await pedidosDoProjeto(userId, projectId),
    conectarDireto: Boolean(admin),
  });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const corpo = (await req.json().catch(() => ({}))) as { projectId?: string; rede?: string; nota?: string };
  // Pedir conexão é mexer nas redes do projeto: só o dono (01/10, acabamento).
  // Projeto inexistente segue para a recusa de sempre, dentro do pedido.
  const visivel = corpo.projectId
    ? await prisma.project.findFirst({ where: { id: corpo.projectId, ...projetoVisivel(userId) }, select: { userId: true } })
    : null;
  if (visivel) {
    const recusa = await soODono(userId, visivel, "pedir a conexão das redes deste projeto");
    if (recusa) return recusa;
  }
  try {
    const r = await pedirConexaoAssistida({
      userId,
      projectId: corpo.projectId ?? "",
      rede: corpo.rede ?? "",
      nota: corpo.nota,
      baseUrl: process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin,
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof RecusaDoPedido) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[conexao-assistida] pedido falhou", e);
    return NextResponse.json({ error: "Não consegui registrar o pedido agora. Tente de novo em instantes." }, { status: 500 });
  }
}
