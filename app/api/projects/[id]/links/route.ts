import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { soODono } from "@/lib/equipe/permissoes";
import {
  ERRO_DO_ENDERECO,
  lerArrobaDoYouTube,
  lerLinks,
  lerRedesEscritas,
  MAX_LINKS,
  normalizarArrobaDoYouTube,
  normalizarEnderecoDaRede,
  REDES_DO_PERFIL,
  type RedeDoPerfil,
} from "@/lib/projeto/links-do-cliente";
import { STATUS_DO_PERFIL_PROPRIO } from "@/lib/referencias/tipos-do-perfil-proprio";

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
  // 06/10 (fonte única): também grava as redes do cliente (`redes`, um objeto
  // { instagram, tiktok, youtube, linkedin, facebook }), só as que vieram;
  // texto vazio apaga aquela rede. Só grava: nada aqui dispara estudo.
  const body = (await req.json().catch(() => ({}))) as { links?: unknown; arrobaDoYouTube?: unknown; redes?: unknown };
  const temLinks = "links" in body;
  const temArroba = "arrobaDoYouTube" in body;
  const temRedes = "redes" in body;
  if (!temLinks && !temArroba && !temRedes) return NextResponse.json({ error: "Envie a lista de links." }, { status: 400 });

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

  if (temRedes) {
    if (!body.redes || typeof body.redes !== "object" || Array.isArray(body.redes)) {
      return NextResponse.json({ error: "Envie as redes." }, { status: 400 });
    }
    const vindas = body.redes as Record<string, unknown>;
    const redes: Record<string, string> = { ...(lerRedesEscritas({ redesDoCliente: atual.redesDoCliente }) as Record<string, string>) };
    for (const rede of REDES_DO_PERFIL) {
      if (!(rede in vindas)) continue;
      const bruto = typeof vindas[rede] === "string" ? (vindas[rede] as string).trim() : "";
      if (!bruto) delete redes[rede];
      else {
        const valor = normalizarEnderecoDaRede(rede as RedeDoPerfil, bruto);
        if (!valor) return NextResponse.json({ error: ERRO_DO_ENDERECO[rede], rede }, { status: 400 });
        redes[rede] = valor;
      }
      // O YouTube escrito aqui substitui o campo antigo do @ (que deixa de
      // existir): sem isto, apagar o YouTube em cima faria o @ velho voltar.
      if (rede === "youtube") delete config.arrobaDoYouTube;
    }
    if (Object.keys(redes).length) config.redesDoCliente = redes;
    else delete config.redesDoCliente;
  }

  await prisma.project.update({ where: { id }, data: { config: config as Prisma.InputJsonValue } });
  return NextResponse.json({ links: lerLinks(config), arrobaDoYouTube: lerArrobaDoYouTube(config), redes: lerRedesEscritas(config), recusados });
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
  // Os perfis já estudados (gravados pelo Estudar o meu perfil antes da fonte
  // única) vão à parte: a tela mostra cada um na rede que ainda não foi
  // escrita, e o dono, ao abrir, grava em `redesDoCliente` (nada se perde).
  const estudados = await prisma.referenciaPerfil
    .findMany({ where: { projectId: id, status: STATUS_DO_PERFIL_PROPRIO }, select: { rede: true, perfil: true }, orderBy: { createdAt: "asc" } })
    .catch(() => []);
  const estudadas: Record<string, string> = {};
  for (const e of estudados) {
    if (!(REDES_DO_PERFIL as readonly string[]).includes(e.rede) || estudadas[e.rede]) continue;
    const valor = normalizarEnderecoDaRede(e.rede as RedeDoPerfil, e.perfil);
    if (valor) estudadas[e.rede] = valor;
  }
  return NextResponse.json({
    links: lerLinks(project.config),
    arrobaDoYouTube: lerArrobaDoYouTube(project.config),
    redes: lerRedesEscritas(project.config),
    estudadas,
  });
}
