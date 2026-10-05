export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/admin/guarda";
import { prisma } from "@/lib/db/prisma";
import { RecusaDoContrato } from "@/lib/contratos/contratos";
import { aprovarDescontoDoAditivo, cancelarAditivo, enviarAditivo, marcarAditivoAssinado, sincronizarAditivo } from "@/lib/contratos/aditivos";
import { gerarLinkDePagamento, registrarPagamento } from "@/lib/contratos/pagamento";
import { dataDoTexto, numeroDoTexto } from "@/lib/contratos/formulario";

type Ctx = { params: Promise<{ id: string; aditivoId: string }> };

const PDF_MAXIMO = 4 * 1024 * 1024;

/**
 * As ações sobre um ADITIVO (04/10/2026): enviar para assinar (o mesmo
 * provedor do contrato), reconsultar, marcar assinado à mão (com o PDF),
 * registrar o pagamento da diferença (com o comprovante) ou gerar o link do
 * Stripe, aprovar o desconto (só o dono) e cancelar. Cada uma grava na trilha
 * do contrato. JSON, ou multipart quando leva arquivo.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const admin = await exigirAdmin();
  if (!admin) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const { id, aditivoId } = await params;
  const dono = await prisma.aditivoDoContrato.findFirst({ where: { id: aditivoId, contratoId: id }, select: { id: true } });
  if (!dono) return NextResponse.json({ error: "Aditivo não encontrado." }, { status: 404 });

  let b: Record<string, unknown> = {};
  let pdf: File | null = null;
  let comprovante: File | null = null;
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData();
    form.forEach((v, k) => {
      if (typeof v === "string") b[k] = v;
      else if (k === "pdf" && v.size > 0) pdf = v;
      else if (k === "comprovante" && v.size > 0) comprovante = v;
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
        return NextResponse.json(await enviarAditivo(admin, aditivoId));
      case "sincronizar":
        return NextResponse.json(await sincronizarAditivo(admin, aditivoId));
      case "assinar_manual":
        return NextResponse.json(await marcarAditivoAssinado(admin, aditivoId, { assinadoEm: dataDoTexto(b.assinadoEm) ?? undefined, pdf: arquivo, origem: "manual" }));
      case "pagamento":
        return NextResponse.json(
          await registrarPagamento(admin, id, {
            aditivoId,
            valorCentavos: Math.round(numeroDoTexto(b.valorReais) * 100),
            pagoEm: dataDoTexto(b.pagoEm) ?? new Date(NaN),
            forma: String(b.forma ?? ""),
            comprovante: comprovante as File | null,
            observacao: typeof b.observacao === "string" ? b.observacao : null,
          })
        );
      case "link_pagamento":
        return NextResponse.json(await gerarLinkDePagamento(admin, id, req.nextUrl.origin, aditivoId));
      case "aprovar_desconto":
        return NextResponse.json(await aprovarDescontoDoAditivo(admin, aditivoId));
      case "cancelar":
        return NextResponse.json(await cancelarAditivo(admin, aditivoId, String(b.motivo ?? "")));
      default:
        return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof RecusaDoContrato) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
