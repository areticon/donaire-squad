export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { contratoDoOnboarding, marcarOnboarding } from "@/lib/agenda/onboarding";
import { ErroDeAgenda } from "@/lib/agenda/reunioes";
import { extrairIp, hashIp } from "@/lib/demo/rate-limit";

/**
 * MARCAR O ONBOARDING DO CLIENTE (05/10/2026).
 *
 * QUEM MARCA É O CONTRATO DO TOKEN DA URL, nunca um e-mail no corpo: o token
 * assinado é a autorização, e o cliente só marca o próprio onboarding.
 * Remarcar e cancelar usam a rota da reunião (/api/agenda/reunioes/[token]),
 * que já serve aos dois tipos.
 */

const LIMITE_POR_HORA = 10;
const janela = new Map<string, { n: number; desde: number }>();

type Ctx = { params: Promise<{ token: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const ip = hashIp(extrairIp(req.headers));
  const agora = Date.now();
  const atual = janela.get(ip);
  if (!atual || agora - atual.desde > 3_600_000) janela.set(ip, { n: 1, desde: agora });
  else if (atual.n >= LIMITE_POR_HORA) return NextResponse.json({ error: "Muitas tentativas. Tente de novo em uma hora." }, { status: 429 });
  else atual.n += 1;

  const { token } = await params;
  const c = await contratoDoOnboarding(token);
  if (!c) return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  try {
    const corpo = (await req.json()) as Record<string, unknown>;
    if (typeof corpo.inicio !== "string") return NextResponse.json({ error: "Escolha um horário." }, { status: 400 });
    const r = await marcarOnboarding(c, corpo.inicio);
    return NextResponse.json({ ok: true, reuniao: r });
  } catch (e) {
    if (e instanceof ErroDeAgenda) return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status });
    console.error("[onboarding] marcar falhou:", e);
    return NextResponse.json({ error: "Não consegui marcar agora. Tente de novo em instantes." }, { status: 500 });
  }
}
