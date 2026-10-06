export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/admin/guarda";
import { prisma } from "@/lib/db/prisma";
import { provedorDeAssinatura } from "@/lib/contratos/assinatura";
import { documentoDoContrato } from "@/lib/contratos/contratos";

type Ctx = { params: Promise<{ id: string }> };

/**
 * O CONTRATO COMO VAI (ou foi) PARA ASSINATURA, para o admin conferir antes
 * de enviar. Desde 05/10 é o MESMO PDF que o cliente recebe (capa com a
 * logomarca, tabelas, rodapé com página N de M), impresso na hora pelo worker.
 * Se o worker não imprimir, volta o texto em Markdown, como antes (e é isso
 * que o envio mandaria também). `?formato=texto` força o Markdown.
 *
 * O hash no cabeçalho é o mesmo que o envio grava: se ele mudar depois do
 * envio, o modelo mudou.
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  if (!(await exigirAdmin())) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const { id } = await params;
  const c = await prisma.contrato.findUnique({ where: { id } });
  if (!c) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
  const soTexto = req.nextUrl.searchParams.get("formato") === "texto";
  // Os acessos extras são os do contrato (04/10), e não os da conta hoje.
  const d = soTexto ? { ...(await import("@/lib/contratos/contratos")).textoDoContrato(c), pdf: null } : await documentoDoContrato(c, { teste: provedorDeAssinatura()?.ambiente === "teste" });
  const cabecalhos = { "X-Hash-Do-Texto": d.hash, "X-Versao-Do-Modelo": encodeURIComponent(d.versao), "Cache-Control": "no-store" };
  if (d.pdf) {
    return new NextResponse(new Uint8Array(d.pdf), {
      headers: { ...cabecalhos, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="contrato-demandou-${String(c.numero).padStart(4, "0")}.pdf"` },
    });
  }
  return new NextResponse(d.texto, { headers: { ...cabecalhos, "Content-Type": "text/plain; charset=utf-8" } });
}
