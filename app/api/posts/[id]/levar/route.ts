// Uma chamada de texto no Opus com o post inteiro na entrada: segundos, nao
// minutos, mas o padrao da plataforma e curto demais para uma geracao.
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { levarParaOutraRede } from "@/lib/pipeline/levar-para-outra-rede";
import { fraseDeSaldoDoMembro } from "@/lib/equipe/conta";

/**
 * Leva um post que ja existe para OUTRA rede, adaptado e como rascunho.
 *
 * Pedido do Bruno em 21/09: "a plataforma deve dar a opcao de publicar em
 * outra rede o post ja publicado". O porque de cada decisao esta em
 * lib/pipeline/levar-para-outra-rede.ts; aqui so entra a autorizacao e a
 * traducao dos desfechos em mensagem de tela.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { accountId, formato } = await req.json();
  if (typeof accountId !== "string" || !accountId) {
    return NextResponse.json({ error: "Escolha a conta de destino." }, { status: 400 });
  }

  const r = await levarParaOutraRede({ postId: id, contaDestinoId: accountId, userId, formato: typeof formato === "string" ? formato : undefined });
  if (r.ok) return NextResponse.json({ post: r.post });

  switch (r.erro) {
    case "sem_conta":
      return NextResponse.json({ error: "Post ou conta nao encontrados neste projeto." }, { status: 404 });
    case "rede_desconhecida":
      return NextResponse.json({ error: "Esta rede ainda nao recebe post levado de outra." }, { status: 400 });
    case "ja_existe":
      // 409 e nao erro de servidor: o pedido esta certo, o trabalho ja foi
      // feito. A tela leva a pessoa para a peca que ja existe.
      return NextResponse.json({ error: "Este post ja foi levado para essa conta.", postId: r.postId }, { status: 409 });
    case "sem_saldo":
      return NextResponse.json(
        {
          // Membro da equipe (01/10, acabamento): a frase diz a quem pedir, pelo nome.
          error:
            r.mensagem ??
            (await fraseDeSaldoDoMembro(userId, { necessario: r.necessario, disponivel: r.disponivel })) ??
            `Faltam creditos: a adaptacao custa ${r.necessario} e voce tem ${r.disponivel}.`,
          necessario: r.necessario,
          disponivel: r.disponivel,
        },
        { status: 402 }
      );
    case "texto_recusado":
      return NextResponse.json({ error: `O texto adaptado nao passou na guarda: ${r.motivo}` }, { status: 422 });
  }
}
