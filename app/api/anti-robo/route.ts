export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { emitirCarimbo } from "@/lib/anti-robo/carimbo";

/**
 * O CARIMBO DE TEMPO DOS FORMULÁRIOS PÚBLICOS (01/10).
 *
 * A tela pede um carimbo assim que abre, e devolve junto do envio. Ver
 * lib/anti-robo/carimbo.ts. Não toca no banco: é só uma assinatura com o
 * segredo, então pedir mil carimbos não custa nada a ninguém.
 *
 * `no-store` porque um carimbo guardado em cache seria o mesmo para todo
 * mundo, com a hora de quem pediu primeiro.
 */
export function GET() {
  return NextResponse.json(
    { carimbo: emitirCarimbo() },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
