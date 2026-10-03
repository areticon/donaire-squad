export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { reuniaoDoToken } from "@/lib/agenda/segredos";
import { ErroDeAgenda, cancelarReuniao, marcarReuniao } from "@/lib/agenda/reunioes";

/**
 * REMARCAR OU CANCELAR PELO LINK DO E-MAIL (01/10).
 *
 * O token assinado da reunião É a autorização: quem tem o link do e-mail é
 * quem recebeu o convite. Sem login, porque o lead não tem conta.
 */

type Ctx = { params: Promise<{ token: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { token } = await params;
  const id = reuniaoDoToken(token);
  if (!id) return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  try {
    const c = (await req.json()) as Record<string, unknown>;
    const r = await prisma.reuniaoDeDemonstracao.findUnique({ where: { id }, select: { leadId: true, status: true } });
    if (!r) return NextResponse.json({ error: "Reunião não encontrada." }, { status: 404 });

    if (c.acao === "cancelar") {
      const ok = await cancelarReuniao(id, "lead");
      return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Esta reunião já estava cancelada." }, { status: 409 });
    }
    if (c.acao === "remarcar") {
      if (typeof c.inicio !== "string") return NextResponse.json({ error: "Escolha um horário." }, { status: 400 });
      const pessoaId = typeof c.pessoaId === "string" && c.pessoaId !== "qualquer" ? c.pessoaId : null;
      const nova = await marcarReuniao({ leadId: r.leadId, inicioIso: c.inicio, pessoaId, reuniaoId: id });
      return NextResponse.json({ ok: true, reuniao: nova });
    }
    return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
  } catch (e) {
    if (e instanceof ErroDeAgenda) return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status });
    console.error("[agenda] remarcar/cancelar falhou:", e);
    return NextResponse.json({ error: "Não consegui agora. Tente de novo em instantes." }, { status: 500 });
  }
}
