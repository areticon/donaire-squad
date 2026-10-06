import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { soODono } from "@/lib/equipe/permissoes";
import { lerArrobaDoYouTube, lerLinks, MAX_LINKS, normalizarArrobaDoYouTube } from "@/lib/projeto/links-do-cliente";

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

  // 06/10: a mesma rota grava o @ do canal no YouTube (`arrobaDoYouTube`),
  // e cada campo é opcional: o assistente do setup manda só o que mudou.
  const body = (await req.json().catch(() => ({}))) as { links?: unknown; arrobaDoYouTube?: unknown };
  const temLinks = "links" in body;
  const temArroba = "arrobaDoYouTube" in body;
  if (!temLinks && !temArroba) return NextResponse.json({ error: "Envie a lista de links." }, { status: 400 });

  const atual = (project.config as Record<string, unknown> | null) ?? {};
  const config: Record<string, unknown> = { ...atual };
  let recusados = 0;
  if (temLinks) {
    if (!Array.isArray(body.links)) return NextResponse.json({ error: "Envie a lista de links." }, { status: 400 });
    if (body.links.length > MAX_LINKS) return NextResponse.json({ error: `No máximo ${MAX_LINKS} links.` }, { status: 400 });
    const links = lerLinks({ linksDoCliente: body.links });
    recusados = body.links.length - links.length;
    config.linksDoCliente = links;
  }
  if (temArroba) {
    const bruto = typeof body.arrobaDoYouTube === "string" ? body.arrobaDoYouTube.trim() : "";
    if (!bruto) delete config.arrobaDoYouTube;
    else {
      const arroba = normalizarArrobaDoYouTube(bruto);
      if (!arroba) return NextResponse.json({ error: "Esse @ não parece o de um canal. Escreva como aparece no YouTube, por exemplo @seucanal." }, { status: 400 });
      config.arrobaDoYouTube = arroba;
    }
  }

  await prisma.project.update({ where: { id }, data: { config: config as Prisma.InputJsonValue } });
  return NextResponse.json({ links: lerLinks(config), arrobaDoYouTube: lerArrobaDoYouTube(config), recusados });
}

/**
 * O QUE ESTÁ GRAVADO AGORA (06/10). O assistente do setup recebe o projeto de
 * quando a página abriu; os links lidos daqui são os de verdade, e é sobre
 * eles que a tela soma ou tira um link.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || !(await podeUsarProjeto(userId, project))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ links: lerLinks(project.config), arrobaDoYouTube: lerArrobaDoYouTube(project.config) });
}
