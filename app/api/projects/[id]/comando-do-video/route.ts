import { auth } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { normalizarComando } from "@/lib/media/editor-por-comando/comando";
import { editorPorComandoLigado, lerComandoDoProjeto, paletaDoProjeto, salvarComandoDoProjeto } from "@/lib/media/editor-por-comando";
import { coresDaMarca } from "@/lib/media/capa-composta";
import { ligarCatalogoAoProjeto, registrarPedidoDeDesign, type ResultadoDoPedido } from "@/lib/biblioteca-de-design/registro";
import type { DesignDaGaleria } from "@/lib/biblioteca-de-design/tipos";

/**
 * O COMANDO DO VÍDEO (05/10/2026): a tela pergunta se o editor por comando
 * está ligado (EDITOR_POR_COMANDO=1) e lê o comando guardado; o PUT grava só
 * a chave `comandoDoVideo` dentro de `projects.config`.
 *
 * 06/10, A BIBLIOTECA DE DESIGN: o comando escrito (ou falado, ou montado
 * pelo ajudante) é um pedido de design. Depois de gravar, o pedido entra na
 * biblioteca (o JEV compara com o que existe; o Claude escreve a ficha quando
 * é novo ou variação) e fica ligado ao projeto. A miniatura clicada sem
 * edição liga a semente daquele estilo. A biblioteca nunca impede o salvar:
 * se falhar, o comando fica gravado e `biblioteca` vem nulo.
 */
/** O pedido passa pelo JEV e pelo redator: até um minuto além do salvar. */
export const maxDuration = 120;

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
  // A biblioteca de design (06/10): a miniatura clicada liga a semente do estilo; o texto do cliente vira um pedido (JEV compara, Claude escreve).
  let biblioteca: { design: DesignDaGaleria; veredito: ResultadoDoPedido["veredito"] | "catalogo" } | null = null;
  try {
    const { userId } = await auth();
    if (comando.origem === "referencia" && comando.referencia) {
      const d = await ligarCatalogoAoProjeto({ projectId: id, tipo: "video", catalogoId: comando.referencia, comoEntrou: "referencia" });
      biblioteca = d ? { design: d, veredito: "catalogo" } : null;
    } else if (userId) {
      biblioteca = await registrarPedidoDeDesign({ projectId: id, userId, tipo: "video", pedido: comando.texto, nicho: r.project.niche, publico: r.project.targetAudience });
    }
  } catch (e) {
    console.warn("[comando-do-video] o pedido não entrou na biblioteca (o comando ficou salvo):", e instanceof Error ? e.message.slice(0, 160) : e);
  }
  return NextResponse.json({ ok: true, comando, biblioteca });
}
