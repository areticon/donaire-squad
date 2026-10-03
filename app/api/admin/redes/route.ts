export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { exigirAdmin } from "@/lib/admin/guarda";
import { desligarContaDaPonte, ligarContaDaPonte, RecusaDoVinculo } from "@/lib/admin/blotato-vinculos";

/**
 * LIGAR E DESLIGAR CONTAS DA PONTE NOS PROJETOS, pela tela /admin/redes (01/10).
 *
 * POST   {projectId, contaId, paginaId?, socialId?}  liga (ver ligarContaDaPonte)
 * DELETE {socialId}                                    desliga (ver desligarContaDaPonte)
 *
 * O papel de admin é conferido a cada chamada, lido do banco; quem não é admin
 * recebe 404, como nas outras rotas de admin. Toda ação vai para
 * `admin_acoes`, e aparece na ficha do cliente no CRM.
 */
async function registrar(admin: { id: string; email: string }, projectId: string, acao: string, detalhe: object) {
  const dono = await prisma.project.findUnique({ where: { id: projectId }, select: { user: { select: { id: true, email: true } } } });
  await prisma.acaoDeAdmin
    .create({
      data: {
        adminId: admin.id,
        adminEmail: admin.email,
        alvoId: dono?.user.id ?? null,
        alvoEmail: dono?.user.email ?? "",
        acao,
        detalhe,
      },
    })
    .catch((e) => console.warn("[admin/redes] não registrei a ação", e));
}

export async function POST(req: NextRequest) {
  const admin = await exigirAdmin();
  if (!admin) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const corpo = (await req.json().catch(() => ({}))) as { projectId?: string; contaId?: string; paginaId?: string; socialId?: string };
  if (!corpo.projectId || !corpo.contaId) return NextResponse.json({ error: "Escolha o projeto e a conta." }, { status: 400 });
  try {
    const r = await ligarContaDaPonte({
      projectId: corpo.projectId,
      contaId: corpo.contaId,
      paginaId: corpo.paginaId || null,
      socialId: corpo.socialId || null,
    });
    await registrar(admin, corpo.projectId, "ligar-rede-pela-ponte", { ...r, projectId: corpo.projectId });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof RecusaDoVinculo) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[admin/redes] ligar", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao ligar." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const admin = await exigirAdmin();
  if (!admin) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const { socialId } = (await req.json().catch(() => ({}))) as { socialId?: string };
  if (!socialId) return NextResponse.json({ error: "Qual conta?" }, { status: 400 });
  try {
    const r = await desligarContaDaPonte(socialId);
    await registrar(admin, r.projectId, "desligar-rede-da-ponte", { socialId, ...r });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof RecusaDoVinculo) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[admin/redes] desligar", e);
    return NextResponse.json({ error: "Falha ao desligar." }, { status: 500 });
  }
}
