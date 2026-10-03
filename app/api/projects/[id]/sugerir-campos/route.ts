export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";
import { projetoVisivel } from "@/lib/equipe/conta";
import { soODono } from "@/lib/equipe/permissoes";

/**
 * Os campos do projeto, derivados dos DOCUMENTOS que a pessoa subiu.
 *
 * Nasceu em 17/09 de uma observacao do Bruno ao criar um projeto de verdade: a
 * plataforma pedia voz, nicho e publico ANTES de deixar ele subir o documento
 * que responde as tres coisas. Pior, o botao "Preencher com IA" que ja existia
 * mandava para o modelo o proprio formulario vazio (`context: form`), entao ele
 * **adivinhava** em vez de ler.
 *
 * **Adivinhar e ler sao coisas diferentes, e o produto so tinha a primeira.**
 * Esta rota e a segunda: le o que ja foi compilado dos PDFs do projeto
 * (`ProjectContext.compiled`) e devolve os campos preenchidos a partir dali.
 *
 * Nao inventa: o prompt manda deixar em branco o que o documento nao disser. Um
 * campo vazio que a pessoa preenche e honesto; um campo inventado que parece
 * vindo do documento dela e pior que campo vazio, porque ela confia e nao le.
 */

const CAMPOS = ["name", "description", "niche", "targetAudience", "voice", "references"] as const;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const projeto = await prisma.project.findFirst({
    where: { id, ...projetoVisivel(userId) },
    select: {
      name: true,
      userId: true,
      contexts: {
        select: { type: true, title: true, compiled: true, status: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!projeto) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Preenche campos do setup, que é do dono (01/10, acabamento).
  const recusa = await soODono(userId, projeto, "usar o setup deste projeto");
  if (recusa) return recusa;

  const comTexto = projeto.contexts.filter(
    (c) => c.status === "pronto" && (c.compiled ?? "").trim().length > 40
  );
  if (comTexto.length === 0) {
    // Documento subido mas ainda nao lido tem o mesmo aspecto de documento
    // nenhum, e a tela precisa distinguir os dois para nao dizer "sem
    // documento" a quem acabou de subir um.
    //
    // Em 18/09 apareceu o TERCEIRO caso, que ate entao se disfarcava de
    // segundo: documento que FALHOU. Quem subiu um PDF e viu "estou lendo os
    // seus documentos" para sempre nao tinha como saber que nao havia mais nada
    // acontecendo. Esperar e consertar sao acoes diferentes, e so o motivo
    // certo escolhe entre as duas.
    const falhados = projeto.contexts.filter((c) => c.status === "falhou").length;
    const lendo = projeto.contexts.filter((c) => c.status === "lendo").length;
    return NextResponse.json({
      pronto: false,
      documentos: projeto.contexts.length,
      motivo: lendo > 0 ? "lendo" : falhados > 0 ? "falhou" : "sem_documento",
      falhados,
    });
  }

  const dossie = comTexto
    .map((c) => `## ${c.title} (${c.type})\n\n${c.compiled}`)
    .join("\n\n---\n\n");

  // ESTE PROMPT ESTAVA ESCRITO SEM ACENTO, E ISSO SAIA NA TELA DO CLIENTE.
  //
  // Medido em 18/09 com o documento real do banco, rodando o mesmo modelo duas
  // vezes, mudando só a acentuação do prompt:
  //
  //   o documento (o insumo)        3,69% das letras acentuadas
  //   saída com o prompt sem acento 0,09%
  //   saída com o prompt acentuado  3,64%
  //
  // **O modelo espelha o registro ortográfico de quem fala com ele.** Pedir
  // "Escreva em portugues do Brasil" numa frase que ela mesma não tem acento
  // ensina o contrário do que a frase diz, e a instrução perde para o exemplo.
  //
  // Não é preciosismo de escrita: o cliente lê esse texto no cadastro do projeto
  // dele, e ele vira a voz que os agentes usam em toda campanha. Texto sem
  // acento na tela de um produto brasileiro parece defeito, porque é.
  const bruto = await askClaude(
    `Você prepara o cadastro de um projeto de conteúdo a partir dos documentos de marca que o próprio cliente enviou. Responda SOMENTE um objeto JSON válido, sem markdown e sem texto fora dele.`,
    `Leia os documentos abaixo e preencha os campos do projeto.

Campos, e o que cada um significa:
- "name": o nome da marca ou da pessoa, curto.
- "description": uma frase dizendo o que a marca faz.
- "niche": o setor ou território em que ela atua.
- "targetAudience": para quem ela fala, concreto.
- "voice": como ela escreve. Tom, pessoa do discurso, o que evitar. De 3 a 6 linhas.
- "references": autores, obras, veículos ou contas que servem de referência, se o documento citar.

REGRAS:
- Use APENAS o que está nos documentos. Não complete com conhecimento próprio.
- Se o documento não disser algo, devolva string vazia naquele campo.
- Preserve nomes, números e termos exatamente como aparecem.
- Escreva em português do Brasil, com a acentuação correta de todas as palavras.
- Não use travessão.

Documentos:

${dossie}`,
    {
      maxTokens: 4000,
      usage: { operation: "sugerir_campos", runId: "", agentId: "contexto", projectId: id },
    }
  );

  // O modelo desobedece formato de vez em quando (licao de 18/08): extrai o
  // primeiro bloco {...} e valida em codigo, em vez de confiar no formato.
  const bloco = bruto.match(/\{[\s\S]*\}/)?.[0];
  if (!bloco) {
    return NextResponse.json({ error: "Nao consegui ler os documentos." }, { status: 502 });
  }

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(bloco) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Nao consegui ler os documentos." }, { status: 502 });
  }

  const campos: Record<string, string> = {};
  for (const campo of CAMPOS) {
    const valor = obj[campo];
    if (typeof valor === "string" && valor.trim().length > 0) campos[campo] = valor.trim();
  }

  return NextResponse.json({
    pronto: true,
    campos,
    documentos: comTexto.map((c) => c.title),
  });
}
