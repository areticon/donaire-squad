export const dynamic = "force-dynamic";
// O diretor e o revisor de cada corte em paralelo: cerca de 2 a 4 minutos.
export const maxDuration = 800;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { RecusaDoRoteiro } from "@/lib/media/roteiro-da-edicao";
import { replanejarCortesNoEstilo } from "@/lib/media/replanejar-no-estilo";

/**
 * "Replanejar no estilo novo" (01/10, decisão do Bruno: trocar de estilo e
 * refazer replaneja). Com a reedição aberta, os cortes planejados em outro
 * estilo ganham plano novo no rascunho; o "Refazer com estes ajustes" gera.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json({ tela: await replanejarCortesNoEstilo(id, userId) });
  } catch (e) {
    if (e instanceof RecusaDoRoteiro) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(`[roteiro/replanejar][${id}]`, e);
    return NextResponse.json({ error: "Não consegui replanejar agora. Nada foi cobrado: tente de novo em um minuto." }, { status: 500 });
  }
}
