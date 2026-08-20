export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { parseSignedRequest } from "@/lib/oauth/instagram";

/**
 * A Meta chama esta URL quando o usuário remove o app nas configurações do
 * Instagram. O token dele morreu do lado de lá; aqui a conexão é desativada
 * para a tela do projeto refletir a realidade em vez de falhar na publicação.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const signedRequest = form?.get("signed_request");
  if (typeof signedRequest !== "string") {
    return NextResponse.json({ error: "signed_request ausente" }, { status: 400 });
  }

  const payload = parseSignedRequest(signedRequest);
  if (!payload?.user_id) {
    // Assinatura inválida: não é a Meta falando. Não tocar em nada.
    return NextResponse.json({ error: "assinatura inválida" }, { status: 400 });
  }

  await prisma.socialAccount.updateMany({
    where: { platform: "instagram", platformUserId: String(payload.user_id) },
    data: { isActive: false, accessToken: null, tokenExpiresAt: null },
  });

  return NextResponse.json({ ok: true });
}
