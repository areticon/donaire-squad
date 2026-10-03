export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { del } from "@vercel/blob";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { askClaudeComPdf } from "@/lib/claude";
import { lerMidia } from "@/lib/media/storage";
import { projetoVisivel } from "@/lib/equipe/conta";
import { soODono } from "@/lib/equipe/permissoes";

/**
 * A marca do projeto: logo, manual e documentos para a IA.
 *
 * Upload pelo navegador direto no Blob (o mesmo desenho da trilha, ver
 * /musica), porque o arquivo nao passa pela funcao e nao esbarra no limite de
 * corpo. O `clientPayload` diz o que e cada arquivo:
 *
 *   { kind: "logo" }
 *   { kind: "manual" }
 *   { kind: "documento", type: "editorial" | "references" | ... , title }
 *
 * O manual e os documentos em PDF viram texto compilado pela IA e entram em
 * ProjectContext, que e o que toda campanha ja le. O logo so fica guardado.
 *
 * Em desenvolvimento o storage nao alcanca o localhost, entao o navegador
 * tambem grava o logo e o manual pelo PATCH do projeto (espelho). A compilacao
 * do PDF, essa nao tem espelho: em desenvolvimento ela simplesmente nao roda.
 */

const MAX_LOGO = 5 * 1024 * 1024;
const MAX_PDF = 20 * 1024 * 1024;
const TIPOS_DE_LOGO = ["image/png", "image/svg+xml", "image/jpeg", "image/webp"];
const TIPOS_DE_PDF = ["application/pdf"];

const TIPOS_DE_CONTEXTO = new Set(["brand", "business", "editorial", "references", "regulations", "examples"]);

const ROTULO: Record<string, string> = {
  brand: "Manual de Marca",
  business: "Contexto do Negocio",
  editorial: "Linha Editorial",
  references: "Referencias",
  regulations: "Regulamentacoes",
  examples: "Exemplos de Posts",
};

type Payload = { projectId: string; kind: "logo" | "manual" | "documento"; type?: string; title?: string };

async function compilarPdf(projectId: string, url: string, type: string, title: string) {
  // `lerMidia` e nao `fetch(url)`, e a diferenca decidia se o documento existia.
  //
  // MEDIDO EM 18/09, com os dois PDFs que o Bruno subiu em 17/09 ainda no
  // storage: `fetch(url)` numa URL do store PRIVADO devolve 403, porque a
  // requisicao crua nao manda credencial nenhuma. A funcao lancava, o
  // onUploadCompleted morria antes do `create`, e **nenhum ProjectContext era
  // gravado, nunca, desde que a etapa Marca existe**. O arquivo subia e sumia.
  //
  // Era o MESMO mecanismo do logo (parte 126), no mesmo arquivo, no caminho ao
  // lado: URL privada nao serve quem nao manda token. E a armadilha dentro da
  // armadilha se repetiu igual: `head().downloadUrl` tambem devolve 403. Quem
  // sabe ler os dois stores e `lerMidia`.
  //
  // O custo disso nao era so o documento perdido: o "Preencher com IA" da parte
  // 125 le `ProjectContext.compiled`, e nunca houve nenhum para ler.
  const arquivo = await lerMidia(url);
  if (!arquivo) throw new Error("nao consegui baixar o PDF do storage");
  const base64 = arquivo.toString("base64");

  // O prompt em português de verdade, e o porquê está em sugerir-campos: medido
  // em 18/09, prompt sem acento derruba a acentuação da saída. Aqui a conta é
  // dobrada, porque este texto compilado é o INSUMO de sugerir-campos e de toda
  // campanha: um documento compilado sem acento contamina tudo que vier depois.
  const compiled = await askClaudeComPdf(
    `Você organiza documentos de marca para uma equipe de redatores de IA. Devolva markdown limpo, em português do Brasil, com acentuação correta, sem comentários seus.`,
    `Tipo de documento: ${ROTULO[type] ?? type}.
Leia o PDF inteiro e transforme em um documento markdown estruturado com o que um redator precisa saber para escrever no nome desta marca: identidade, tom de voz, cores e tipografia (se houver), o que fazer, o que nunca fazer, termos e nomes próprios, exemplos. Preserve números e nomes exatamente como estão. Não invente nada que não esteja no PDF.`,
    base64,
    { maxTokens: 8192, usage: { operation: "contexto_pdf", runId: "", agentId: "contexto", projectId } }
  );

  return compiled;
}

/**
 * Registra o documento e manda ler, nesta ordem.
 *
 * A LINHA NASCE ANTES DA LEITURA, e isso e o conserto de 18/09. Ate aqui ela
 * so era criada DEPOIS da compilacao, entao qualquer falha no meio apagava o
 * documento da existencia: o arquivo ficava no storage e a pessoa ficava sem
 * nada na tela, ou pior, com um rotulo verde que a propria tela tinha inventado.
 *
 * Com a linha criada primeiro, um upload que falha vira um documento com estado
 * "falhou" e um motivo escrito, que a pessoa VE e pode apagar. **Falha visivel e
 * um estado do produto; falha invisivel e so ausencia**, e ausencia nao se
 * conserta porque ninguem sabe que ela existe.
 */
async function registrarECompilar(projectId: string, url: string, type: string, title: string) {
  const doc = await prisma.projectContext.create({
    data: {
      projectId,
      type,
      title,
      rawInput: `[PDF] ${title}\n${url}`,
      compiled: "",
      status: "lendo",
    },
  });

  try {
    const compiled = await compilarPdf(projectId, url, type, title);
    return prisma.projectContext.update({
      where: { id: doc.id },
      data: { compiled, status: "pronto", erro: null },
    });
  } catch (err) {
    const motivo = err instanceof Error ? err.message : "falha ao ler o PDF";
    console.error(`[marca] nao consegui compilar ${title} do projeto ${projectId}:`, err);
    return prisma.projectContext.update({
      where: { id: doc.id },
      data: { status: "falhou", erro: motivo },
    });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const body = (await req.json()) as HandleUploadBody;
  // A recusa de membro sai como 403 com a frase, e não como o 400 genérico do
  // upload: o token é pedido dentro do handleUpload, que só sabe lançar erro.
  let recusa: NextResponse | null = null;

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const { userId } = await auth();
        if (!userId) throw new Error("Nao autenticado");
        const project = await prisma.project.findFirst({ where: { id, ...projetoVisivel(userId) }, select: { id: true, userId: true } });
        if (!project) throw new Error("Projeto nao encontrado");
        // Logo, manual e documentos são da marca: só o dono sobe (01/10).
        recusa = await soODono(userId, project, "mudar o logo e os documentos da marca");
        if (recusa) throw new Error("so_o_dono");

        const pedido = JSON.parse(clientPayload ?? "{}") as Partial<Payload>;
        const kind = pedido.kind ?? "logo";
        if (kind === "documento" && !TIPOS_DE_CONTEXTO.has(pedido.type ?? "")) {
          throw new Error("Tipo de documento invalido");
        }
        const ehLogo = kind === "logo";
        return {
          allowedContentTypes: ehLogo ? TIPOS_DE_LOGO : TIPOS_DE_PDF,
          maximumSizeInBytes: ehLogo ? MAX_LOGO : MAX_PDF,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ projectId: id, kind, type: pedido.type, title: pedido.title } satisfies Payload),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const p = JSON.parse(tokenPayload ?? "{}") as Payload;
        const nome = blob.pathname.split("/").pop() ?? "arquivo";
        if (p.kind === "logo") {
          await prisma.project.update({ where: { id: p.projectId }, data: { logoUrl: blob.url } });
          return;
        }
        if (p.kind === "manual") {
          await prisma.project.update({
            where: { id: p.projectId },
            data: { brandManualUrl: blob.url, brandManualName: nome },
          });
          await registrarECompilar(p.projectId, blob.url, "brand", p.title ?? nome);
          return;
        }
        await registrarECompilar(p.projectId, blob.url, p.type ?? "references", p.title ?? nome);
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    // O cast é porque o TypeScript não enxerga a atribuição dentro do callback.
    const recusou = recusa as NextResponse | null;
    if (recusou) return recusou;
    const message = err instanceof Error ? err.message : "Falha no upload";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** Tira o logo ou o manual. `?o=logo` ou `?o=manual`. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const project = await prisma.project.findFirst({
    where: { id, ...projetoVisivel(userId) },
    select: { logoUrl: true, brandManualUrl: true, userId: true },
  });
  if (!project) return NextResponse.json({ error: "Projeto nao encontrado" }, { status: 404 });
  const recusa = await soODono(userId, project, "mudar o logo e os documentos da marca");
  if (recusa) return recusa;

  const o = req.nextUrl.searchParams.get("o");
  if (o === "logo") {
    if (project.logoUrl) await del(project.logoUrl).catch(() => undefined);
    await prisma.project.update({ where: { id }, data: { logoUrl: null } });
  } else if (o === "manual") {
    if (project.brandManualUrl) await del(project.brandManualUrl).catch(() => undefined);
    await prisma.project.update({ where: { id }, data: { brandManualUrl: null, brandManualName: null } });
  } else {
    return NextResponse.json({ error: "o=logo ou o=manual" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
