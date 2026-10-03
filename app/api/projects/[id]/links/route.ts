import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { soODono } from "@/lib/equipe/permissoes";
import { lerLinks, MAX_LINKS } from "@/lib/projeto/links-do-cliente";

/**
 * OS LINKS DO CLIENTE (03/10): grava a lista inteira em
 * `Project.config.linksDoCliente`, sem tocar no resto do `config` (o PATCH do
 * projeto troca o `config` inteiro, e apagaria o que mora ao lado). A lista
 * passa pela mesma leitura que os agentes usam (`lerLinks`): URL inválida não
 * entra, e a resposta devolve o que ficou gravado de fato.
 *
 * É configuração da marca, então é do dono (o membro da equipe lê).
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || !(await podeUsarProjeto(userId, project))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const recusa = await soODono(userId, project, "mudar os links do projeto");
  if (recusa) return recusa;

  const body = (await req.json().catch(() => ({}))) as { links?: unknown };
  if (!Array.isArray(body.links)) return NextResponse.json({ error: "Envie a lista de links." }, { status: 400 });
  if (body.links.length > MAX_LINKS) return NextResponse.json({ error: `No máximo ${MAX_LINKS} links.` }, { status: 400 });
  const links = lerLinks({ linksDoCliente: body.links });
  const recusados = body.links.length - links.length;

  const config = { ...((project.config as Record<string, unknown> | null) ?? {}), linksDoCliente: links };
  await prisma.project.update({ where: { id }, data: { config: config as Prisma.InputJsonValue } });
  return NextResponse.json({ links, recusados });
}
