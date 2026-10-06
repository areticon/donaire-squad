export const dynamic = "force-dynamic";
/** O pedido passa pelo JEV e pelo redator: até um minuto. */
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { soODono } from "@/lib/equipe/permissoes";
import { designsDoProjeto, lerDesign, ligarAoProjeto, registrarPedidoDeDesign } from "@/lib/biblioteca-de-design/registro";
import { tipoValido } from "@/lib/biblioteca-de-design/tipos";
import { lerModelosEscolhidos, salvarModelosEscolhidos } from "@/lib/modelos-de-arte/escolha";
import { salvarIdentidadeVisual } from "@/lib/modelos-de-arte/identidade-aprovada";
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
 *   antes). Imagem de semente: o modelo do book entra nos escolhidos (e a
 *   identidade precisa ser aprovada de novo, como sempre). Imagem feita por
 *   cliente: só fica ligada ao projeto; a esteira ainda não desenha modelo de
 *   imagem fora do book (pendência registrada no HANDOFF).
 * Só o dono muda, como a direção visual.
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
  const corpo = (await req.json().catch(() => ({}))) as { tipo?: unknown; pedido?: unknown };
  if (!tipoValido(corpo.tipo)) return NextResponse.json({ error: "Diga se o design é de vídeo ou de imagem." }, { status: 400 });
  const pedido = typeof corpo.pedido === "string" ? corpo.pedido.trim() : "";
  if (pedido.length < 12) return NextResponse.json({ error: "Descreva o design com mais detalhes (pelo menos uma frase)." }, { status: 400 });
  try {
    const resultado = await registrarPedidoDeDesign({ projectId: id, userId: r.userId, tipo: corpo.tipo, pedido, nicho: r.project.niche, publico: r.project.targetAudience });
    if (!resultado) return NextResponse.json({ error: "Não consegui registrar o pedido." }, { status: 400 });
    if (corpo.tipo === "video") {
      const atual = await lerComandoDoProjeto(id);
      await salvarComandoDoProjeto(id, { texto: resultado.design.pedidoOriginal, fonte: atual?.fonte ?? "geist", cores: atual?.cores ?? { tipo: "marca" }, origem: "escrito", referencia: null });
    }
    return NextResponse.json(resultado);
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
  const design = typeof corpo.designId === "string" ? await lerDesign(corpo.designId).catch(() => null) : null;
  if (!design) return NextResponse.json({ error: "Esse design não existe mais na biblioteca." }, { status: 404 });
  try {
    await ligarAoProjeto({ projectId: id, designId: design.id, tipo: design.tipo, comoEntrou: "escolhido" });
    let efeito = "Design ligado ao projeto.";
    if (design.tipo === "video") {
      const atual = await lerComandoDoProjeto(id);
      await salvarComandoDoProjeto(id, { texto: design.pedidoOriginal, fonte: atual?.fonte ?? "geist", cores: atual?.cores ?? { tipo: "marca" }, origem: design.catalogoId ? "referencia" : "escrito", referencia: design.catalogoId });
      efeito = "O comando do vídeo passou a ser este design. Vale para os próximos cortes.";
    } else if (design.catalogoId) {
      const escolha = await lerModelosEscolhidos(id);
      const ids = escolha?.ids ?? [];
      if (!ids.includes(design.catalogoId)) {
        await salvarModelosEscolhidos(id, [...ids, design.catalogoId]);
        await salvarIdentidadeVisual(id, { modelosMudaram: true });
        efeito = "O modelo entrou nos seus modelos de arte. Aprove a identidade de novo em Modelos para as artes saírem nele.";
      } else {
        efeito = "Este modelo já estava entre os seus modelos de arte.";
      }
    } else {
      efeito = "Design ligado ao projeto. A esteira de artes ainda desenha só os modelos do book; este entra quando o modelo por prompt do cliente for ligado.";
    }
    return NextResponse.json({ ok: true, design: { ...design, doProjeto: true }, efeito });
  } catch (e) {
    console.error("[biblioteca-de-design] escolher:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Não consegui ligar o design ao projeto." }, { status: 500 });
  }
}
