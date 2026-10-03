export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { exigirAdmin } from "@/lib/admin/guarda";
import { estadoDoOAuth } from "@/lib/agenda/segredos";
import { googleAgendaConfigurado, urlDeAutorizacao } from "@/lib/agenda/google";

/**
 * CONECTAR UMA CONTA GOOGLE A UMA PESSOA DO TIME (01/10). Quem clica é um
 * admin, mas quem AUTORIZA é o dono da conta Google: o Matheus pode abrir
 * este link no computador dele, logado no /admin, e conectar a conta dele.
 * O `state` assinado amarra a volta à pessoa e ao admin, com 10 minutos.
 */
export async function GET(req: NextRequest) {
  const admin = await exigirAdmin();
  if (!admin) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  if (!googleAgendaConfigurado()) {
    return NextResponse.json({ error: "Faltam GOOGLE_AGENDA_CLIENT_ID e GOOGLE_AGENDA_CLIENT_SECRET neste ambiente." }, { status: 503 });
  }
  const pessoaId = req.nextUrl.searchParams.get("pessoa") ?? "";
  const pessoa = await prisma.pessoaDoTime.findUnique({ where: { id: pessoaId }, select: { id: true, emailAgenda: true } });
  if (!pessoa) return NextResponse.json({ error: "Pessoa não encontrada." }, { status: 404 });
  return NextResponse.redirect(urlDeAutorizacao(estadoDoOAuth(pessoa.id, admin.id), pessoa.emailAgenda));
}
