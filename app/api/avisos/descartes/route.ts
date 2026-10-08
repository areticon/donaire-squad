export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { responderAosDescartes } from "@/lib/avisos/rota-dos-descartes";

/**
 * O DESCARTE DOS AVISOS DAS TELAS (07/10/2026), lembrado por pessoa. A regra
 * mora em lib/avisos/rota-dos-descartes.ts; aqui só a sessão. O userId é
 * sempre o de quem está logado, nunca o do corpo.
 */
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  const r = await responderAosDescartes({ metodo: "GET", userId, consulta: req.nextUrl.searchParams.getAll("c") });
  return NextResponse.json(r.corpo, { status: r.status });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  const r = await responderAosDescartes({ metodo: "POST", userId, contentType: req.headers.get("content-type"), corpo: () => req.json() });
  return NextResponse.json(r.corpo, { status: r.status });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  const r = await responderAosDescartes({ metodo: "DELETE", userId, contentType: req.headers.get("content-type"), corpo: () => req.json() });
  return NextResponse.json(r.corpo, { status: r.status });
}
