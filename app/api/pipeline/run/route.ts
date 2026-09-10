export const dynamic = "force-dynamic";

// Esta rota nao trabalha mais: ela valida, abre a execucao e poe os dias na
// fila. O tempo dela e de segundos, e por isso nao tem mais teto grande. Quem
// gera cada dia e `/api/cron/fila`, com os proprios 800 s por dia.
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { agendarCampanha } from "@/lib/pipeline/executar";

/**
 * Pedido de campanha.
 *
 * O corpo e a resposta continuam os mesmos que a tela sempre mandou e leu, de
 * proposito: a mudanca de 10/09 e de dentro (a semana virou fila) e nao devia
 * pedir nada de novo a quem chama.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, topic, campaignConfig } = await req.json();

  const r = await agendarCampanha({ userId, projectId, topic, campaignConfig });
  if (!r.ok) {
    return NextResponse.json(
      { error: r.error, necessario: r.necessario, disponivel: r.disponivel },
      { status: r.status }
    );
  }

  // A execucao inteira, como sempre foi: a tela do Gestor le `run.status` dela.
  return NextResponse.json({ run: r.run, dias: r.dias });
}
