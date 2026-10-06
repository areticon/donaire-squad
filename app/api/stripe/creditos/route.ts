export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@/lib/auth/server";
import { pacoteDeCredito, pacotesNaTela } from "@/lib/credits/pacotes-de-credito";
import { abrirCheckoutDoPacote, elegibilidadeDoPacote, PacoteSemPreco } from "@/lib/credits/pacotes-de-credito-servidor";

/**
 * OS PACOTES DE CRÉDITO AVULSOS (06/10): a lista com quem pode comprar (GET) e
 * o checkout do Stripe em modo pagamento único (POST).
 *
 * O crédito NÃO é lançado aqui. Quem lança é o webhook, quando o Stripe
 * confirma o pagamento: creditar na volta da tela seria creditar em quem abriu
 * o checkout e não pagou.
 *
 * Erros: o cliente recebe uma frase e um código (CRD-PAC) para o chamado; o
 * detalhe de configuração (price ausente, valor divergente) fica no log.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ pacotes: pacotesNaTela(), elegibilidade: await elegibilidadeDoPacote(userId) });
  } catch (err) {
    console.error("[stripe/creditos] elegibilidade", err);
    return NextResponse.json({
      pacotes: pacotesNaTela(),
      elegibilidade: { pode: false, motivo: "pendente", frase: "Não consegui conferir a sua assinatura agora. Tente de novo em instantes." },
    });
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { pacoteId } = (await req.json().catch(() => ({}))) as { pacoteId?: string };
    const pacote = pacoteDeCredito(String(pacoteId ?? ""));
    if (!pacote) return NextResponse.json({ error: "Pacote inválido." }, { status: 400 });

    // A mesma regra da tela, de novo no servidor: o botão escondido não é trava.
    const pode = await elegibilidadeDoPacote(userId);
    if (!pode.pode) return NextResponse.json({ error: pode.frase, motivo: pode.motivo }, { status: 403 });

    const user = await currentUser();
    const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://demandou.com").replace(/\/$/, "");
    const url = await abrirCheckoutDoPacote({ userId, email: user?.email ?? null, pacote, base });
    return NextResponse.json({ url });
  } catch (err) {
    console.error(err instanceof PacoteSemPreco ? "[stripe/creditos] configuração:" : "[stripe/creditos] checkout falhou:", err);
    return NextResponse.json(
      { error: "Não consegui abrir o pagamento agora. Tente de novo em alguns minutos; se continuar, abra um chamado com o código CRD-PAC.", codigo: "CRD-PAC" },
      { status: 500 }
    );
  }
}
