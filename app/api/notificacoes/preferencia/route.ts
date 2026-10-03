export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";

/**
 * O INTERRUPTOR DOS E-MAILS DE AVISO (02/10/2026), em Configurações.
 * Desligado, saem só os e-mails de aprovação (roteiro, peças da semana); o
 * do vídeo pronto deixa de sair. O sino recebe tudo, sempre.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { emailsDeAviso: true } });
  return NextResponse.json({ emailsDeAviso: u?.emailsDeAviso ?? true });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const corpo = (await req.json().catch(() => ({}))) as { emailsDeAviso?: unknown };
  if (typeof corpo.emailsDeAviso !== "boolean") return NextResponse.json({ error: "emailsDeAviso precisa ser verdadeiro ou falso." }, { status: 400 });
  await prisma.user.update({ where: { id: userId }, data: { emailsDeAviso: corpo.emailsDeAviso } });
  return NextResponse.json({ ok: true, emailsDeAviso: corpo.emailsDeAviso });
}
