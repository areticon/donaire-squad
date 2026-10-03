import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { soODono } from "@/lib/equipe/permissoes";
import { prisma } from "@/lib/db/prisma";
import {
  lerEstiloDoCliente,
  salvarEstiloDoCliente,
  apagarEstiloDoCliente,
  sugerirEstiloDoCliente,
} from "@/lib/media/estilo-do-cliente";
import { linguagemDasArtes } from "@/lib/media/direcao-de-arte";

/**
 * A DIREÇÃO VISUAL própria do cliente (as artes e os vídeos por IA das
 * campanhas). Ver lib/media/estilo-do-cliente.ts.
 *
 * GET lê; POST com { acao: "sugerir", rascunho } pede à IA uma primeira versão
 * sem salvar; POST com { descricao, prompt } salva; DELETE apaga.
 *
 * RECONSTRUÍDA em 29/09 a partir do build de 27/09: esta rota vivia fora do
 * git e foi sobrescrita por engano por outra rota de mesmo nome (o estilo de
 * EDIÇÃO de vídeo, que agora mora em /estilo-de-edicao). O comportamento é o
 * mesmo do código compilado, linha a linha.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function doDono(projectId: string, userId: string) {
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, userId: true } });
  // Dono ou membro da equipe com o projeto liberado (01/10).
  return p && (await podeUsarProjeto(userId, p)) ? p : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await doDono(id, userId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // `linguagem` entrou em 30/09 (item 10): a linguagem do catalogo de edicao
  // manda nas artes, e a janela precisa dizer isso ao lado da direcao propria,
  // que passou a refina-la em vez de substitui-la.
  const [estilo, linguagem] = await Promise.all([lerEstiloDoCliente(id), linguagemDasArtes(id)]);
  return NextResponse.json({ estilo, linguagem });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const p = await doDono(id, userId);
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // A direção visual vale para todas as artes da marca: só o dono muda (01/10,
  // acabamento). O membro gera campanha com a direção que já existe.
  const recusa = await soODono(userId, p, "mudar a direção visual da marca");
  if (recusa) return recusa;

  const corpo = (await req.json()) as { acao?: string; rascunho?: unknown; descricao?: unknown; prompt?: unknown };
  if (corpo?.acao === "sugerir") {
    try {
      const sugestao = await sugerirEstiloDoCliente({
        projectId: id,
        rascunho: typeof corpo.rascunho === "string" ? corpo.rascunho : undefined,
      });
      return NextResponse.json(sugestao);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Não consegui sugerir a direção visual." },
        { status: 502 }
      );
    }
  }

  const descricao = typeof corpo?.descricao === "string" ? corpo.descricao : "";
  const prompt = typeof corpo?.prompt === "string" ? corpo.prompt : "";
  if (!descricao.trim() || !prompt.trim()) {
    return NextResponse.json({ error: "Escreva a direção visual antes de salvar." }, { status: 400 });
  }
  const estilo = await salvarEstiloDoCliente(id, { descricao, prompt });
  return NextResponse.json({ estilo });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const p = await doDono(id, userId);
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const recusa = await soODono(userId, p, "mudar a direção visual da marca");
  if (recusa) return recusa;
  await apagarEstiloDoCliente(id);
  return NextResponse.json({ ok: true });
}
