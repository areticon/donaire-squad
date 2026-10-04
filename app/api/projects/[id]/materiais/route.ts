export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { etiquetarMaterial, paraTela } from "@/lib/materiais/servidor";
import { LIMITES_DO_MATERIAL, orientacaoDe } from "@/lib/materiais/tipos";

/**
 * A BIBLIOTECA DE MATERIAIS DO PROJETO (03/10/2026).
 *
 * GET lista (mais novos primeiro). POST registra um arquivo que o navegador
 * acabou de subir para o Blob privado e lê as etiquetas por visão DEPOIS da
 * resposta (`after`): a tela mostra "analisando" e consulta de novo.
 */

async function projetoDe(id: string, userId: string) {
  const p = await prisma.project.findUnique({ where: { id }, select: { id: true, userId: true } });
  return p && (await podeUsarProjeto(userId, p)) ? p : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await projetoDe(id, userId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const linhas = await prisma.materialDoCliente.findMany({ where: { projectId: id }, orderBy: { createdAt: "desc" }, take: 300 });
  return NextResponse.json({ materiais: linhas.map(paraTela) });
}

function doBlobPrivado(u: unknown, id: string): u is string {
  if (typeof u !== "string") return false;
  try {
    const url = new URL(u);
    return url.protocol === "https:" && url.hostname.endsWith(".private.blob.vercel-storage.com") && url.pathname.startsWith(`/materiais/${id}/`);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await projetoDe(id, userId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const tipo = b.tipo === "video" ? "video" : "foto";
  if (!doBlobPrivado(b.url, id)) return NextResponse.json({ error: "Arquivo fora da pasta do projeto." }, { status: 400 });
  for (const campo of ["miniaturaUrl", "folhaUrl"] as const) {
    if (b[campo] != null && !doBlobPrivado(b[campo], id)) return NextResponse.json({ error: "Arquivo de apoio fora da pasta do projeto." }, { status: 400 });
  }
  const duracao = Number(b.duracaoSec) || null;
  if (tipo === "video" && duracao && duracao > LIMITES_DO_MATERIAL.video.maxSegundos + 1) {
    return NextResponse.json({ error: `Vídeo de até ${LIMITES_DO_MATERIAL.video.maxSegundos / 60} minutos aqui. Vídeo longo vai por Enviar gravação.` }, { status: 400 });
  }
  const largura = Number(b.largura) || null;
  const altura = Number(b.altura) || null;
  const m = await prisma.materialDoCliente.create({
    data: {
      projectId: id,
      userId,
      tipo,
      url: b.url as string,
      miniaturaUrl: (b.miniaturaUrl as string | undefined) ?? null,
      folhaUrl: (b.folhaUrl as string | undefined) ?? null,
      nome: typeof b.nome === "string" ? b.nome.slice(0, 160) : null,
      mimeType: typeof b.mimeType === "string" ? b.mimeType.slice(0, 60) : null,
      sizeBytes: Number(b.sizeBytes) > 0 ? BigInt(Math.round(Number(b.sizeBytes))) : null,
      largura,
      altura,
      duracaoSec: duracao,
      orientacao: orientacaoDe(largura, altura),
    },
  });
  after(() => etiquetarMaterial(m.id));
  return NextResponse.json({ material: paraTela(m) });
}
