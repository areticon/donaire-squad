export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto, fraseDeSaldoDoMembro } from "@/lib/equipe/conta";
import { askClaude } from "@/lib/claude";
import { debitar, saldo, SaldoInsuficiente } from "@/lib/credits";
import { CREDIT_COSTS } from "@/lib/stripe";
import { NOME_DA_REDE } from "@/lib/pipeline/redes";
import { pecaPublicavel } from "@/lib/pipeline/guarda-de-texto";
import { ROTULO_DO_CAMPO, limparHashtags, type CampoDoTexto } from "@/lib/posts/campos-do-texto";

/**
 * "PEDIR PARA A IA REESCREVER" UM CAMPO DO TEXTO (03/10, pedido do Bruno).
 *
 * Reescreve UM campo (título, descrição, legenda ou hashtags) de um post, com
 * a instrução opcional do cliente ("mais curto", "sem pergunta no fim"). NÃO
 * grava: devolve a sugestão para o campo, e quem salva é o cliente, depois de
 * ler. Gravar direto seria a IA decidindo o que vai ao ar.
 *
 * Cobra o mesmo que um texto de rede (`post_text`), porque é a mesma chamada
 * de redator; o custo vai no botão antes do clique.
 */
const CAMPOS: CampoDoTexto[] = ["titulo", "descricao", "legenda", "hashtags"];

const REGRA_DO_CAMPO: Record<CampoDoTexto, string> = {
  titulo: "um título de YouTube de até 90 caracteres, numa linha só, que diga do que o vídeo trata e dê vontade de clicar sem prometer o que o vídeo não entrega",
  descricao: "a descrição do vídeo no YouTube: primeiro parágrafo que resume o vídeo, depois os pontos principais; mantenha capítulos (linhas com 0:00) e links exatamente como estão",
  legenda: "a legenda do post para a rede, com gancho na primeira linha e o mesmo conteúdo; mantenha links, números e fontes exatamente como estão",
  hashtags: "de 3 a 6 hashtags relevantes para o tema, em português, separadas por espaço, sem frase nenhuma",
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { campo?: unknown; texto?: unknown; instrucao?: unknown; contexto?: unknown };
  const campo = CAMPOS.find((c) => c === body.campo);
  if (!campo) return NextResponse.json({ error: "Campo desconhecido." }, { status: 400 });
  const texto = typeof body.texto === "string" ? body.texto.slice(0, 8000) : "";
  const instrucao = typeof body.instrucao === "string" ? body.instrucao.trim().slice(0, 500) : "";
  const contexto = typeof body.contexto === "string" ? body.contexto.slice(0, 6000) : "";

  const post = await prisma.post.findUnique({
    where: { id },
    include: { project: { select: { id: true, userId: true, name: true, niche: true, voice: true, targetAudience: true } } },
  });
  if (!post || !(await podeUsarProjeto(userId, post.project))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const custo = CREDIT_COSTS.post_text;
  const disponivel = await saldo(userId);
  if (disponivel < custo) {
    return NextResponse.json(
      { error: (await fraseDeSaldoDoMembro(userId, { necessario: custo, disponivel })) ?? `Faltam créditos: a reescrita custa ${custo} e você tem ${disponivel}.` },
      { status: 402 }
    );
  }

  const rede = NOME_DA_REDE[post.platform] ?? post.platform;
  const bruto = await askClaude(
    "Você é o redator do squad. Reescreve UM campo de uma peça já pronta, na voz da marca, sem inventar fatos, números, fontes ou promessas. Nunca use travessão (o traço longo): use vírgula, dois-pontos, ponto e vírgula ou parênteses. Devolva SÓ o texto do campo, sem aspas, sem rótulo e sem comentário.",
    `Marca: ${post.project.name}${post.project.niche ? `, nicho ${post.project.niche}` : ""}${post.project.targetAudience ? `, público ${post.project.targetAudience}` : ""}.
${post.project.voice ? `Voz da marca: ${post.project.voice.slice(0, 1500)}\n` : ""}Rede: ${rede}.
Campo: ${ROTULO_DO_CAMPO[campo]}. Escreva ${REGRA_DO_CAMPO[campo]}.
${instrucao ? `Pedido do cliente para esta reescrita: ${instrucao}\n` : ""}
TEXTO ATUAL DO CAMPO:
${texto || "(vazio)"}
${contexto ? `\nO RESTO DA PEÇA, para contexto (não reescreva):\n${contexto}` : ""}`,
    { usage: { projectId: post.projectId, operation: "reescrever_campo" }, maxTokens: 4000 }
  );

  const limpo = pecaPublicavel(bruto);
  if ("recusado" in limpo) return NextResponse.json({ error: `A reescrita não passou na guarda: ${limpo.recusado}` }, { status: 422 });
  let novo = limpo.texto.replace(/\s*—\s*/g, ", ").replace(/^["“]|["”]$/g, "").trim();
  if (campo === "titulo") novo = novo.split("\n")[0].trim().slice(0, 100);
  if (campo === "hashtags") novo = limparHashtags(novo);
  if (!novo) return NextResponse.json({ error: "A IA devolveu um texto vazio. Tente de novo." }, { status: 502 });

  try {
    await debitar({
      userId,
      quantidade: custo,
      operation: "reescrever_campo",
      projectId: post.projectId,
      refId: `${post.id}:${campo}:${Date.now()}`,
      note: `${ROTULO_DO_CAMPO[campo]} reescrito (${rede})`,
    });
  } catch (e) {
    if (e instanceof SaldoInsuficiente) return NextResponse.json({ error: e.message }, { status: 402 });
    throw e;
  }
  return NextResponse.json({ texto: novo, custo });
}
