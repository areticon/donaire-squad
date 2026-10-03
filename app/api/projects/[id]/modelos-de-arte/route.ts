import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { soODono } from "@/lib/equipe/permissoes";
import { identidadeDoProjeto } from "@/lib/media/identidade-visual";
import { lerModelosEscolhidos, salvarModelosEscolhidos } from "@/lib/modelos-de-arte/escolha";

/**
 * O BOOK DE MODELOS DO PROJETO (03/10/2026).
 *
 * GET devolve a escolha e o que a galeria precisa para desenhar cada modelo na
 * marca do cliente (cores efetivas, logo, nome, setor para o texto de exemplo).
 * PUT { ids } grava a escolha, que a geração das artes obedece
 * (lib/media/arte-com-frase.tsx). Só o dono muda, como a direção visual.
 */
export const dynamic = "force-dynamic";

async function projetoDoUsuario(projectId: string, userId: string) {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, userId: true, name: true, logoUrl: true, socialAccounts: { where: { platform: "instagram" }, select: { username: true }, take: 1 } },
  });
  return p && (await podeUsarProjeto(userId, p)) ? p : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const p = await projetoDoUsuario(id, userId);
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [escolha, identidade] = await Promise.all([lerModelosEscolhidos(id), identidadeDoProjeto(id)]);
  const usuario = p.socialAccounts[0]?.username?.replace(/^@/, "");
  return NextResponse.json({
    escolha: escolha?.ids ?? [],
    em: escolha?.em ?? null,
    podeMudar: p.userId === userId,
    marca: {
      nome: p.name,
      cores: identidade.cores,
      origemDasCores: identidade.origemDasCores,
      logoUrl: p.logoUrl,
      setor: identidade.setor.id,
      setorNome: identidade.setor.nome,
      arroba: usuario ? `@${usuario}` : undefined,
    },
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const p = await projetoDoUsuario(id, userId);
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const recusa = await soODono(userId, p, "mudar os modelos de arte da marca");
  if (recusa) return recusa;
  const corpo = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(corpo.ids) ? corpo.ids.filter((x): x is string => typeof x === "string") : [];
  const escolha = await salvarModelosEscolhidos(id, ids);
  return NextResponse.json({ escolha: escolha?.ids ?? [], em: escolha?.em ?? null });
}
