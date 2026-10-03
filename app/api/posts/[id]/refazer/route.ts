import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { refazerPeca } from "@/lib/pipeline/refazer-peca";
import { fraseDeSaldoDoMembro } from "@/lib/equipe/conta";

/**
 * REFAZER UMA PEÇA (21/09).
 *
 * Trezentos segundos porque o trabalho é o mesmo do chat do card: uma redação
 * no Opus e, quando a peça tem arte, uma geração de imagem com até três
 * tentativas do revisor visual. O teto padrão da plataforma mataria a função
 * no meio da segunda tentativa, e o cliente pagaria por uma arte que nunca
 * chegou.
 */
export const maxDuration = 300;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const corpo = await req.json().catch(() => ({}));
  const instrucao = typeof corpo?.instrucao === "string" ? corpo.instrucao.trim() : undefined;

  const r = await refazerPeca({ postId: id, userId, instrucao: instrucao || undefined });

  if (r.ok) {
    return NextResponse.json({
      post: r.post,
      custo: r.custo,
      arteRefeita: r.arteRefeita,
    });
  }

  /**
   * CADA RECUSA DIZ O QUE FAZER, e não só o que deu errado.
   *
   * A falta de saldo vira convite, com o número que falta, que é a régua que o
   * Bruno pediu em 21/09: "o usuário precisa querer tanto gerar aquilo que vai
   * colocar mais crédito".
   */
  switch (r.erro) {
    case "nao_encontrado":
      return NextResponse.json({ error: "Peça não encontrada." }, { status: 404 });
    case "ja_publicado":
      return NextResponse.json(
        { error: "Esta peça já foi publicada e não pode ser refeita. Arquive e gere outra se quiser trocar o que está no ar." },
        { status: 409 }
      );
    case "rede_desconhecida":
      return NextResponse.json({ error: "Não sei escrever para esta rede ainda." }, { status: 400 });
    case "sem_saldo":
      return NextResponse.json(
        {
          // Membro da equipe (01/10, acabamento) não compra: a frase diz a quem pedir.
          error:
            r.mensagem ??
            (await fraseDeSaldoDoMembro(userId, { necessario: r.necessario, disponivel: r.disponivel })) ??
            `Faltam ${r.necessario - r.disponivel} créditos para refazer esta peça (custa ${r.necessario}, você tem ${r.disponivel}). Compre um pacote para refazer agora.`,
          necessario: r.necessario,
          disponivel: r.disponivel,
        },
        { status: 402 }
      );
    case "texto_recusado":
      return NextResponse.json(
        { error: `O texto voltou como bastidor (${r.motivo}) e eu não gravo isso na peça. Tente de novo, e nada foi cobrado.` },
        { status: 422 }
      );
  }
}
