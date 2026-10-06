import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { soODono } from "@/lib/equipe/permissoes";
import { registrarNota } from "@/lib/cerebro/captura";
import { decidirRegra, type DecisaoDaRegra } from "@/lib/referencias/regras";

/**
 * PATCH { acao: "aprovar" | "recusar" | "desligar" | "religar" | "editar", texto?, alvos? }
 *
 * O dono decide cada regra proposta pelo Roberto (02/10). Só a aprovada entra
 * no que os agentes leem; "editar" grava o texto novo e aprova junto.
 */
export const dynamic = "force-dynamic";

const ACOES: DecisaoDaRegra["acao"][] = ["aprovar", "recusar", "desligar", "religar", "editar"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; regraId: string }> }) {
  const { id, regraId } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const projeto = await prisma.project.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!projeto || !(await podeUsarProjeto(userId, projeto))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const negado = await soODono(userId, projeto, "mexer nas regras do projeto");
  if (negado) return negado;
  const corpo = (await req.json().catch(() => ({}))) as { acao?: string; texto?: string; alvos?: string[] };
  const acao = ACOES.find((x) => x === corpo.acao);
  if (!acao) return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  try {
    const regra = await decidirRegra(id, regraId, { acao, texto: corpo.texto, alvos: corpo.alvos });
    if (!regra) return NextResponse.json({ error: "Regra não encontrada." }, { status: 404 });
    // O SEGUNDO CÉREBRO (06/10): a decisão sobre a regra é nota do cliente, lida pelo JEV.
    after(() => registrarNota(id, `regra:${regra.id}`));
    return NextResponse.json({ ok: true, regra });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Não consegui salvar agora." }, { status: 400 });
  }
}
