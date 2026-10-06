export const dynamic = "force-dynamic";
// O briefing é uma chamada ao modelo: cabe no teto das rotas de texto.
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/admin/guarda";
import { RecusaDoDev, aprovarMelhoria, descartarGrupo, gerarBriefing, mudarSituacaoDoGrupo } from "@/lib/feedback/painel";

type Ctx = { params: Promise<{ id: string }> };

/**
 * AS AÇÕES DO ADMIN NUM GRUPO DE FEEDBACK (06/10/2026): aprovar a melhoria
 * (grava quem e quando, e o Davi Dev escreve o briefing), descartar ("não é
 * produto"), reescrever o briefing, marcar como feito e reabrir. Papel de
 * admin lido do banco a cada chamada; quem não é admin recebe 404. Nenhuma
 * ação daqui edita código.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const admin = await exigirAdmin();
  if (!admin) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { acao?: string };
  try {
    switch (b.acao) {
      case "aprovar":
        return NextResponse.json(await aprovarMelhoria(admin, id));
      case "descartar":
        return NextResponse.json(await descartarGrupo(admin, id));
      case "briefing":
        return NextResponse.json({ briefing: await gerarBriefing(id) });
      case "feito":
        return NextResponse.json(await mudarSituacaoDoGrupo(admin, id, "feito"));
      case "reabrir":
        return NextResponse.json(await mudarSituacaoDoGrupo(admin, id, "aberto"));
      default:
        return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof RecusaDoDev) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[admin/dev] ação falhou:", e);
    return NextResponse.json({ error: "Não consegui gravar. Tente de novo em instantes." }, { status: 500 });
  }
}
