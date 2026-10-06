export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/admin/guarda";
import { RecusaDoContrato } from "@/lib/contratos/contratos";
import { definirContato, enviarEmailDeFup, montarWhatsappAutomatico, pausarAutomatico, prepararWhatsapp, registrarFup } from "@/lib/contratos/cobrancas";

type Ctx = { params: Promise<{ id: string }> };

/**
 * AS AÇÕES DA COBRANÇA de um contrato (05/10/2026), cada uma na trilha:
 *  - "fup": registra um acompanhamento feito (canal, resultado, observação);
 *  - "contato": o telefone do cliente e o closer responsável;
 *  - "whatsapp": monta a mensagem, registra o acompanhamento e devolve o
 *    link wa.me para o vendedor mandar do celular;
 *  - "email": manda agora o e-mail de acompanhamento (de verdade);
 *  - "pausar" e "retomar": o acompanhamento automático deste contrato;
 *  - "whatsapp_automatico": só monta o texto que sairia (gancho, sem envio).
 * JSON. Só admin.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const admin = await exigirAdmin();
  if (!admin) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    switch (b.acao) {
      case "fup":
        return NextResponse.json(await registrarFup(admin, id, { canal: b.canal, resultado: b.resultado, observacao: b.observacao }));
      case "contato":
        return NextResponse.json(await definirContato(admin, id, { telefone: b.telefone, closerEmail: b.closerEmail }));
      case "whatsapp":
        return NextResponse.json(await prepararWhatsapp(admin, id));
      case "email":
        return NextResponse.json(await enviarEmailDeFup(admin, id));
      case "pausar":
        return NextResponse.json(await pausarAutomatico(admin, id, true, b.motivo));
      case "retomar":
        return NextResponse.json(await pausarAutomatico(admin, id, false, b.motivo));
      case "whatsapp_automatico":
        return NextResponse.json(await montarWhatsappAutomatico(id));
      default:
        return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof RecusaDoContrato) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
