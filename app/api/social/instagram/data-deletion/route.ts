export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { parseSignedRequest } from "@/lib/oauth/instagram";

/**
 * Callback de exclusão de dados exigido pela Meta no cadastro do app.
 *
 * O que temos de dados do Instagram de um usuário: a linha em SocialAccount
 * (token, username, id). A exclusão aqui remove tudo isso. Os posts do
 * cliente são dele e ficam, conforme os Termos (seção 10.2).
 *
 * O contrato da Meta pede na resposta uma URL de acompanhamento e um código
 * de confirmação; a URL aponta para a política de privacidade, onde o
 * processo está descrito.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const signedRequest = form?.get("signed_request");
  if (typeof signedRequest !== "string") {
    return NextResponse.json({ error: "signed_request ausente" }, { status: 400 });
  }

  const payload = parseSignedRequest(signedRequest);
  if (!payload?.user_id) {
    return NextResponse.json({ error: "assinatura inválida" }, { status: 400 });
  }

  const igUserId = String(payload.user_id);
  await prisma.socialAccount.deleteMany({
    where: { platform: "instagram", platformUserId: igUserId },
  });

  const confirmationCode = `ig-del-${igUserId}-${Date.now().toString(36)}`;
  return NextResponse.json({
    url: `${process.env.NEXT_PUBLIC_APP_URL}/privacy`,
    confirmation_code: confirmationCode,
  });
}
