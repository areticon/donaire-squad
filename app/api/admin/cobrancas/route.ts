export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/admin/guarda";
import { listaDeCobrancas, resumoDasCobrancas } from "@/lib/contratos/cobrancas";

/**
 * AS COBRANÇAS (05/10/2026): os contratos enviados sem assinatura, assinados
 * sem pagamento e com parcela em atraso, ordenados pelo acompanhamento mais
 * vencido, com o telefone do cliente, o closer e o próximo acompanhamento.
 * O mesmo que a aba /admin/contratos/cobrancas mostra. Só admin.
 */
export async function GET() {
  const admin = await exigirAdmin();
  if (!admin) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const lista = await listaDeCobrancas();
  return NextResponse.json({ resumo: resumoDasCobrancas(lista), cobrancas: lista });
}
