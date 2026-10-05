export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/admin/guarda";
import { RecusaDoContrato, criarContrato } from "@/lib/contratos/contratos";
import { condicaoDoCorpo, descontoDoCorpo } from "@/lib/contratos/formulario";

/**
 * Cria um contrato (rascunho) para a conta de um cliente, ou para um PROSPECT
 * (04/10): sem `userId`, vale `prospectEmail` e `prospectNome`, e a conta nasce
 * sem senha e sem plano. Só admin.
 *
 * O VALOR (04/10) não é mais digitado: nasce do plano e dos acessos extras
 * pelo preço de tabela, menos o desconto (`descontoTipo`, `descontoValor`,
 * `descontoMotivo`, `descontoObservacao`), com os tetos de lib/contratos/preco.
 */
export async function POST(req: NextRequest) {
  const admin = await exigirAdmin();
  if (!admin) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const s = (k: string) => (typeof b[k] === "string" && (b[k] as string).trim() ? (b[k] as string).trim() : null);
  const inicio = s("inicioVigencia");
  try {
    const c = await criarContrato(admin, {
      userId: s("userId"),
      prospect: s("userId") ? null : s("prospectEmail") ? { email: s("prospectEmail")!, nome: s("prospectNome") } : null,
      acessosExtras: b.acessosExtras === undefined || b.acessosExtras === "" || b.acessosExtras === null ? null : Number(b.acessosExtras),
      plano: s("plano") ?? "",
      desconto: descontoDoCorpo(b),
      fundador: b.fundador === true || b.fundador === "on",
      inicioVigencia: inicio ? new Date(`${inicio}T12:00:00-03:00`) : null,
      formaDePagamento: s("formaDePagamento"),
      empresa: s("empresa"),
      endereco: s("endereco"),
      signatarioNome: s("signatarioNome"),
      signatarioEmail: s("signatarioEmail"),
      signatarioDocumento: s("signatarioDocumento"),
      renovacaoAutomatica: b.renovacaoAutomatica !== false,
      observacao: s("observacao"),
      // Entrada no Pix + parcelas no cartão (05/10); sem o campo, à vista.
      condicao: condicaoDoCorpo(b) ?? null,
    });
    return NextResponse.json({ id: c.id, numero: c.numero, userId: c.userId });
  } catch (e) {
    if (e instanceof RecusaDoContrato) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
