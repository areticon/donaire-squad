export const dynamic = "force-dynamic";

import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/lib/auth/server";
import { SaldoInsuficiente } from "@/lib/credits";
import { despacharPasso } from "@/lib/media/piloto-do-servidor";
import { aprovarRoteiro, RecusaDoRoteiro } from "@/lib/media/roteiro-da-edicao";

/**
 * APROVAR E GERAR (30/09): cobra a segunda parte e devolve o vídeo à esteira.
 * O corte sai do servidor depois da resposta, como todo passo do piloto.
 *
 * ROTEIRO_NAO_DESPACHAR=1 existe para provar a tela no dev local sem acionar o
 * worker de produção (o piloto do dev chama a URL pública).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const corpo = (await req.json().catch(() => ({}))) as { escolhidos?: number[]; soCompleto?: boolean };
  try {
    // "Aprovar só o vídeo completo" manda `soCompleto: true`: zero cortes, venha o que vier na lista (06/10).
    const r = await aprovarRoteiro(id, userId, Array.isArray(corpo.escolhidos) ? corpo.escolhidos : [], { soCompleto: corpo.soCompleto === true });
    if (process.env.ROTEIRO_NAO_DESPACHAR !== "1") after(() => despacharPasso(id, "cortar"));
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof RecusaDoRoteiro) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof SaldoInsuficiente) return NextResponse.json({ error: e.message }, { status: 402 });
    console.error(`[roteiro/aprovar][${id}]`, e);
    return NextResponse.json({ error: "Não consegui aprovar agora. Nada foi cobrado a mais: tente de novo." }, { status: 500 });
  }
}
