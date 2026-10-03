export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { reuniaoDoToken } from "@/lib/agenda/segredos";

/**
 * O LEAD ABRIU A SALA (01/10, régua de alertas). Chamado pelo navegador na
 * página /demonstracao/sala/[token] (ver components/agenda/abrir-sala.tsx).
 *
 * Só conta perto do horário (de 15 minutos antes até 15 depois do fim): quem
 * abre o link no dia anterior para testar não está "na sala". Grava só a
 * primeira vez.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const id = reuniaoDoToken((await params).token);
  if (!id) return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  const agora = new Date();
  const r = await prisma.reuniaoDeDemonstracao.updateMany({
    where: {
      id,
      leadEntrouEm: null,
      status: { in: ["marcada", "realizada"] },
      inicio: { lte: new Date(agora.getTime() + 15 * 60_000) },
      fim: { gte: new Date(agora.getTime() - 15 * 60_000) },
    },
    data: { leadEntrouEm: agora },
  });
  return NextResponse.json({ ok: true, registrou: r.count === 1 });
}
