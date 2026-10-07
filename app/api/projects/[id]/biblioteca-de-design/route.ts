export const dynamic = "force-dynamic";
/** O pedido passa pelo JEV e pelo redator: até um minuto. */
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { soODono } from "@/lib/equipe/permissoes";
import { designsDoProjeto, lerDesign, ligarAoProjeto, mudarVisibilidadeNaGaleria, registrarPedidoDeDesign } from "@/lib/biblioteca-de-design/registro";
import { textoParaOComando, tipoValido } from "@/lib/biblioteca-de-design/tipos";
import { aprovarEstiloPeloDesign } from "@/lib/estilo-dos-posts/servidor";
import { lerComandoDoProjeto, salvarComandoDoProjeto } from "@/lib/media/editor-por-comando";

/**
 * A BIBLIOTECA DE DESIGN DE UM PROJETO (06/10/2026).
 *
 * GET: os designs que este projeto escolheu ou pediu.
 * POST { tipo, pedido }: o cliente ESCREVEU o design que quer. O JEV compara
 *   com a biblioteca (igual, variação ou novo), o Claude escreve a ficha
 *   quando precisa, e a entrada fica ligada ao projeto (e pública para todos,
 *   sem o nome dele). Para o vídeo, o pedido também vira o comando do
 *   projeto (o editor obedece ao comando).
 * PUT { designId }: o cliente ESCOLHEU um design da galeria. Vídeo: o pedido
 *   daquele design vira o comando do projeto (letra e cores ficam as de
 *   antes). Imagem de semente: o modelo do book entra nos escolhidos. Imagem
 *   feita por cliente (06/10, tarde): vira o modelo das artes pelo prompt
 *   dele (lib/modelos-de-arte/modelo-do-cliente.ts). Desde 08/10, escrever
 *   ou escolher um design de imagem APROVA o estilo dos posts (a trava das
 *   artes abre), como no quadro de chat do estilo.
 * PATCH { designId, publico }: o AUTOR tira o design da galeria (publico
 *   false) ou pede para devolver (o JEV confere a ficha de novo).
 * Só o dono muda, como a direção visual.
 *
 * PRIVACIDADE (06/10, vazamento): POST aceita { soNoMeuProjeto: true }; sem
 * ele, a entrada só fica pública se o JEV separou o visual do dado do cliente
 * (lib/biblioteca-de-design/privacidade.ts). PUT só aceita design público ou
 * deste projeto, e o comando de quem escolhe recebe a descrição do visual,
 * nunca o pedido cru de outro cliente.
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
  return NextResponse.json({ designs: await designsDoProjeto(id) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await projetoDoUsuario(id);
  if (r.erro) return r.erro;
  const recusa = await soODono(r.userId, r.project, "pedir um design novo para a marca");
  if (recusa) return recusa;
  const corpo = (await req.json().catch(() => ({}))) as { tipo?: unknown; pedido?: unknown; soNoMeuProjeto?: unknown };
  if (!tipoValido(corpo.tipo)) return NextResponse.json({ error: "Diga se o design é de vídeo ou de imagem." }, { status: 400 });
  const pedido = typeof corpo.pedido === "string" ? corpo.pedido.trim() : "";
  if (pedido.length < 12) return NextResponse.json({ error: "Descreva o design com mais detalhes (pelo menos uma frase)." }, { status: 400 });
  try {
    const resultado = await registrarPedidoDeDesign({ projectId: id, userId: r.userId, tipo: corpo.tipo, pedido, nicho: r.project.niche, publico: r.project.targetAudience, soNoMeuProjeto: corpo.soNoMeuProjeto === true });
    if (!resultado) return NextResponse.json({ error: "Não consegui registrar o pedido." }, { status: 400 });
    if (corpo.tipo === "video") {
      const atual = await lerComandoDoProjeto(id);
      await salvarComandoDoProjeto(id, { texto: resultado.design.pedidoOriginal, fonte: atual?.fonte ?? "geist", cores: atual?.cores ?? { tipo: "marca" }, origem: "escrito", referencia: null });
      return NextResponse.json(resultado);
    }
    // Imagem (06/10, tarde): o JEV achou igual a um modelo do book, então ele
    // entra nos escolhidos como na galeria; senão o design escrito vira o
    // modelo das artes pelo prompt do cliente.
    return NextResponse.json({ ...resultado, efeito: await efeitoDoDesignDeImagem(id, resultado.design) });
  } catch (e) {
    console.error("[biblioteca-de-design] pedido:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Não consegui registrar o pedido agora. Tente de novo em instantes." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await projetoDoUsuario(id);
  if (r.erro) return r.erro;
  const recusa = await soODono(r.userId, r.project, "escolher um design da biblioteca para a marca");
  if (recusa) return recusa;
  const corpo = (await req.json().catch(() => ({}))) as { designId?: unknown };
  // Só o que este projeto pode ver: público, ou pedido por ele.
  const design = typeof corpo.designId === "string" ? await lerDesign(corpo.designId, { projectId: id, userId: r.userId }).catch(() => null) : null;
  if (!design) return NextResponse.json({ error: "Esse design não existe mais na biblioteca." }, { status: 404 });
  try {
    await ligarAoProjeto({ projectId: id, designId: design.id, tipo: design.tipo, comoEntrou: "escolhido" });
    let efeito = "Design ligado ao projeto.";
    if (design.tipo === "video") {
      const atual = await lerComandoDoProjeto(id);
      // O texto que vira comando: o pedido só se é deste projeto ou da semente; de outro cliente, o nome e a descrição do visual.
      await salvarComandoDoProjeto(id, { texto: textoParaOComando(design), fonte: atual?.fonte ?? "geist", cores: atual?.cores ?? { tipo: "marca" }, origem: design.catalogoId ? "referencia" : "escrito", referencia: design.catalogoId });
      efeito = "O comando do vídeo passou a ser este design. Vale para os próximos cortes.";
    } else {
      efeito = await efeitoDoDesignDeImagem(id, design);
    }
    return NextResponse.json({ ok: true, design: { ...design, doProjeto: true }, efeito });
  } catch (e) {
    console.error("[biblioteca-de-design] escolher:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Não consegui ligar o design ao projeto." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await projetoDoUsuario(id);
  if (r.erro) return r.erro;
  const recusa = await soODono(r.userId, r.project, "mudar onde um design da marca aparece");
  if (recusa) return recusa;
  const corpo = (await req.json().catch(() => ({}))) as { designId?: unknown; publico?: unknown };
  if (typeof corpo.designId !== "string" || typeof corpo.publico !== "boolean") return NextResponse.json({ error: "Diga qual design e se ele fica na galeria." }, { status: 400 });
  try {
    const resultado = await mudarVisibilidadeNaGaleria({ projectId: id, designId: corpo.designId, publico: corpo.publico });
    if (!resultado.ok) return NextResponse.json({ error: resultado.erro }, { status: 409 });
    return NextResponse.json({ ok: true, publico: resultado.publico, efeito: resultado.publico ? "O design voltou para a galeria, sem o seu nome." : "O design saiu da galeria. Continua no seu projeto." });
  } catch (e) {
    console.error("[biblioteca-de-design] visibilidade:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Não consegui mudar onde o design aparece." }, { status: 500 });
  }
}

/**
 * O que um design de imagem ligado ao projeto faz nas artes. Modelo do book:
 * entra nos escolhidos. Escrito por cliente (06/10, tarde): as próximas artes
 * saem nele, pelo prompt dele, até o cliente escolher outro design ou modelos
 * do book.
 *
 * 08/10, ESCREVER OU ESCOLHER É APROVAR: a identidade exigia um modelo do
 * book, e o design escrito pelo cliente nunca destravava a arte (a rota dizia
 * "as próximas artes saem neste design" e a trava continuava fechada). Agora
 * o design de imagem ligado aqui vira o estilo aprovado dos posts
 * (lib/estilo-dos-posts/servidor.ts), o mesmo do quadro de chat.
 */
async function efeitoDoDesignDeImagem(projectId: string, design: { id: string; nome: string; tipo: "video" | "imagem"; catalogoId: string | null; linguagem: string }): Promise<string> {
  const { efeito } = await aprovarEstiloPeloDesign(projectId, design);
  return efeito;
}
