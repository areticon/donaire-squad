export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { vagasDeFundador } from "@/lib/stripe";

/**
 * Quantas vagas de fundador restam, para as telas de cliente (/planos e
 * /billing) que não podem importar lib/stripe. Pública de propósito: o
 * número aparece na landing de qualquer jeito.
 */
export async function GET() {
  return NextResponse.json({ vagas: await vagasDeFundador() });
}
