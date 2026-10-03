export const dynamic = "force-dynamic";

import { auth } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { esconderDiaSemPosts, reabrirDia } from "@/lib/posts/espelhar-no-gestor";
import { podeUsarProjeto } from "@/lib/equipe/conta";

/**
 * Arquivar, desarquivar ou apagar VÁRIOS posts de uma vez.
 *
 * ## Por que uma rota própria
 *
 * Pedido do Bruno em 18/09: "a tela de posts deve dar para selecionar tudo ou
 * todos de uma vez com flags, vou deletar tudo e gerar de novo". Vinte posts
 * por vinte chamadas seriam vinte idas ao servidor, vinte chances de parar no
 * meio, e vinte vezes o trabalho de espelhar no Gestor.
 *
 * ## O que ela protege
 *
 * 1. **A posse.** Os posts são buscados por id COM o projeto, e qualquer id de
 *    outro dono derruba a chamada inteira. Nada de apagar o que deu certo e
 *    ignorar o resto.
 * 2. **O que está no ar.** Post publicado não se apaga: apagar o registro não
 *    tira a publicação da rede, só faz a plataforma esquecer que ela existe.
 *    Eles são recusados por nome, e a tela conta quantos ficaram.
 * 3. **O Gestor.** A relação card -> post não tem cascade, então o dia que
 *    ficou sem post vivo precisa ser escondido do quadro (`esconderDiaSemPosts`,
 *    parte 106). Aqui isso roda UMA vez por dia afetado, no fim, e não por post.
 */

type Acao = "apagar" | "arquivar" | "rascunho";

const ACOES: Acao[] = ["apagar", "arquivar", "rascunho"];

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ids, acao } = (await req.json()) as { ids?: unknown; acao?: unknown };

  if (!Array.isArray(ids) || ids.length === 0 || ids.some((i) => typeof i !== "string")) {
    return NextResponse.json({ error: "Nenhum post selecionado." }, { status: 400 });
  }
  if (typeof acao !== "string" || !ACOES.includes(acao as Acao)) {
    return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
  }

  const posts = await prisma.post.findMany({
    where: { id: { in: ids as string[] } },
    select: { id: true, status: true, publishedAt: true, runId: true, dayOfWeek: true, projectId: true, project: { select: { userId: true } } },
  });

  // Acesso de equipe (01/10): cada projeto conferido uma vez, não cada post.
  const projetosDosPosts = new Map(posts.map((p) => [p.projectId, p.project.userId]));
  let todosLiberados = true;
  for (const [pid, dono] of projetosDosPosts) {
    if (!(await podeUsarProjeto(userId, { id: pid, userId: dono }))) todosLiberados = false;
  }
  if (posts.length !== ids.length || !todosLiberados) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Publicado fica de fora, e a tela diz quantos ficaram.
  //
  // "Publicado" é o que FOI AO AR, inclusive o que foi arquivado depois
  // (01/10). Arquivar grava "cancelled", e o filtro antigo pelo status deixava
  // apagar um post arquivado que estava no ar: o registro sumia levando junto
  // o histórico dos números, e a publicação continuava na rede.
  const foiAoAr = (p: (typeof posts)[number]) => p.status === "published" || p.publishedAt !== null;
  const publicados = posts.filter(foiAoAr);
  const alvos = acao === "apagar" ? posts.filter((p) => !foiAoAr(p)) : posts;

  if (alvos.length === 0) {
    return NextResponse.json({ ok: true, feitos: 0, publicadosIgnorados: publicados.length });
  }

  const alvoIds = alvos.map((p) => p.id);

  if (acao === "apagar") {
    await prisma.post.deleteMany({ where: { id: { in: alvoIds } } });
  } else if (acao === "arquivar") {
    await prisma.post.updateMany({ where: { id: { in: alvoIds } }, data: { status: "cancelled" } });
  } else {
    // Tirar do arquivo um post que já foi ao ar devolve "published", nunca
    // "draft": rascunho pode ser agendado de novo, e a peça sairia duas vezes
    // na rede (01/10).
    const noAr = alvos.filter(foiAoAr).map((p) => p.id);
    const resto = alvoIds.filter((id) => !noAr.includes(id));
    if (noAr.length) await prisma.post.updateMany({ where: { id: { in: noAr } }, data: { status: "published" } });
    if (resto.length) await prisma.post.updateMany({ where: { id: { in: resto } }, data: { status: "draft" } });
  }

  // Um espelhamento por (run, dia), depois de tudo. A ordem importa: o
  // `esconderDiaSemPosts` conta os posts vivos, então precisa rodar depois da
  // escrita, nunca antes.
  const dias = new Map<string, { runId: string; dayOfWeek: number }>();
  for (const p of alvos) {
    if (!p.runId || p.dayOfWeek === null) continue;
    dias.set(`${p.runId}:${p.dayOfWeek}`, { runId: p.runId, dayOfWeek: p.dayOfWeek });
  }
  for (const { runId, dayOfWeek } of dias.values()) {
    if (acao === "rascunho") await reabrirDia(runId, dayOfWeek);
    else await esconderDiaSemPosts(runId, dayOfWeek);
  }

  return NextResponse.json({ ok: true, feitos: alvos.length, publicadosIgnorados: publicados.length });
}
