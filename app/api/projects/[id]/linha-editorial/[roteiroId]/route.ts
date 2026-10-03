import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { escreverRoteiro } from "@/lib/editorial/linha-editorial";
import type { CenaDoRoteiro, PapelDaCena } from "@/lib/editorial/tipos";
import { projetoVisivel } from "@/lib/equipe/conta";

/**
 * Um roteiro da linha editorial (29/09).
 * POST { duracao } escreve a tese e as cenas da ideia (Opus).
 * PATCH { titulo?, tese?, cenas?, status? } grava a edição à mão do cliente.
 * Descartar é PATCH com status "descartada": a ideia some da lista e continua
 * na memória, para não voltar na próxima leva.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PAPEIS: PapelDaCena[] = ["gancho", "desenvolvimento", "fechamento"];
const STATUS = ["ideia", "pronto", "gravado", "descartada"];

async function doDono(projectId: string, roteiroId: string) {
  const { userId } = await auth();
  if (!userId) return null;
  const r = await prisma.roteiro.findFirst({
    where: { id: roteiroId, projectId, project: projetoVisivel(userId) },
    select: { id: true },
  });
  return r;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; roteiroId: string }> }) {
  const { id, roteiroId } = await params;
  if (!(await doDono(id, roteiroId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { duracao } = (await req.json().catch(() => ({}))) as { duracao?: number };
  const d = [60, 180, 480].includes(Number(duracao)) ? Number(duracao) : 60;
  try {
    await escreverRoteiro(roteiroId, d);
    return NextResponse.json({ roteiro: await prisma.roteiro.findUnique({ where: { id: roteiroId } }) });
  } catch (e) {
    console.error(`[linha-editorial][roteiro] ${e instanceof Error ? e.message : e}`);
    return NextResponse.json({ error: "Não consegui escrever o roteiro agora. Tente de novo." }, { status: 502 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; roteiroId: string }> }) {
  const { id, roteiroId } = await params;
  if (!(await doDono(id, roteiroId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const corpo = (await req.json().catch(() => ({}))) as { titulo?: unknown; tese?: unknown; cenas?: unknown; status?: unknown };
  const data: Record<string, unknown> = {};
  if (typeof corpo.titulo === "string" && corpo.titulo.trim()) data.titulo = corpo.titulo.trim().slice(0, 140);
  if (typeof corpo.tese === "string") data.tese = corpo.tese.trim().slice(0, 600);
  if (typeof corpo.status === "string" && STATUS.includes(corpo.status)) data.status = corpo.status;
  if (Array.isArray(corpo.cenas)) {
    // Só o formato conhecido entra: a tela manda o que o cliente editou, e o
    // editor de vídeo vai ler isto como partitura.
    data.cenas = (corpo.cenas as Array<Partial<CenaDoRoteiro>>).slice(0, 40).map((c, i) => ({
      id: typeof c.id === "string" && c.id ? c.id : `c${i + 1}-${Math.random().toString(36).slice(2, 7)}`,
      papel: PAPEIS.includes(c.papel as PapelDaCena) ? c.papel : "desenvolvimento",
      fala: String(c.fala ?? "").slice(0, 3000),
      naTela: String(c.naTela ?? "").slice(0, 400),
    }));
  }
  const roteiro = await prisma.roteiro.update({ where: { id: roteiroId }, data });
  return NextResponse.json({ roteiro });
}
