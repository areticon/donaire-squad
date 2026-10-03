export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/admin/guarda";
import {
  RecusaDoContrato,
  anexarPdf,
  cancelarContrato,
  enviarParaAssinar,
  marcarAssinado,
  renovarContrato,
  sincronizarComProvedor,
} from "@/lib/contratos/contratos";

type Ctx = { params: Promise<{ id: string }> };

const PDF_MAXIMO = 4 * 1024 * 1024;

/**
 * As ações sobre um contrato: enviar para assinar, reconsultar o provedor,
 * marcar assinado à mão (com o PDF, quando a assinatura foi por fora),
 * anexar o PDF, cancelar e renovar. Cada uma grava na trilha de auditoria.
 * JSON, ou multipart quando leva PDF.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const admin = await exigirAdmin();
  if (!admin) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const { id } = await params;

  let b: Record<string, unknown> = {};
  let pdf: File | null = null;
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData();
    form.forEach((v, k) => {
      if (typeof v === "string") b[k] = v;
      else if (k === "pdf" && v.size > 0) pdf = v;
    });
  } else {
    b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  }
  const arquivo = pdf as File | null;
  if (arquivo && (arquivo.type !== "application/pdf" || arquivo.size > PDF_MAXIMO)) {
    return NextResponse.json({ error: "O arquivo precisa ser PDF de até 4 MB." }, { status: 400 });
  }

  try {
    switch (b.acao) {
      case "enviar":
        return NextResponse.json(await enviarParaAssinar(admin, id));
      case "sincronizar":
        return NextResponse.json(await sincronizarComProvedor(admin, id));
      case "assinar_manual": {
        const quando = typeof b.assinadoEm === "string" && b.assinadoEm ? new Date(`${b.assinadoEm}T12:00:00-03:00`) : undefined;
        return NextResponse.json(await marcarAssinado(admin, id, { assinadoEm: quando, pdf: arquivo, origem: "manual" }));
      }
      case "anexar_pdf":
        if (!arquivo) return NextResponse.json({ error: "Escolha o PDF." }, { status: 400 });
        return NextResponse.json(await anexarPdf(admin, id, arquivo));
      case "cancelar":
        return NextResponse.json(await cancelarContrato(admin, id, String(b.motivo ?? "")));
      case "renovar":
        return NextResponse.json(await renovarContrato(admin, id, b.valorCentavos ? Number(b.valorCentavos) : null));
      default:
        return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof RecusaDoContrato) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
