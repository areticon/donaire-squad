export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";

/**
 * Os dados da conta que a pessoa pode mudar sozinha.
 *
 * Só o nome, de propósito. E-mail é identidade de login e trocar exige
 * reverificação, que é fluxo próprio; senha vive no better-auth. O nome é o que
 * aparece nos e-mails que a plataforma manda, então é o que dava incômodo real.
 */
export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const corpo = (await req.json()) as { name?: unknown };
  const nome = typeof corpo.name === "string" ? corpo.name.trim() : "";

  if (nome.length < 2 || nome.length > 80) {
    return NextResponse.json(
      { error: "O nome precisa ter de 2 a 80 caracteres." },
      { status: 400 }
    );
  }

  await prisma.user.update({ where: { id: userId }, data: { name: nome } });
  return NextResponse.json({ ok: true, name: nome });
}
