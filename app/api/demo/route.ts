export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";
import { verificarLimite } from "@/lib/demo/rate-limit";

const MAX_ENTRADA = 1200; // caracteres

const SISTEMA = `Você é o squad da Demandou fazendo uma demonstração pública.

Recebe matéria-prima crua: alguém escreveu do jeito que falaria, sem edição.
Sua tarefa é transformar isso em conteúdo publicável para três redes, mantendo
a voz da pessoa.

Regras que não se quebram:
- Escreva na voz de quem enviou, não na sua. Se a pessoa é direta, seja direta.
  Se ela usa jargão do setor dela, mantenha o jargão.
- Não invente fato, número, cliente ou caso que não esteja no texto recebido.
  Se faltar dado, trabalhe com o que tem.
- Nada de "neste artigo vamos explorar", "no mundo de hoje", "é fundamental
  ressaltar". Frase de abertura que poderia abrir qualquer post está proibida.
- Nunca use travessão. Use vírgula, dois-pontos, ponto e vírgula ou parênteses.
- Português do Brasil.

Formatos:
- linkedin: 900 a 1400 caracteres. Primeira linha é o gancho e precisa segurar
  sozinha, porque é só ela que aparece antes do "ver mais". Quebras curtas.
- x: até 270 caracteres, uma ideia só, sem hashtag.
- instagram: 500 a 800 caracteres, mais pessoal, com uma quebra de linha entre
  cada bloco de ideia.

Responda SOMENTE com um objeto JSON válido, sem cercas de código, no formato:
{"linkedin":"...","x":"...","instagram":"...","observacao":"uma frase dizendo o
que você percebeu da voz da pessoa"}`;

export async function POST(req: NextRequest) {
  const veredito = await verificarLimite(req.headers);
  if (!veredito.ok) {
    return NextResponse.json({ error: veredito.motivo }, { status: veredito.status });
  }

  const body = await req.json().catch(() => ({}));
  const bruto = typeof body.texto === "string" ? body.texto.trim() : "";
  const profissao = typeof body.profissao === "string" ? body.profissao.trim().slice(0, 120) : "";

  if (bruto.length < 40) {
    return NextResponse.json(
      { error: "Escreva um pouco mais, pelo menos umas duas frases. Quanto mais cru, melhor." },
      { status: 400 }
    );
  }

  const texto = bruto.slice(0, MAX_ENTRADA);

  try {
    const resposta = await askClaude(
      SISTEMA,
      `${profissao ? `A pessoa se descreve como: ${profissao}\n\n` : ""}Matéria-prima:\n${texto}`,
      { maxTokens: 2000, usage: { operation: "demo_publica" } }
    );

    // O modelo às vezes embrulha o JSON em cerca de código, mesmo instruído.
    const limpo = resposta.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
    const posts = JSON.parse(limpo) as {
      linkedin: string; x: string; instagram: string; observacao?: string;
    };

    void prisma.demoRun
      .create({ data: { ipHash: veredito.ipHash, input: texto, output: posts } })
      .catch(() => {}); // registro nunca derruba a resposta

    return NextResponse.json({ posts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao gerar";
    void prisma.demoRun
      .create({ data: { ipHash: veredito.ipHash, input: texto, error: message } })
      .catch(() => {});
    return NextResponse.json(
      { error: "Não consegui gerar agora. Tente de novo em alguns segundos." },
      { status: 500 }
    );
  }
}
