export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { exigirAdmin } from "@/lib/admin/guarda";
import { lerEstadoDoOAuth } from "@/lib/agenda/segredos";
import { trocarCodigo } from "@/lib/agenda/google";

/**
 * A VOLTA DO GOOGLE (01/10): guarda o token de renovação cifrado na pessoa
 * do time. A primeira conta conectada vira a principal (onde o evento nasce)
 * e entra com a agenda "primary"; as agendas de outras empresas se acrescentam
 * depois, no /admin/agenda.
 *
 * Esta URI tem de estar cadastrada, igual, no cliente OAuth do Google Cloud:
 * https://demandou.com/api/admin/agenda/google/callback
 */
export async function GET(req: NextRequest) {
  const volta = (msg: string) => NextResponse.redirect(new URL(`/admin/agenda?google=${encodeURIComponent(msg)}`, req.url));
  const admin = await exigirAdmin();
  if (!admin) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const erro = req.nextUrl.searchParams.get("error");
  if (erro) return volta(`O Google recusou: ${erro}`);
  const estado = lerEstadoDoOAuth(req.nextUrl.searchParams.get("state"));
  const codigo = req.nextUrl.searchParams.get("code");
  if (!estado || estado.adminId !== admin.id || !codigo) return volta("Link de conexão vencido. Tente de novo.");

  try {
    const { email, refreshTokenCifrado, escopos } = await trocarCodigo(codigo);
    const outras = await prisma.contaGoogleDoTime.count({ where: { pessoaId: estado.pessoaId, emailGoogle: { not: email } } });
    await prisma.contaGoogleDoTime.upsert({
      where: { pessoaId_emailGoogle: { pessoaId: estado.pessoaId, emailGoogle: email } },
      create: { pessoaId: estado.pessoaId, emailGoogle: email, refreshTokenCifrado, escopos, agendas: ["primary"], principal: outras === 0 },
      update: { refreshTokenCifrado, escopos, ultimoErro: null, ultimoErroEm: null },
    });
    return volta(`Conta ${email} conectada.`);
  } catch (e) {
    console.error("[agenda/google] conexão falhou:", e);
    return volta(e instanceof Error ? e.message : "A conexão falhou.");
  }
}
