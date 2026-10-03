export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { RecusaDaEquipe, aceitarConvite } from "@/lib/equipe/convites";

/**
 * O ACEITE DO CONVITE (01/10). Precisa de sessão com o MESMO e-mail do convite;
 * as travas estão em lib/equipe/convites.ts (aceitarConvite).
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Entre na sua conta para aceitar." }, { status: 401 });
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (!token) return NextResponse.json({ error: "Convite inválido." }, { status: 400 });
  try {
    await aceitarConvite(token, userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof RecusaDaEquipe) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[equipe/aceitar]", e);
    return NextResponse.json({ error: "Não consegui aceitar agora. Tente de novo em um minuto." }, { status: 500 });
  }
}
