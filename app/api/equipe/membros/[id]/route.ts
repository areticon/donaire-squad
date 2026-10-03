export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { RecusaDaEquipe, atualizarMembro, equipeNaTela, reenviarConvite, removerMembro } from "@/lib/equipe/convites";

type Ctx = { params: Promise<{ id: string }> };

function recusa(e: unknown, onde: string) {
  if (e instanceof RecusaDaEquipe) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(`[equipe/${onde}]`, e);
  return NextResponse.json({ error: "Não consegui salvar agora. Tente de novo em um minuto." }, { status: 500 });
}

/**
 * Um membro da equipe (01/10), só para o dono da conta.
 * PATCH: projetos liberados e tetos do mês. POST {acao:"reenviar"}: link novo
 * do convite. DELETE: tira o acesso (o histórico de consumo fica).
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const dados: Record<string, unknown> = {};
  for (const k of ["projetos", "todosOsProjetos", "tetoGravacoes", "tetoCreditos"]) if (k in corpo) dados[k] = corpo[k];
  try {
    await atualizarMembro(userId, id, dados);
    return NextResponse.json({ ok: true, equipe: await equipeNaTela(userId) });
  } catch (e) {
    return recusa(e, "atualizar");
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const corpo = (await req.json().catch(() => ({}))) as { acao?: string };
  if (corpo.acao !== "reenviar") return NextResponse.json({ error: "Ação desconhecida" }, { status: 400 });
  try {
    const r = await reenviarConvite(userId, id);
    return NextResponse.json({ ok: true, ...r, equipe: await equipeNaTela(userId) });
  } catch (e) {
    return recusa(e, "reenviar");
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    await removerMembro(userId, id);
    return NextResponse.json({ ok: true, equipe: await equipeNaTela(userId) });
  } catch (e) {
    return recusa(e, "remover");
  }
}
