export const dynamic = "force-dynamic";
/** O pedido do chat passa pelo JEV (comparação e privacidade) e pelo redator: até um minuto. */
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { soODono } from "@/lib/equipe/permissoes";
import { ligarAoProjeto, lerDesign, registrarPedidoDeDesign } from "@/lib/biblioteca-de-design/registro";
import { aprovarEstiloPeloDesign, estadoDoEstiloDosPosts } from "@/lib/estilo-dos-posts/servidor";
import { pedidoDaConversa } from "@/lib/estilo-dos-posts/tipos";

/**
 * O ESTILO DOS POSTS DE UM PROJETO (08/10/2026).
 *
 * Decisão do Bruno: "isso precisa ser um quadro de chat para o usuário
 * escrever como ele quer o estilo dos posts, ou ele pode escolher estilos da
 * biblioteca"; e "o usuário gera a campanha toda e só no final descobre que
 * está faltando aprovar o estilo, as artes". Esta rota é o passo único que o
 * assistente do projeto, a janela da campanha e a jornada do vídeo abrem
 * (components/estilo-dos-posts/estilo-dos-posts.tsx):
 *
 * GET: como os posts saem hoje (aprovado ou não, o design ou os modelos, e
 *   quantas artes antigas esperam).
 * POST { conversa: string[], soNoMeuProjeto? }: o cliente ESCREVEU no chat.
 *   As mensagens viram um pedido (o último ajuste manda), a biblioteca de
 *   design registra (o JEV compara, o Claude escreve a ficha) e o design vira
 *   o estilo APROVADO na hora.
 * PUT { designId }: o cliente ESCOLHEU um design de imagem da biblioteca; ele
 *   vira o estilo aprovado (modelo do book: passa a ser o único escolhido).
 *
 * Só o dono muda, como a direção visual. Nenhuma arte é gerada aqui.
 */

async function projetoDoUsuario(id: string) {
  const { userId } = await auth();
  if (!userId) return { erro: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true, userId: true, niche: true, targetAudience: true } });
  if (!project || !(await podeUsarProjeto(userId, project))) return { erro: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  return { project, userId };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await projetoDoUsuario(id);
  if (r.erro) return r.erro;
  return NextResponse.json(await estadoDoEstiloDosPosts(id, r.project.userId === r.userId));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await projetoDoUsuario(id);
  if (r.erro) return r.erro;
  const recusa = await soODono(r.userId, r.project, "escolher o estilo dos posts");
  if (recusa) return recusa;
  const corpo = (await req.json().catch(() => ({}))) as { conversa?: unknown; soNoMeuProjeto?: unknown };
  const mensagens = Array.isArray(corpo.conversa) ? corpo.conversa.filter((m): m is string => typeof m === "string").slice(-12) : [];
  const pedido = pedidoDaConversa(mensagens);
  if (pedido.length < 12) return NextResponse.json({ error: "Conte com pelo menos uma frase como você quer os posts." }, { status: 400 });
  try {
    const resultado = await registrarPedidoDeDesign({ projectId: id, userId: r.userId, tipo: "imagem", pedido, nicho: r.project.niche, publico: r.project.targetAudience, soNoMeuProjeto: corpo.soNoMeuProjeto === true });
    if (!resultado) return NextResponse.json({ error: "Não consegui registrar o estilo." }, { status: 400 });
    const aprovacao = await aprovarEstiloPeloDesign(id, resultado.design, { substituir: true });
    return NextResponse.json({ ...resultado, ...aprovacao, estado: await estadoDoEstiloDosPosts(id, true) });
  } catch (e) {
    console.error("[estilo-dos-posts] chat:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Não consegui registrar o estilo agora. Tente de novo em instantes." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await projetoDoUsuario(id);
  if (r.erro) return r.erro;
  const recusa = await soODono(r.userId, r.project, "escolher o estilo dos posts");
  if (recusa) return recusa;
  const corpo = (await req.json().catch(() => ({}))) as { designId?: unknown };
  // Só o que este projeto pode ver: público, ou pedido por ele.
  const design = typeof corpo.designId === "string" ? await lerDesign(corpo.designId, { projectId: id, userId: r.userId }).catch(() => null) : null;
  if (!design) return NextResponse.json({ error: "Esse design não existe mais na biblioteca." }, { status: 404 });
  if (design.tipo !== "imagem") return NextResponse.json({ error: "Esse design é de vídeo. Para os posts, escolha um design de imagem." }, { status: 400 });
  try {
    await ligarAoProjeto({ projectId: id, designId: design.id, tipo: design.tipo, comoEntrou: "escolhido" });
    const aprovacao = await aprovarEstiloPeloDesign(id, design, { substituir: true });
    return NextResponse.json({ ok: true, design: { ...design, doProjeto: true }, ...aprovacao, estado: await estadoDoEstiloDosPosts(id, true) });
  } catch (e) {
    console.error("[estilo-dos-posts] escolher:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Não consegui usar esse design agora." }, { status: 500 });
  }
}
