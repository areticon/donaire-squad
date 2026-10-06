export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/admin/guarda";
import { lerFicha } from "@/lib/admin/crm";
import {
  RecusaDoAdmin,
  ajustarCreditos,
  cancelarNoFim,
  definirAcessosExtras,
  excluirConta,
  marcarEquipe,
  mudarNome,
  mudarPapel,
  planoDeCortesia,
  reembolsarECancelar,
  reenviarLinkDeSenha,
} from "@/lib/admin/acoes";

type Ctx = { params: Promise<{ id: string }> };

/** A ficha da conta: assinatura, regra de reembolso, extrato e histórico. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  if (!(await exigirAdmin())) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const { id } = await params;
  const ficha = await lerFicha(id);
  if (!ficha) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
  return NextResponse.json(ficha);
}

/**
 * Uma ação sobre a conta. Cada uma tem a sua trava em lib/admin/acoes.ts, e é
 * lá que mora o porquê; aqui só se despacha e se traduz a recusa em 400.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const admin = await exigirAdmin();
  if (!admin) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const { id } = await params;
  const b = (await req.json()) as Record<string, unknown>;
  const texto = (k: string) => (typeof b[k] === "string" ? (b[k] as string) : "");
  try {
    switch (b.acao) {
      case "creditos":
        await ajustarCreditos(admin, id, Number(b.quantidade), texto("motivo"));
        break;
      case "papel":
        await mudarPapel(admin, id, b.papel === "admin" ? "admin" : "user");
        break;
      case "equipe":
        await marcarEquipe(admin, id, b.equipe === true);
        break;
      case "nome":
        await mudarNome(admin, id, texto("nome"));
        break;
      case "cortesia": {
        const plano = texto("plano");
        if (!["free", "pro", "business", "studio"].includes(plano)) throw new RecusaDoAdmin("Plano inválido.");
        await planoDeCortesia(admin, id, plano as "free" | "pro" | "business" | "studio", texto("motivo"));
        break;
      }
      case "acessos_extras":
        await definirAcessosExtras(admin, id, Number(b.quantidade), texto("motivo"));
        break;
      case "cancelar_no_fim":
        await cancelarNoFim(admin, id, Boolean(b.desfazer));
        break;
      case "reembolsar":
        await reembolsarECancelar(admin, id, texto("motivo"), Boolean(b.excecao));
        break;
      case "link_de_senha":
        await reenviarLinkDeSenha(admin, id);
        break;
      case "excluir":
        await excluirConta(admin, id, texto("confirmacao"));
        return NextResponse.json({ ok: true, excluida: true });
      default:
        return NextResponse.json({ error: "Ação desconhecida" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, ficha: await lerFicha(id) });
  } catch (err) {
    if (err instanceof RecusaDoAdmin) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(`[admin/usuarios] ${String(b.acao)} em ${id}`, err);
    const msg = err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ error: `Falhou: ${msg}` }, { status: 500 });
  }
}
