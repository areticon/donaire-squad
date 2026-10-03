import { auth } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";
import { del } from "@vercel/blob";
import { ehPublica, midiaProduzida } from "@/lib/media/storage";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { soODono } from "@/lib/equipe/permissoes";

// GET — list all project contexts
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || !(await podeUsarProjeto(userId, project))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const contexts = await prisma.projectContext.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ contexts });
}

// POST — create a new context (AI compiles rawInput -> markdown)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || !(await podeUsarProjeto(userId, project))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Os documentos da marca valem para a equipe inteira: só o dono muda (01/10).
  const recusa = await soODono(userId, project, "mudar os documentos da marca");
  if (recusa) return recusa;

  const { type, title, rawInput } = await req.json();
  if (!type || !title || !rawInput?.trim()) {
    return NextResponse.json({ error: "type, title and rawInput required" }, { status: 400 });
  }

  // Os mesmos tipos da rota da marca, e os dois PRECISAM concordar: o rotulo
  // entra no prompt de compilacao, entao tipo que existe la e nao existe aqui
  // faz o mesmo documento ser lido de dois jeitos dependendo do caminho por
  // onde entrou. "business" entrou em 17/09 e tinha ficado so do lado de la.
  const TYPE_LABELS: Record<string, string> = {
    brand: "Manual de Marca",
    business: "Contexto do Negócio",
    references: "Referências e Inspirações",
    regulations: "Regulamentações e Compliance",
    editorial: "Linha Editorial",
    examples: "Exemplos de Posts",
  };

  const system = `Você é um especialista em estratégia de conteúdo e branding.
Sua tarefa é transformar informações brutas fornecidas pelo usuário em um documento markdown estruturado, profissional e utilizável como contexto de sistema para agentes de IA que criam conteúdo.

Projeto: ${project.name}
Nicho: ${project.niche ?? "geral"}
Tipo de documento: ${TYPE_LABELS[type] ?? type}

Regras:
- Organize com títulos e subtítulos claros
- Use listas quando adequado
- Preserve todas as informações importantes do input
- Adicione estrutura e clareza sem inventar informações
- Escreva em português com acentuação correta
- O resultado será injetado diretamente no prompt de agentes de IA — seja objetivo e rico em contexto`;

  const compiled = await askClaude(
    system,
    `Transforme o seguinte conteúdo bruto em um documento markdown estruturado:\n\n${rawInput}`,
    { maxTokens: 3000 }
  );

  const context = await prisma.projectContext.create({
    data: { projectId: id, type, title, rawInput, compiled },
  });

  return NextResponse.json({ context });
}

// PATCH — update a context
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;
  const { contextId, rawInput, title } = await req.json();
  if (!contextId) return NextResponse.json({ error: "contextId required" }, { status: 400 });

  const context = await prisma.projectContext.findUnique({ where: { id: contextId } });
  if (!context || context.projectId !== projectId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || !(await podeUsarProjeto(userId, project))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const recusa = await soODono(userId, project, "mudar os documentos da marca");
  if (recusa) return recusa;

  let compiled = context.compiled;
  if (rawInput && rawInput !== context.rawInput) {
    compiled = await askClaude(
      `Transforme em documento markdown estruturado, mantendo todas informações, escrevendo em português:`,
      rawInput,
      { maxTokens: 3000 }
    );
  }

  const updated = await prisma.projectContext.update({
    where: { id: contextId },
    data: { rawInput: rawInput ?? context.rawInput, title: title ?? context.title, compiled },
  });

  return NextResponse.json({ context: updated });
}

// DELETE — remove a context
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;
  const { contextId } = await req.json();

  const context = await prisma.projectContext.findUnique({ where: { id: contextId } });
  if (!context || context.projectId !== projectId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || !(await podeUsarProjeto(userId, project))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const recusa = await soODono(userId, project, "apagar os documentos da marca");
  if (recusa) return recusa;

  await prisma.projectContext.delete({ where: { id: contextId } });

  // O PDF sai junto, e isso e o resto do conserto de 18/09.
  //
  // Ate aqui o DELETE apagava so a linha do banco. O arquivo continuava no
  // storage, sem nada apontando para ele: inalcancavel pela tela, invisivel no
  // relatorio e cobrado todo mes. Medido no mesmo dia: 26,6 GB no storage
  // contra 2 gravacoes vivas no banco, quase tudo orfao pelo mesmo mecanismo.
  //
  // A URL mora no `rawInput`, que os PDFs gravam como "[PDF] titulo\nURL".
  // Documento de texto colado nao tem arquivo e nao casa com o padrao, o que e
  // exatamente o filtro certo: so apaga o que subiu como arquivo.
  await apagarPdfDoStorage(context.rawInput);

  return NextResponse.json({ ok: true });
}

/**
 * Apaga o arquivo que o documento aponta, se ele for nosso.
 *
 * Nunca derruba a remocao: a linha ja saiu do banco e e ela que a pessoa ve.
 * Arquivo orfao e um custo pequeno; erro na cara de quem mandou apagar, depois
 * de o documento ja ter sumido da tela, e a ferramenta parecendo quebrada
 * enquanto faz a coisa certa.
 */
async function apagarPdfDoStorage(rawInput: string) {
  const url = rawInput.match(/https:\/\/\S+\.blob\.vercel-storage\.com\/\S+/)?.[0];
  if (!url) return;
  try {
    // Os documentos e o manual vivem no store PRIVADO de proposito: sao material
    // interno do cliente, lidos pela IA e nunca exibidos. O `ehPublica` cobre o
    // acervo misto que a troca de store de 01/09 deixou.
    const token = ehPublica(url) ? midiaProduzida().token : process.env.BLOB_READ_WRITE_TOKEN;
    await del(url, { token });
  } catch (e) {
    console.error("[projects/context] não consegui apagar o PDF do storage", e);
  }
}
