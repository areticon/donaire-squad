import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { COOKIE_DO_LEAD, VALIDADE_DO_LEAD_DIAS, leadDoToken, tokenDoLead } from "@/lib/agenda/segredos";

/**
 * A CONTINUIDADE DO LEAD (01/10): quem já deixou os dados na calculadora (ou
 * em qualquer captura que grava o Lead) chega ao agendamento identificado e
 * não preenche nada de novo.
 *
 * O NAVEGADOR GUARDA SÓ O ID ASSINADO, num cookie httpOnly: nem o e-mail cru
 * na URL (que vaza em histórico, em print e no Referer) nem nada que o
 * JavaScript da página consiga ler. O mesmo token também vale como `?l=` na
 * URL, para link de e-mail que abre em outro aparelho.
 */

/** Grava o cookie do lead na resposta de uma rota que acabou de salvar o Lead. */
export function lembrarLead(res: NextResponse, leadId: string): NextResponse {
  res.cookies.set(COOKIE_DO_LEAD, tokenDoLead(leadId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: VALIDADE_DO_LEAD_DIAS * 86400,
  });
  return res;
}

export function esquecerLead(res: NextResponse): NextResponse {
  res.cookies.set(COOKIE_DO_LEAD, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}

/** O id do lead desta requisição: primeiro o token da URL, depois o cookie. */
export async function idDoLeadAtual(tokenDaUrl?: string | null): Promise<string | null> {
  const daUrl = leadDoToken(tokenDaUrl);
  if (daUrl) return daUrl;
  try {
    return leadDoToken((await cookies()).get(COOKIE_DO_LEAD)?.value);
  } catch {
    return null;
  }
}

/** Os campos do portão da calculadora: com todos, o lead vai direto ao calendário. */
export const CAMPOS_DO_PORTAO = ["faturamento", "tamanhoTime", "setor", "cargo", "telefone", "consentimentoEm"] as const;
export type CampoDoPortao = (typeof CAMPOS_DO_PORTAO)[number];

export async function leadAtual(tokenDaUrl?: string | null) {
  const id = await idDoLeadAtual(tokenDaUrl);
  if (!id) return null;
  const lead = await prisma.lead.findUnique({
    where: { id },
    select: {
      id: true, email: true, nome: true, telefone: true, cargo: true, setor: true, faturamento: true,
      tamanhoTime: true, consentimentoEm: true, empresa: true,
    },
  });
  if (!lead) return null;
  const faltam = CAMPOS_DO_PORTAO.filter((c) => !lead[c]);
  return { ...lead, faltam };
}

/** Faixas de faturamento que a Demandou atende (as mesmas de app/api/demonstracao). */
export const FAIXAS_ATENDIDAS = new Set(["100k_500k", "500k_1m", "acima_1m"]);

/**
 * Lead de TESTE: e-mail no domínio reservado .invalid (RFC 2606), que não
 * existe e nunca recebe nada. A prova de ponta a ponta usa isso, e o sistema
 * não manda e-mail real para nenhum dos lados dessa reunião.
 */
export function ehLeadDeTeste(email: string): boolean {
  return /\.invalid$/i.test(email.trim());
}
