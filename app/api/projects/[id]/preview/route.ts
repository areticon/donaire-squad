export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";

/**
 * Prévia do primeiro post, dentro do setup.
 *
 * Existe para tapar o buraco mais caro da jornada: hoje as abas Posts, Gestor
 * de Conteúdo e Analytics só aparecem quando o projeto vira `active`, que é o
 * passo 7 de 7. Ou seja, o produto entrega zero valor até o último passo. Como
 * o teste é de 7 dias e já cobrou o cartão, cada dia parado no meio do setup é
 * risco direto de cancelamento.
 *
 * A partir do passo 2 (Voz e Estilo) já existe nicho, público e tom, que é tudo
 * que a demonstração pública da landing usa. Então dá para provar que funciona
 * ali, cinco passos antes.
 *
 * Não grava nada como post: é prévia, não entrega. O custo é de uma chamada.
 */

const SISTEMA = `Você é o squad da Demandou escrevendo a primeira prévia para um
cliente que ainda está configurando o projeto.

Ele acabou de descrever o nicho, o público e o tom de voz. Sua tarefa é provar,
com um post de verdade, que o squad entendeu.

Regras que não se quebram:
- Escreva no tom que ele descreveu, não no seu.
- Não invente número, cliente, caso ou resultado. Sem dado, trabalhe com ideia.
- Nada de "neste artigo vamos explorar", "no mundo de hoje", "é fundamental
  ressaltar". Abertura que serviria para qualquer post está proibida.
- Nunca use travessão. Use vírgula, dois-pontos, ponto e vírgula ou parênteses.
- Português do Brasil.
- 900 a 1400 caracteres. A primeira linha é o gancho e precisa segurar sozinha,
  porque é só ela que aparece antes do "ver mais".

Responda SOMENTE com JSON válido, sem cercas de código:
{"post":"...","tema":"o tema que você escolheu e por quê, em uma frase"}`;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, userId },
    select: { name: true, niche: true, targetAudience: true, voice: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  }

  if (!project.niche || !project.voice) {
    return NextResponse.json(
      { error: "Preencha o nicho e o tom de voz antes de ver a prévia." },
      { status: 400 }
    );
  }

  try {
    const resposta = await askClaude(
      SISTEMA,
      [
        `Projeto: ${project.name}`,
        `Nicho: ${project.niche}`,
        project.targetAudience ? `Público: ${project.targetAudience}` : "",
        `Tom de voz: ${project.voice}`,
      ]
        .filter(Boolean)
        .join("\n"),
      { maxTokens: 1500, usage: { operation: "preview_setup" } }
    );

    const limpo = resposta
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```$/, "");
    const dados = JSON.parse(limpo) as { post: string; tema?: string };

    return NextResponse.json(dados);
  } catch {
    return NextResponse.json(
      { error: "Não consegui gerar a prévia agora. Tente de novo." },
      { status: 500 }
    );
  }
}
