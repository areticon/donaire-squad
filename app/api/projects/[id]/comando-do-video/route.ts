import { auth } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { normalizarComando } from "@/lib/media/editor-por-comando/comando";
import { editorPorComandoLigado, lerComandoDoProjeto, paletaDoProjeto, salvarComandoDoProjeto } from "@/lib/media/editor-por-comando";
import { coresDaMarca } from "@/lib/media/capa-composta";

/**
 * O COMANDO DO VÍDEO (05/10/2026): a tela pergunta se o editor por comando
 * está ligado (EDITOR_POR_COMANDO=1) e lê o comando guardado; o PUT grava só
 * a chave `comandoDoVideo` dentro de `projects.config`.
 */

async function projetoDoUsuario(id: string) {
  const { userId } = await auth();
  if (!userId) return { erro: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || !(await podeUsarProjeto(userId, project))) return { erro: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  return { project };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await projetoDoUsuario(id);
  if (r.erro) return r.erro;
  const ligado = editorPorComandoLigado();
  // A paleta inteira (na ordem do cliente), o nicho e o público: as miniaturas dos estilos preenchem o comando com eles (05/10, noite).
  return NextResponse.json({
    ligado,
    comando: ligado ? await lerComandoDoProjeto(id) : null,
    marca: coresDaMarca(r.project.colorPalette),
    paleta: paletaDoProjeto(r.project.colorPalette),
    nicho: r.project.niche ?? null,
    publico: r.project.targetAudience ?? null,
    nome: r.project.name,
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await projetoDoUsuario(id);
  if (r.erro) return r.erro;
  const comando = normalizarComando(await req.json().catch(() => null));
  if (!comando) return NextResponse.json({ error: "Escreva o comando do vídeo (pelo menos algumas palavras)." }, { status: 400 });
  await salvarComandoDoProjeto(id, comando);
  return NextResponse.json({ ok: true, comando });
}
