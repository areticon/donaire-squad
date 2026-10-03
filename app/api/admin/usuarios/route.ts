export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/admin/guarda";
import { convidar, RecusaDoAdmin } from "@/lib/admin/acoes";

/** Convida uma pessoa: cria a conta e manda o link para ela escolher a senha. */
export async function POST(req: NextRequest) {
  const admin = await exigirAdmin();
  // 404 e não 403: a existência da rota não é assunto de quem não pode usá-la.
  if (!admin) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  try {
    const { email, nome, papel } = (await req.json()) as { email?: string; nome?: string; papel?: string };
    const id = await convidar(admin, email ?? "", nome ?? "", papel === "admin" ? "admin" : "user");
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    if (err instanceof RecusaDoAdmin) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("[admin/usuarios] convite", err);
    return NextResponse.json({ error: "Falha ao convidar. Nada foi criado pela metade: confira a lista." }, { status: 500 });
  }
}
