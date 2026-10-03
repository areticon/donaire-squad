export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/admin/guarda";
import { RecusaDoChamado, marcarReclamacao, mudarStatusDoChamado, notaInterna, responderChamado } from "@/lib/suporte/chamados";
import { ehStatus } from "@/lib/suporte/regras";

type Ctx = { params: Promise<{ id: string }> };

/**
 * As ações do suporte num chamado: responder (vai por e-mail ao cliente),
 * mudar o status, marcar como reclamação e nota interna. Papel de admin lido
 * do banco a cada chamada; quem não é admin recebe 404.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const admin = await exigirAdmin();
  if (!admin) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { acao?: string; texto?: string; status?: string; reclamacao?: boolean };
  try {
    switch (b.acao) {
      case "responder":
        return NextResponse.json(await responderChamado(admin, id, String(b.texto ?? ""), ehStatus(b.status) ? b.status : null));
      case "status":
        if (!ehStatus(b.status)) return NextResponse.json({ error: "Status inválido." }, { status: 400 });
        return NextResponse.json(await mudarStatusDoChamado(admin, id, b.status));
      case "reclamacao":
        return NextResponse.json(await marcarReclamacao(admin, id, Boolean(b.reclamacao)));
      case "nota":
        return NextResponse.json(await notaInterna(admin, id, String(b.texto ?? "")));
      default:
        return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof RecusaDoChamado) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
