export const dynamic = "force-dynamic";
/** Até 20 prévias por chamada, uma por vez: cabe no tempo da função. */
export const maxDuration = 800;

import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/admin/guarda";
import { gerarPreviasPendentes, previasPendentes, TETO_DE_PREVIAS_POR_CHAMADA } from "@/lib/biblioteca-de-design/previas";
import { tipoValido } from "@/lib/biblioteca-de-design/tipos";

/**
 * AS PRÉVIAS PENDENTES DA BIBLIOTECA (06/10/2026), só para admin.
 * GET: quantas faltam e o custo estimado (US$ 0,05 a 0,10 cada).
 * POST { confirmar: true, teto?, tipo? }: gera, com o custo real gravado por
 * prévia. Sem `confirmar: true` nada é gerado: regra do Bruno, nenhum gasto
 * sem o OK e o valor antes.
 */
export async function GET() {
  const admin = await exigirAdmin();
  if (!admin) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json({ ...(await previasPendentes()), tetoPorChamada: TETO_DE_PREVIAS_POR_CHAMADA });
}

export async function POST(req: NextRequest) {
  const admin = await exigirAdmin();
  if (!admin) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const corpo = (await req.json().catch(() => ({}))) as { confirmar?: unknown; teto?: unknown; tipo?: unknown };
  if (corpo.confirmar !== true) return NextResponse.json({ error: "Confirme o custo antes de gerar as prévias." }, { status: 400 });
  try {
    const r = await gerarPreviasPendentes({
      confirmar: true,
      teto: typeof corpo.teto === "number" ? corpo.teto : undefined,
      tipo: tipoValido(corpo.tipo) ? corpo.tipo : undefined,
      adminEmail: admin.email,
    });
    return NextResponse.json({ ...r, pendentes: await previasPendentes() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Não consegui gerar as prévias." }, { status: 400 });
  }
}
