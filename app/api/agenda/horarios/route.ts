export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { horariosLivres } from "@/lib/agenda/disponibilidade";
import { reuniaoDoToken } from "@/lib/agenda/segredos";
import { extrairIp, hashIp } from "@/lib/demo/rate-limit";

/**
 * OS HORÁRIOS LIVRES PARA O CALENDÁRIO DA DEMONSTRAÇÃO (01/10).
 *
 * Público, porque o calendário aparece antes de qualquer login. Não devolve
 * nada de pessoal: início do horário e o primeiro nome de quem está livre.
 * Limite por IP porque cada chamada pode consultar a agenda Google do time, e
 * a cota da API é nossa.
 *
 * `r` é o token de uma reunião sendo remarcada: o horário antigo dela não
 * pode aparecer como ocupado para ela mesma.
 */

const LIMITE_POR_MINUTO = 30;
const janela = new Map<string, { n: number; desde: number }>();

export async function GET(req: NextRequest) {
  const ip = hashIp(extrairIp(req.headers));
  const agora = Date.now();
  const atual = janela.get(ip);
  if (!atual || agora - atual.desde > 60_000) janela.set(ip, { n: 1, desde: agora });
  else if (atual.n >= LIMITE_POR_MINUTO) return NextResponse.json({ error: "Muitas consultas. Espere um minuto." }, { status: 429 });
  else atual.n += 1;

  const pessoa = req.nextUrl.searchParams.get("pessoa");
  const ignorar = reuniaoDoToken(req.nextUrl.searchParams.get("r"));
  try {
    const h = await horariosLivres({ pessoaId: pessoa && pessoa !== "qualquer" ? pessoa : null, ignorar });
    // `indisponiveis` tem nome de quem não pôde ser lido: fica no log do
    // servidor, não na tela pública.
    return NextResponse.json({ dias: h.dias, pessoas: h.pessoas }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[agenda] horários falharam:", e);
    return NextResponse.json({ error: "Não consegui carregar os horários agora. Tente de novo em instantes." }, { status: 500 });
  }
}
