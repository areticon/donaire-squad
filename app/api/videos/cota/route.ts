import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { cotaDeVideoDoDia, cotaDeVideoDoCliente } from "@/lib/media/cota-do-dia-servidor";
import { limiteDoTeste } from "@/lib/limites-do-plano";

/**
 * QUANTOS VIDEOS AINDA CABEM HOJE, para a janela dizer ANTES.
 *
 * O limite do gerador e por DIA e vale para a plataforma inteira, entao esta
 * conta nao e do projeto de quem pergunta: e a mesma para todos. Ela nao expoe
 * fornecedor nem conta, so quantos clipes cabem e quando o contador zera, que
 * e o que o cliente precisa para escolher a duracao.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // As DUAS contas, porque sao de donos diferentes: a do fornecedor vale para
  // a plataforma inteira, a do plano vale so para quem pergunta. A janela
  // precisa das duas para saber qual e o teto que morde primeiro.
  // E o TESTE, que e uma terceira conta e vem junto pelo mesmo motivo: a
  // janela precisa oferecer so o que cabe, em vez de deixar o cliente escolher
  // e levar um nao do servidor depois do clique.
  const [cota, doCliente, teste] = await Promise.all([
    cotaDeVideoDoDia(),
    cotaDeVideoDoCliente(userId),
    limiteDoTeste(userId),
  ]);
  return NextResponse.json({ ...cota, doCliente, teste });
}
