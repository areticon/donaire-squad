export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { esquecerLead } from "@/lib/agenda/lead";

/**
 * "NÃO É VOCÊ?" (01/10): computador compartilhado ou o lead que quer marcar
 * com outro e-mail. Apaga o cookie do lead e volta ao formulário.
 */
export async function GET(req: NextRequest) {
  return esquecerLead(NextResponse.redirect(new URL("/demonstracao", req.url)));
}
