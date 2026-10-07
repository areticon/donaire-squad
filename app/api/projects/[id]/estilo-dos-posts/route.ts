export const dynamic = "force-dynamic";
/** O pedido do chat passa pelo JEV (comparação e privacidade) e pelo redator: até um minuto. */
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { soODono } from "@/lib/equipe/permissoes";
import { ligarAoProjeto, lerDesign, registrarPedidoDeDesign, type MotivoDeFicarNoProjeto } from "@/lib/biblioteca-de-design/registro";
import { aprovarEstiloPeloDesign, designAprovadoDoProjeto, estadoDoEstiloDosPosts, salvarUltimoModelo, tipoDoUltimoValido } from "@/lib/estilo-dos-posts/servidor";
import { modeloParaOFormato, pedidoDaConversa } from "@/lib/estilo-dos-posts/tipos";

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
 *   quantas artes antigas esperam), o último modelo de cada tipo de post e o
 *   estilo de edição do projeto (a escolha de cada dia vem preenchida com eles).
 * POST { conversa: string[], soNoMeuProjeto?, paraOPost? }: o cliente CRIOU o
 *   estilo, escrevendo ou falando (a fala chega aqui já como texto, pela rota
 *   ./voz). As mensagens viram um pedido (o último ajuste manda), a biblioteca
 *   registra (o JEV compara e separa o visual do dado do cliente, o Claude
 *   escreve a ficha) e o modelo entra na biblioteca de todos por padrão.
 *   Sem `paraOPost`, o dono também aprova o modelo como o estilo do projeto;
 *   com ele (a escolha de um dia da campanha), o modelo só é criado e quem
 *   chama o põe naquele post. O membro da equipe cria (para o post), mas não
 *   aprova o estilo do projeto, que é do dono.
 * PUT { designId }: o dono ESCOLHEU um design de imagem da biblioteca como o
 *   estilo do projeto (modelo do book: passa a ser o único escolhido).
 * PATCH { tipo, modelo }: o último modelo usado num tipo de post ("image",
 *   "carousel", "short"), para a próxima escolha vir preenchida.
 *
 * Nenhuma arte é gerada aqui.
 */

async function projetoDoUsuario(id: string) {
  const { userId } = await auth();
  if (!userId) return { erro: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true, userId: true, niche: true, targetAudience: true } });
  if (!project || !(await podeUsarProjeto(userId, project))) return { erro: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  return { project, userId };
}

/** Onde o modelo criado ficou, dito ao cliente (o padrão é a biblioteca de todos). */
function ondeOModeloFicou(motivo: MotivoDeFicarNoProjeto | undefined, veredito: string): string {
  if (veredito === "igual") return "Esse visual já existia na biblioteca: ligamos ele ao seu projeto.";
  if (veredito === "repetido") return "Você já tinha criado este estilo.";
  if (!motivo) return "Ele entrou na biblioteca de todos: outros clientes podem usar o visual, nunca a sua marca, o seu nome, os seus dados ou as suas fotos.";
  if (motivo === "pedido-do-cliente") return "Ficou só no seu projeto, como você pediu.";
  if (motivo === "sem-conferencia") return "Ficou só no seu projeto por enquanto: não deu para conferir agora se o pedido tinha algo da sua marca.";
  return "Ficou só no seu projeto: o pedido falava da sua marca, de alguém ou de um contato, e isso nunca vai para a biblioteca de todos.";
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
  const corpo = (await req.json().catch(() => ({}))) as { conversa?: unknown; soNoMeuProjeto?: unknown; paraOPost?: unknown };
  const paraOPost = corpo.paraOPost === true;
  const dono = r.project.userId === r.userId;
  // O estilo do projeto é do dono; criar um modelo para um post, qualquer um que usa o projeto.
  if (!paraOPost) {
    const recusa = await soODono(r.userId, r.project, "escolher o estilo dos posts");
    if (recusa) return recusa;
  }
  const mensagens = Array.isArray(corpo.conversa) ? corpo.conversa.filter((m): m is string => typeof m === "string").slice(-12) : [];
  const pedido = pedidoDaConversa(mensagens);
  if (pedido.length < 12) return NextResponse.json({ error: "Conte com pelo menos uma frase como você quer os posts." }, { status: 400 });
  try {
    const resultado = await registrarPedidoDeDesign({ projectId: id, userId: r.userId, tipo: "imagem", pedido, nicho: r.project.niche, publico: r.project.targetAudience, soNoMeuProjeto: corpo.soNoMeuProjeto === true });
    if (!resultado) return NextResponse.json({ error: "Não consegui registrar o estilo." }, { status: 400 });
    const ondeFicou = ondeOModeloFicou(resultado.soNoProjeto, resultado.veredito);
    if (paraOPost) {
      return NextResponse.json({ ...resultado, aprovado: true, efeito: ondeFicou, estado: await estadoDoEstiloDosPosts(id, dono) });
    }
    const aprovacao = await aprovarEstiloPeloDesign(id, resultado.design, { substituir: true });
    return NextResponse.json({ ...resultado, ...aprovacao, efeito: `${aprovacao.efeito} ${ondeFicou}`, estado: await estadoDoEstiloDosPosts(id, true) });
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
  // Só o que este projeto pode ver: público, pedido por ele, ou já ligado a
  // ele (08/10, revisão: o "Aprovar de novo" de um design que o autor tirou
  // da galeria depois de este projeto escolher; ligado, ele continua valendo).
  const designId = typeof corpo.designId === "string" ? corpo.designId : null;
  const design = designId ? ((await lerDesign(designId, { projectId: id, userId: r.userId }).catch(() => null)) ?? (await designAprovadoDoProjeto(id, designId))) : null;
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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await projetoDoUsuario(id);
  if (r.erro) return r.erro;
  const corpo = (await req.json().catch(() => ({}))) as { tipo?: unknown; modelo?: unknown };
  if (!tipoDoUltimoValido(corpo.tipo)) return NextResponse.json({ error: "Diga o tipo do post: foto, carrossel ou vídeo curto." }, { status: 400 });
  const modelo = modeloParaOFormato(corpo.modelo, corpo.tipo);
  if (!modelo) return NextResponse.json({ error: "Essa escolha não serve para esse tipo de post." }, { status: 400 });
  try {
    const ultimos = await salvarUltimoModelo(id, corpo.tipo, modelo);
    return NextResponse.json({ ok: true, ultimos });
  } catch (e) {
    console.error("[estilo-dos-posts] último modelo:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Não consegui guardar a escolha para a próxima vez." }, { status: 500 });
  }
}
