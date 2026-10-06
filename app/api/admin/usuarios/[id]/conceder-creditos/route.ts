export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/admin/guarda";
import { lerFicha } from "@/lib/admin/crm";
import { RecusaDoAdmin } from "@/lib/admin/acoes";
import { concederCreditos } from "@/lib/admin/conceder-creditos";

type Ctx = { params: Promise<{ id: string }> };

/**
 * CONCEDER CRÉDITOS (06/10). Rota própria, e não mais um `case` na rota da
 * ficha, para a ação viver separada do resto do painel. As travas moram em
 * lib/admin/conceder-creditos.ts; aqui só o papel e a tradução da recusa.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const admin = await exigirAdmin();
  if (!admin) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const r = await concederCreditos(admin, id, { quantidade: b.quantidade, motivo: b.motivo, chave: b.chave });
    // A ficha é só para a tela se atualizar: se a leitura falhar, o crédito já está feito.
    return NextResponse.json({ ok: true, ...r, ficha: await lerFicha(id).catch(() => null) });
  } catch (err) {
    if (err instanceof RecusaDoAdmin) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(`[admin/conceder-creditos] em ${id}`, err);
    return NextResponse.json({ error: "Não consegui conceder agora. Nada foi creditado; tente de novo." }, { status: 500 });
  }
}
