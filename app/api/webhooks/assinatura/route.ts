export const dynamic = "force-dynamic";

import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { provedorDeAssinatura } from "@/lib/contratos/assinatura";
import { sincronizarComProvedor } from "@/lib/contratos/contratos";

/**
 * O AVISO DO PROVEDOR DE ASSINATURA (02/10/2026): "o documento mudou".
 *
 * A ZapSign não assina o webhook (não há HMAC); a proteção é o cabeçalho
 * X-Demandou-Segredo, que cadastramos no próprio webhook com o valor de
 * ASSINATURA_WEBHOOK_SEGREDO. E O CORPO NUNCA É CONFIADO: ele só diz qual
 * documento olhar; a situação é RECONSULTADA na API do provedor antes de
 * marcar qualquer coisa como assinada.
 *
 * Responde 200 sempre que o pedido for legítimo, mesmo sem nada a fazer: o
 * provedor reenvia o que não recebe 200, e reenvio vira duplicata.
 */
function segredoConfere(recebido: string | null): boolean {
  const esperado = process.env.ASSINATURA_WEBHOOK_SEGREDO;
  if (!esperado || !recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!segredoConfere(req.headers.get("x-demandou-segredo"))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const provedor = provedorDeAssinatura();
  if (!provedor) return NextResponse.json({ ok: true, ignorado: "sem provedor ligado" });
  const corpo = await req.json().catch(() => null);
  const aviso = provedor.lerWebhook(corpo);
  if (!aviso) return NextResponse.json({ ok: true, ignorado: "corpo sem documento" });

  const c = await prisma.contrato.findFirst({
    where: { provedorDocumentoId: aviso.documentoId, ...(aviso.externoId ? { id: aviso.externoId } : {}) },
    select: { id: true },
  });
  if (!c) {
    // O ADITIVO (04/10) vai pelo mesmo provedor e volta pelo mesmo webhook.
    const { aditivoDoDocumento, sincronizarAditivo } = await import("@/lib/contratos/aditivos");
    const ad = await aditivoDoDocumento(aviso.documentoId, aviso.externoId);
    if (!ad) return NextResponse.json({ ok: true, ignorado: "documento desconhecido" });
    try {
      const r = await sincronizarAditivo("provedor", ad.id);
      return NextResponse.json({ ok: true, evento: aviso.evento, aditivo: ad.id, ...r });
    } catch (e) {
      console.error("[assinatura] webhook do aditivo não sincronizou:", e);
      return NextResponse.json({ error: "falha ao sincronizar" }, { status: 500 });
    }
  }
  try {
    const r = await sincronizarComProvedor("provedor", c.id);
    return NextResponse.json({ ok: true, evento: aviso.evento, ...r });
  } catch (e) {
    console.error("[assinatura] webhook não sincronizou:", e);
    // 500 de propósito: o provedor tenta de novo mais tarde.
    return NextResponse.json({ error: "falha ao sincronizar" }, { status: 500 });
  }
}
