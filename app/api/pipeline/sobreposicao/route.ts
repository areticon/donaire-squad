import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjetoPorId } from "@/lib/equipe/conta";
import { avisoDeSobreposicao, datasDaCampanha, diasComPecaExistente } from "@/lib/pipeline/sobreposicao-de-campanha";

export const dynamic = "force-dynamic";

/**
 * "JÁ EXISTE PEÇA NESTE DIA?" (05/10/2026). A janela "Nova campanha" pergunta
 * antes de gerar, com os dias que a pessoa escolheu, e mostra o aviso com a
 * opção de substituir. A esteira nunca decide isso sozinha
 * (lib/pipeline/sobreposicao-de-campanha.ts).
 *
 * GET ?projectId=...&weekStart=AAAA-MM-DD&dias=1,3,5&semanas=1|2
 */
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams;
  const projectId = q.get("projectId") ?? "";
  const weekStart = q.get("weekStart") ?? "";
  const dias = (q.get("dias") ?? "").split(",").map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
  const semanas = q.get("semanas") === "2" ? 2 : 1;
  if (!projectId || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || !dias.length) {
    return NextResponse.json({ error: "projectId, weekStart e dias são obrigatórios" }, { status: 400 });
  }
  if (!(await podeUsarProjetoPorId(userId, projectId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const datas = datasDaCampanha(weekStart, dias, semanas);
  const inicio = new Date(`${datas[0]}T00:00:00.000Z`);
  const fim = new Date(`${datas[datas.length - 1]}T00:00:00.000Z`);
  fim.setUTCDate(fim.getUTCDate() + 1);
  const pecas = await prisma.post.findMany({
    where: { projectId, scheduledAt: { gte: inicio, lt: fim } },
    select: { runId: true, status: true, scheduledAt: true },
  });
  const diasOcupados = diasComPecaExistente(pecas, datas);
  return NextResponse.json({ dias: diasOcupados, aviso: avisoDeSobreposicao(diasOcupados) });
}
